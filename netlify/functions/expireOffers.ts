/**
 * Netlify Scheduled Function: Expire Offers
 *
 * Runs every 10 minutes:
 * - Finds offers with status in ("open","countered") and expiresAt < now
 * - Marks them expired, appends history entry, writes audit log
 * - Expires accepted offers that were not paid within the accepted-payment window (default 24h)
 *   and clears listing reservation so the listing goes back live.
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
    const acceptedWindowHoursRaw = Number(process.env.OFFER_ACCEPTED_PAYMENT_WINDOW_HOURS || '24');
    const acceptedWindowHours =
      Number.isFinite(acceptedWindowHoursRaw) ? Math.max(1, Math.min(168, Math.round(acceptedWindowHoursRaw))) : 24;
    const acceptedCutoff = Timestamp.fromMillis(nowTs.toMillis() - acceptedWindowHours * 60 * 60 * 1000);

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

    // Accepted-offer payment window expiry (default 24h): release listing reservation if unpaid.
    // Keep this separate to avoid multi-status queries and to keep index requirements minimal.
    try {
      let cursorAccepted: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      let acceptedPage = 0;
      while (Date.now() - startedAt < timeBudgetMs) {
        acceptedPage++;
        let qAccepted = db
          .collection('offers')
          .where('status', '==', 'accepted')
          .where('acceptedAt', '<=', acceptedCutoff)
          .orderBy('acceptedAt', 'asc')
          .limit(100);
        if (cursorAccepted) qAccepted = qAccepted.startAfter(cursorAccepted);

        const snap = await qAccepted.get();
        scanned += snap.size;
        if (snap.empty) break;

        const batch = db.batch();
        const toNotify: Array<{
          offerId: string;
          listingId: string;
          listingTitle: string;
          buyerId: string;
          sellerId: string;
        }> = [];

        for (const doc of snap.docs) {
          const data = doc.data() as any;
          const offerId = doc.id;

          // Defensive: only expire if truly past acceptedUntil (or acceptedAt + window).
          const acceptedAt: any = data.acceptedAt;
          const acceptedAtMs = typeof acceptedAt?.toMillis === 'function' ? acceptedAt.toMillis() : null;
          const acceptedUntil: any = data.acceptedUntil;
          const acceptedUntilMs =
            typeof acceptedUntil?.toMillis === 'function'
              ? acceptedUntil.toMillis()
              : typeof acceptedAtMs === 'number'
                ? acceptedAtMs + acceptedWindowHours * 60 * 60 * 1000
                : null;
          if (typeof acceptedUntilMs !== 'number' || acceptedUntilMs > nowTs.toMillis()) continue;

          // If an order exists and is already paid/processing, do not expire.
          const orderId = typeof data.orderId === 'string' ? data.orderId : null;
          if (orderId) {
            const orderSnap = await db.collection('orders').doc(orderId).get().catch(() => null as any);
            const order = orderSnap?.exists ? (orderSnap.data() as any) : null;
            const st = String(order?.status || '');
            const isPaidOrProcessing =
              st === 'paid' ||
              st === 'paid_held' ||
              st === 'awaiting_wire' ||
              st === 'awaiting_ach' ||
              st === 'buyer_confirmed' ||
              st === 'accepted' ||
              st === 'ready_to_release' ||
              st === 'in_transit' ||
              st === 'delivered' ||
              st === 'completed';
            if (isPaidOrProcessing) continue;
          }

          // Clear listing reservation if it is still reserved by this offer and there's no active purchase reservation.
          const listingId = String(data.listingId || '');
          if (listingId) {
            const listingRef = db.collection('listings').doc(listingId);
            const listingSnap = await listingRef.get().catch(() => null as any);
            const listing = listingSnap?.exists ? (listingSnap.data() as any) : null;
            const reservedBy = listing?.offerReservedByOfferId ? String(listing.offerReservedByOfferId) : '';
            const prUntilMs =
              typeof listing?.purchaseReservedUntil?.toMillis === 'function' ? listing.purchaseReservedUntil.toMillis() : null;
            const hasActivePurchaseReservation =
              Boolean(listing?.purchaseReservedByOrderId) && typeof prUntilMs === 'number' && prUntilMs > nowTs.toMillis();

            if (reservedBy === offerId && !hasActivePurchaseReservation) {
              batch.set(
                listingRef,
                {
                  offerReservedByOfferId: null,
                  offerReservedAt: null,
                  offerReservedUntil: null,
                  updatedAt: nowTs,
                },
                { merge: true }
              );
            }
          }

          // Expire offer + append history
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
            metadata: { offerId: doc.id, reason: 'accepted_payment_window_expired' },
            source: 'cron',
            createdAt: nowTs,
          });

          toNotify.push({
            offerId,
            listingId: String(data.listingId || ''),
            listingTitle: String(data?.listingSnapshot?.title || 'a listing'),
            buyerId: String(data.buyerId || ''),
            sellerId: String(data.sellerId || ''),
          });
        }

        if (toNotify.length) {
          await batch.commit();
          expired += toNotify.length;

          // Notify buyer + seller (best-effort)
          try {
            const base = getSiteUrl();
            for (const n of toNotify) {
              if (n.buyerId) {
                await emitEventForUser({
                  type: 'Offer.Expired',
                  actorId: 'system',
                  entityType: 'listing',
                  entityId: n.listingId,
                  targetUserId: n.buyerId,
                  payload: {
                    type: 'Offer.Expired',
                    offerId: n.offerId,
                    listingId: n.listingId,
                    listingTitle: n.listingTitle,
                    offerUrl: `${base}/dashboard/offers`,
                  },
                  optionalHash: `offer:${n.offerId}:expired_accepted`,
                });
              }
              if (n.sellerId) {
                await emitEventForUser({
                  type: 'Offer.Expired',
                  actorId: 'system',
                  entityType: 'listing',
                  entityId: n.listingId,
                  targetUserId: n.sellerId,
                  payload: {
                    type: 'Offer.Expired',
                    offerId: n.offerId,
                    listingId: n.listingId,
                    listingTitle: n.listingTitle,
                    offerUrl: `${base}/seller/offers`,
                  },
                  optionalHash: `offer:${n.offerId}:expired_accepted_seller`,
                });
              }
            }
          } catch (e: any) {
            logWarn('expireOffers: failed to emit Offer.Expired (accepted window) events', {
              requestId,
              error: String(e?.message || e),
            });
          }
        }

        cursorAccepted = snap.docs[snap.docs.length - 1] || null;
        if (snap.size < 100) break;
      }
    } catch (e: any) {
      logWarn('expireOffers: accepted-window expiry pass failed', { requestId, error: String(e?.message || e) });
    }

    if (scanned === 0) {
      logInfo('expireOffers: nothing to expire', { requestId, scanned, expired, ms: Date.now() - startedAt });
      try {
        await db.collection('opsHealth').doc('expireOffers').set(
          { lastRunAt: Timestamp.now(), status: 'success', scannedCount: 0, processedCount: 0, updatedAt: Timestamp.now() },
          { merge: true }
        );
      } catch (_) {}
      return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, expired }) };
    }

    logInfo('expireOffers: completed', { requestId, scanned, expired, ms: Date.now() - startedAt });
    try {
      await db.collection('opsHealth').doc('expireOffers').set(
        { lastRunAt: Timestamp.now(), status: 'success', scannedCount: scanned, processedCount: expired, updatedAt: Timestamp.now() },
        { merge: true }
      );
    } catch (_) {}
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, expired }) };
  } catch (error: any) {
    logError('expireOffers failed', error, { requestId, scanned, expired });
    try {
      await db.collection('opsHealth').doc('expireOffers').set(
        { lastRunAt: Timestamp.now(), status: 'error', lastError: error?.message || 'Unknown error', updatedAt: Timestamp.now() },
        { merge: true }
      );
    } catch (_) {}
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error?.message || 'Unknown error' }) };
  }
};

export const handler = schedule('*/10 * * * *', baseHandler);

