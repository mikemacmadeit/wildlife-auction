/**
 * Netlify Scheduled Function: Process Notification Events
 *
 * Runs frequently to process pending canonical events in `events/*`.
 * Concurrency-safe via Firestore transactions on each event doc.
 */

import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { processEventDoc } from '../../lib/notifications/processEvent';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';

const MAX_EVENTS_PER_RUN = 50;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 2 * 60_000; // 2 min lock by lastAttemptAt

const baseHandler: Handler = async () => {
  const db = getAdminDb();
  const startedAt = Date.now();
  let processed = 0;
  let failed = 0;
  let scanned = 0;

  try {
    const snap = await db
      .collection('events')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(MAX_EVENTS_PER_RUN)
      .get();

    scanned = snap.size;
    if (snap.empty) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, processed, failed }) };
    }

    for (const docSnap of snap.docs) {
      const ref = docSnap.ref;
      const data = docSnap.data() as any;
      const eventId = docSnap.id;

      // Claim event by transaction
      let claimed = false;
      let claimedData: any = null;
      try {
        await db.runTransaction(async (tx) => {
          const curSnap = await tx.get(ref);
          if (!curSnap.exists) return;
          const cur = curSnap.data() as any;
          if (cur.status !== 'pending') return;
          const attempts = Number(cur.processing?.attempts || 0);
          if (attempts >= MAX_ATTEMPTS) {
            tx.set(ref, { status: 'failed', processing: { ...(cur.processing || {}), error: 'Max attempts reached' } }, { merge: true });
            return;
          }
          const lastAttemptAt = cur.processing?.lastAttemptAt?.toDate?.() as Date | undefined;
          if (lastAttemptAt && Date.now() - lastAttemptAt.getTime() < LOCK_MS) return;

          tx.set(
            ref,
            {
              processing: {
                attempts: attempts + 1,
                lastAttemptAt: Timestamp.now(),
                error: cur.processing?.error || null,
              },
            },
            { merge: true }
          );
          claimed = true;
          claimedData = { ...cur, id: cur.id || eventId };
        });
      } catch (e: any) {
        logWarn('processNotificationEvents: claim failed', { eventId, error: String(e?.message || e) });
        continue;
      }

      if (!claimed || !claimedData) continue;

      try {
        const res = await processEventDoc({ db, eventRef: ref as any, eventData: claimedData });
        if (res.ok) processed++;
        else failed++;
      } catch (e: any) {
        failed++;
        try {
          await ref.set(
            {
              status: 'failed',
              processing: { ...(claimedData.processing || {}), error: String(e?.message || e) },
            },
            { merge: true }
          );
        } catch {}
        logError('processNotificationEvents: processing error', e, { eventId });
      }
    }

    logInfo('processNotificationEvents: completed', { scanned, processed, failed, ms: Date.now() - startedAt });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, processed, failed }) };
  } catch (e: any) {
    logError('processNotificationEvents: fatal error', e, { scanned, processed, failed });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || 'Unknown error' }) };
  }
};

// Every 2 minutes (fast enough for auctions)
export const handler = schedule('*/2 * * * *', baseHandler);

