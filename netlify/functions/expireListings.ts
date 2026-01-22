/**
 * Netlify Scheduled Function: Expire Listings
 *
 * Runs every 5 minutes:
 * - Finds listings with status='active' whose endAt (or legacy endsAt) is <= now
 * - Marks them status='ended' and endedReason='expired'
 *
 * Notes:
 * - Idempotent (safe to run repeatedly)
 * - Backwards compatible: if endAt is missing we fall back to endsAt, and finally to a virtual endAt
 *   computed from (startAt||publishedAt||createdAt) + durationDays (default 7).
 */

import { Handler, schedule } from '@netlify/functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';
import { coerceDurationDays, computeEndAt, toMillisSafe } from '../../lib/listings/duration';

let db: ReturnType<typeof getFirestore>;

async function initializeFirebaseAdmin() {
  db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
  return db;
}

function computeListingEndMs(listing: any): number | null {
  const direct = toMillisSafe(listing?.endAt) ?? toMillisSafe(listing?.endsAt);
  if (typeof direct === 'number') return direct;
  const startMs = toMillisSafe(listing?.startAt) ?? toMillisSafe(listing?.publishedAt) ?? toMillisSafe(listing?.createdAt);
  if (typeof startMs !== 'number') return null;
  const durationDays = coerceDurationDays(listing?.durationDays, 7);
  return computeEndAt(startMs, durationDays);
}

const baseHandler: Handler = async () => {
  const requestId = `cron_expireListings_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const startedAt = Date.now();
  const timeBudgetMs = 45_000;
  let scanned = 0;
  let ended = 0;

  try {
    await initializeFirebaseAdmin();
    const nowTs = Timestamp.now();
    const nowMs = nowTs.toMillis();

    // Prefer an indexed query path (endAt <= now). If indexes aren't ready, fall back to scanning.
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let page = 0;

    while (Date.now() - startedAt < timeBudgetMs) {
      page++;

      let snap: FirebaseFirestore.QuerySnapshot;
      try {
        let q = db
          .collection('listings')
          .where('status', '==', 'active')
          .where('endAt', '<=', nowTs)
          .orderBy('endAt', 'asc')
          .limit(200);
        if (cursor) q = q.startAfter(cursor);
        snap = await q.get();
      } catch (e: any) {
        const msg = String(e?.message || '');
        const code = String(e?.code || '');
        const looksLikeIndex = code === 'failed-precondition' || /requires an index/i.test(msg);
        if (!looksLikeIndex) throw e;

        // Fallback: scan a page of active listings and filter in memory.
        logWarn('expireListings: missing index for endAt query; using fallback scan', { requestId, code, message: msg });
        let q = db.collection('listings').where('status', '==', 'active').orderBy('updatedAt', 'desc').limit(200);
        if (cursor) q = q.startAfter(cursor);
        snap = await q.get();
      }

      scanned += snap.size;
      if (snap.empty) break;

      const toEnd = snap.docs.filter((d) => {
        const data = d.data() as any;
        const endMs = computeListingEndMs(data);
        return typeof endMs === 'number' && endMs <= nowMs;
      });

      if (toEnd.length > 0) {
        const batch = db.batch();
        toEnd.forEach((d) => {
          batch.update(d.ref, {
            status: 'ended',
            endedReason: 'expired',
            endedAt: nowTs,
            updatedAt: nowTs,
            updatedBy: 'system',
          });
        });
        await batch.commit();
        ended += toEnd.length;
      }

      cursor = snap.docs[snap.docs.length - 1] || null;
      if (snap.size < 200) break;
    }

    logInfo('expireListings: completed', { requestId, scanned, ended, ms: Date.now() - startedAt });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, ended }) };
  } catch (e: any) {
    logError('expireListings: fatal error', e, { requestId, scanned, ended });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || 'Unknown error' }) };
  }
};

export const handler = schedule('*/5 * * * *', baseHandler);

