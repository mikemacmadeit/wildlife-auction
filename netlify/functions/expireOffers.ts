/**
 * Netlify Scheduled Function: Expire Offers
 *
 * Runs every 10 minutes:
 * - Finds offers with status in ("open","countered") and expiresAt < now
 * - Marks them expired, appends history entry, writes audit log
 */

import { Handler, schedule } from '@netlify/functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';
import { getAdminDb } from '../../lib/firebase/admin';
import { emitEventForUser } from '../../lib/notifications/emitEvent';
import { getSiteUrl } from '../../lib/site-url';

let db: ReturnType<typeof getFirestore>;

async function initializeFirebaseAdmin() {
  db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
  return db;
}

const baseHandler: Handler = async () => {
  const requestId = `cron_expireOffers_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const startedAt = Date.now();
  const timeBudgetMs = 45_000; // leave headroom for Netlify execution limits
  let scanned = 0;
  let expired = 0;

  try {
    await initializeFirebaseAdmin();
    const nowTs = Timestamp.now();

    // Paginate safely until we run out of results or hit time budget.
    // Note: each offer -> 2 writes (offer + auditLog) so limit 200 keeps us under 500 batch writes.
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    let page = 0;
    while (Date.now() - startedAt < timeBudgetMs) {
      page++;
      let q = db
        .collection('offers')
        .where('status', 'in', ['open', 'countered'])
        .where('expiresAt', '<=', nowTs)
        .orderBy('expiresAt', 'asc')
        .limit(200);
      if (cursor) q = q.startAfter(cursor);

      const snap = await q.get();
      scanned += snap.size;
      if (snap.empty) {
        break;
      }

      const batch = db.batch();
      snap.docs.forEach((doc) => {
        const data = doc.data() as any;
        const history = Array.isArray(data.history) ? data.history : [];
        const nextHistory = [...history, { type: 'expire', actorId: 'system', actorRole: 'system', createdAt: nowTs }];

        batch.update(doc.ref, {
          status: 'expired',
          lastActorRole: 'system',
          updatedAt: nowTs,
          history: nextHistory,
        });

        const auditRef = db.collection('auditLogs').doc();
        batch.set(auditRef, {
          auditId: auditRef.id,
          actorUid: 'system',
          actorRole: 'system',
          actionType: 'offer_expired',
          listingId: data.listingId,
          metadata: { offerId: doc.id },
          source: 'cron',
          createdAt: nowTs,
        });
      });

      await batch.commit();
      expired += snap.size;

      // Phase 3A (A3): Offer expiry notifications (best-effort, in-app).
      // Must happen per-page; if we defer to a later run, the docs won't match this query anymore.
      try {
        const base = getSiteUrl();
        for (const doc of snap.docs) {
          const data = doc.data() as any;
          const offerId = doc.id;
          const listingId = String(data.listingId || '');
          const listingTitle = String(data?.listingSnapshot?.title || 'a listing');
          const buyerId = String(data.buyerId || '');
          const sellerId = String(data.sellerId || '');

          if (buyerId) {
            await emitEventForUser({
              type: 'Offer.Expired',
              actorId: 'system',
              entityType: 'listing',
              entityId: listingId,
              targetUserId: buyerId,
              payload: {
                type: 'Offer.Expired',
                offerId,
                listingId,
                listingTitle,
                offerUrl: `${base}/dashboard/offers`,
              },
              optionalHash: `offer:${offerId}:expired`,
            });
          }
          if (sellerId) {
            await emitEventForUser({
              type: 'Offer.Expired',
              actorId: 'system',
              entityType: 'listing',
              entityId: listingId,
              targetUserId: sellerId,
              payload: {
                type: 'Offer.Expired',
                offerId,
                listingId,
                listingTitle,
                offerUrl: `${base}/seller/offers/${offerId}`,
              },
              optionalHash: `offer:${offerId}:expired_seller`,
            });
          }
        }
      } catch (e: any) {
        logWarn('expireOffers: failed to emit Offer.Expired events', { requestId, error: String(e?.message || e) });
      }

      cursor = snap.docs[snap.docs.length - 1] || null;
      if (snap.size < 200) break; // last page
    }

    if (scanned === 0) {
      logInfo('expireOffers: nothing to expire', { requestId, scanned, expired, ms: Date.now() - startedAt });
      return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, expired }) };
    }

    logInfo('expireOffers: completed', { requestId, scanned, expired, ms: Date.now() - startedAt });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, expired }) };
  } catch (error: any) {
    logError('expireOffers failed', error, { requestId, scanned, expired });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error?.message || 'Unknown error' }) };
  }
};

export const handler = schedule('*/10 * * * *', baseHandler);

