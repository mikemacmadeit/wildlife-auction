/**
 * Netlify Scheduled Function: Expire Listings
 *
 * Runs every 5 minutes:
 * - Finds listings with status='active' whose endAt (or legacy endsAt) is <= now
 * - If a paid order exists for the listing → mark status='sold' (so transport can start for both parties)
 * - Otherwise → mark status='ended' and endedReason='expired' (no sale)
 *
 * Notes:
 * - Idempotent (safe to run repeatedly)
 * - End = no sale (no bids or reserve not met). Sold = paid order exists; never overwrite sold with ended.
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

const SOLD_ORDER_STATUSES = new Set([
  'paid_held',
  'paid',
  'in_transit',
  'delivered',
  'buyer_confirmed',
  'accepted',
  'ready_to_release',
  'disputed',
  'completed',
]);

function computeListingEndMs(listing: any): number | null {
  const direct = toMillisSafe(listing?.endAt) ?? toMillisSafe(listing?.endsAt);
  if (typeof direct === 'number') return direct;
  const startMs = toMillisSafe(listing?.startAt) ?? toMillisSafe(listing?.publishedAt) ?? toMillisSafe(listing?.createdAt);
  if (typeof startMs !== 'number') return null;
  const durationDays = coerceDurationDays(listing?.durationDays, 7);
  return computeEndAt(startMs, durationDays);
}

/** Returns map of listingId -> { soldAt: Timestamp, soldPriceCents?: number } for listings that have a paid order. */
async function getPaidOrderByListingIds(
  listingIds: string[]
): Promise<Map<string, { soldAt: FirebaseFirestore.Timestamp; soldPriceCents?: number }>> {
  const out = new Map<string, { soldAt: FirebaseFirestore.Timestamp; soldPriceCents?: number }>();
  const chunkSize = 10;
  for (let i = 0; i < listingIds.length; i += chunkSize) {
    const chunk = listingIds.slice(i, i + chunkSize);
    const snap = await db.collection('orders').where('listingId', 'in', chunk).limit(500).get();
    snap.docs.forEach((doc) => {
      const d = doc.data() as any;
      const lid = String(d?.listingId ?? '').trim();
      if (!lid || out.has(lid)) return;
      if (!SOLD_ORDER_STATUSES.has(String(d?.status ?? ''))) return;
      const paidAt = d?.paidAt ?? d?.createdAt ?? d?.updatedAt;
      const soldAt =
        paidAt?.toDate ? Timestamp.fromDate(paidAt.toDate()) : paidAt instanceof Timestamp ? paidAt : Timestamp.now();
      const amount =
        typeof d?.amount === 'number' && Number.isFinite(d.amount) ? Math.round(d.amount) : undefined;
      out.set(lid, { soldAt, soldPriceCents: amount });
    });
  }
  return out;
}

const baseHandler: Handler = async () => {
  const requestId = `cron_expireListings_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const startedAt = Date.now();
  const timeBudgetMs = 45_000;
  let scanned = 0;
  let ended = 0;
  let sold = 0;

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
        const listingIds = toEnd.map((d) => d.id);
        const paidByListing = await getPaidOrderByListingIds(listingIds);
        const batch = db.batch();
        toEnd.forEach((d) => {
          const listingId = d.id;
          const orderInfo = paidByListing.get(listingId);
          if (orderInfo) {
            const update: Record<string, unknown> = {
              status: 'sold',
              endedReason: 'sold',
              endedAt: orderInfo.soldAt,
              soldAt: orderInfo.soldAt,
              updatedAt: nowTs,
              updatedBy: 'system',
            };
            if (typeof orderInfo.soldPriceCents === 'number') update.soldPriceCents = orderInfo.soldPriceCents;
            batch.update(d.ref, update);
            sold += 1;
          } else {
            batch.update(d.ref, {
              status: 'ended',
              endedReason: 'expired',
              endedAt: nowTs,
              updatedAt: nowTs,
              updatedBy: 'system',
            });
            ended += 1;
          }
        });
        await batch.commit();
      }

      cursor = snap.docs[snap.docs.length - 1] || null;
      if (snap.size < 200) break;
    }

    logInfo('expireListings: completed', { requestId, scanned, ended, sold, ms: Date.now() - startedAt });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, ended, sold }) };
  } catch (e: any) {
    logError('expireListings: fatal error', e, { requestId, scanned, ended, sold });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || 'Unknown error' }) };
  }
};

export const handler = schedule('*/5 * * * *', baseHandler);

