/**
 * Netlify Scheduled Function: Dispatch Push Jobs
 *
 * Sends queued pushJobs via Firebase Admin FCM.
 */

import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAdminApp, getAdminDb } from '../../lib/firebase/admin';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';

const MAX_JOBS_PER_RUN = 100;
const MAX_ATTEMPTS = 5;

function backoffMs(attempt: number): number {
  const table = [0, 15_000, 60_000, 300_000, 900_000];
  return table[Math.min(attempt, table.length - 1)];
}

const baseHandler: Handler = async () => {
  const db = getAdminDb();
  const messaging = getMessaging(getAdminApp());
  const startedAt = Date.now();
  let scanned = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const snap = await db
      .collection('pushJobs')
      .where('status', '==', 'queued')
      .orderBy('createdAt', 'asc')
      .limit(MAX_JOBS_PER_RUN)
      .get();

    scanned = snap.size;
    if (snap.empty) return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, sent, failed, skipped }) };

    for (const jobSnap of snap.docs) {
      const ref = jobSnap.ref;
      const jobId = jobSnap.id;

      let claimed: any = null;
      try {
        await db.runTransaction(async (tx) => {
          const curSnap = await tx.get(ref);
          if (!curSnap.exists) return;
          const cur = curSnap.data() as any;
          if (cur.status !== 'queued') return;
          const attempts = Number(cur.attempts || 0);
          if (attempts >= MAX_ATTEMPTS) {
            tx.set(ref, { status: 'failed', error: 'Max attempts reached' }, { merge: true });
            return;
          }

          const deliverAfterAt = cur.deliverAfterAt?.toDate?.() as Date | undefined;
          if (deliverAfterAt && deliverAfterAt.getTime() > Date.now()) {
            skipped++;
            return;
          }

          const lastAttemptAt = cur.lastAttemptAt?.toDate?.() as Date | undefined;
          if (lastAttemptAt && Date.now() - lastAttemptAt.getTime() < backoffMs(attempts)) {
            skipped++;
            return;
          }

          tx.set(
            ref,
            {
              status: 'processing',
              attempts: attempts + 1,
              lastAttemptAt: Timestamp.now(),
            },
            { merge: true }
          );
          claimed = { id: jobId, ...cur, attempts: attempts + 1 };
        });
      } catch (e: any) {
        logWarn('dispatchPushJobs: claim failed', { jobId, error: String(e?.message || e) });
        continue;
      }

      if (!claimed) continue;

      try {
        const token = String(claimed.token || '');
        const payload = claimed.payload || {};
        if (!token) {
          await ref.set({ status: 'failed', error: 'Missing token' }, { merge: true });
          failed++;
          continue;
        }

        const title = String(payload.title || 'Wildlife Exchange');
        const body = String(payload.body || '');
        const deepLinkUrl = payload.deepLinkUrl ? String(payload.deepLinkUrl) : undefined;

        const res = await messaging.send({
          token,
          notification: { title, body },
          data: {
            notificationType: String(payload.notificationType || ''),
            entityId: payload.entityId ? String(payload.entityId) : '',
            deepLinkUrl: deepLinkUrl || '',
          },
        });

        await ref.set({ status: 'sent', messageId: res }, { merge: true });
        sent++;
      } catch (e: any) {
        failed++;
        try {
          await ref.set({ status: 'failed', error: String(e?.message || e) }, { merge: true });
        } catch {}
        logError('dispatchPushJobs: send error', e, { jobId });
      }
    }

    logInfo('dispatchPushJobs: completed', { scanned, sent, failed, skipped, ms: Date.now() - startedAt });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, sent, failed, skipped }) };
  } catch (e: any) {
    logError('dispatchPushJobs: fatal error', e, { scanned, sent, failed, skipped });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || 'Unknown error' }) };
  }
};

export const handler = schedule('*/1 * * * *', baseHandler);

