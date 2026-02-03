/**
 * Netlify Scheduled Function: Clear Expired Purchase Reservations
 *
 * Purpose:
 * - Prevent stale `purchaseReservedByOrderId` / `purchaseReservedUntil` fields from deadlocking browse/checkout.
 *
 * Behavior:
 * - Query listings with purchaseReservedUntil <= now
 * - For each, transactionally clear:
 *   purchaseReservedByOrderId, purchaseReservedAt, purchaseReservedUntil
 *
 * Idempotency:
 * - Clearing to null is safe under retries.
 */
import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';

const MAX_PER_RUN = 200;
const TIME_BUDGET_MS = 45_000;

const baseHandler: Handler = async () => {
  const requestId = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const start = Date.now();
  const db = getAdminDb();
  const nowTs = Timestamp.now();

  let scanned = 0;
  let cleared = 0;
  let noops = 0;
  let errors = 0;
  let scannedOrders = 0;
  let clearedOrders = 0;

  try {
    // Index needed: (purchaseReservedUntil).
    const snap = await db
      .collection('listings')
      .where('purchaseReservedUntil', '<=', nowTs)
      .orderBy('purchaseReservedUntil', 'asc')
      .limit(MAX_PER_RUN)
      .get();

    scanned = snap.size;
    if (snap.empty) {
      try {
        await db.collection('opsHealth').doc('clearExpiredPurchaseReservations').set(
          { lastRunAt: nowTs, status: 'success', scannedCount: 0, processedCount: 0, errorsCount: 0, updatedAt: nowTs },
          { merge: true }
        );
      } catch (_) {}
      return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, cleared, noops, errors }) };
    }

    for (const d of snap.docs) {
      if (Date.now() - start > TIME_BUDGET_MS) {
        logWarn('clearExpiredPurchaseReservations: time budget reached; exiting early', {
          requestId,
          route: 'clearExpiredPurchaseReservations',
          scanned,
          cleared,
          noops,
          errors,
        });
        break;
      }

      const listingId = d.id;
      const ref = db.collection('listings').doc(listingId);

      try {
        const outcome = await db.runTransaction(async (tx) => {
          const snap2 = await tx.get(ref);
          if (!snap2.exists) return 'noop_missing' as const;
          const live = snap2.data() as any;
          const untilMs = typeof live?.purchaseReservedUntil?.toMillis === 'function' ? live.purchaseReservedUntil.toMillis() : null;
          const hasOrderId = typeof live?.purchaseReservedByOrderId === 'string' && live.purchaseReservedByOrderId.trim().length > 0;
          if (!hasOrderId) return 'noop_no_order' as const;
          if (!untilMs || untilMs > nowTs.toMillis()) return 'noop_not_expired' as const;

          // If the associated order is still in the checkout-created pending state, cancel it so it doesn't linger forever.
          // (This also prevents it from appearing in Purchases/Sales in older UI code paths.)
          const orderId = String(live.purchaseReservedByOrderId || '').trim();
          if (orderId) {
            const orderRef = db.collection('orders').doc(orderId);
            const orderSnap = await tx.get(orderRef);
            if (orderSnap.exists) {
              const order = orderSnap.data() as any;
              const isPending = String(order?.status || '') === 'pending';
              const hasSession = typeof order?.stripeCheckoutSessionId === 'string' && order.stripeCheckoutSessionId.startsWith('cs_');
              if (isPending && hasSession) {
                tx.set(
                  orderRef,
                  {
                    status: 'cancelled',
                    updatedAt: nowTs,
                    lastUpdatedByRole: 'buyer',
                  },
                  { merge: true }
                );
              }
            }
          }

          tx.set(
            ref,
            {
              purchaseReservedByOrderId: null,
              purchaseReservedAt: null,
              purchaseReservedUntil: null,
              updatedAt: nowTs,
              updatedBy: 'system',
            },
            { merge: true }
          );
          return 'cleared' as const;
        });

        if (outcome === 'cleared') cleared++;
        else noops++;
      } catch (e: any) {
        errors++;
        logWarn('clearExpiredPurchaseReservations: failed to clear reservation', {
          requestId,
          route: 'clearExpiredPurchaseReservations',
          listingId,
          message: String(e?.message || e),
        });
      }
    }

    // Multi-quantity reservations:
    // These are recorded as `orders/{orderId}.reservationExpiresAt` + `listings/{listingId}/purchaseReservations/{orderId}` + `listings/{listingId}.quantityAvailable` decrement.
    // We restore inventory for *pending* orders whose reservation has expired.
    //
    // Index needed: (status, reservationExpiresAt).
    try {
      if (Date.now() - start <= TIME_BUDGET_MS - 5_000) {
        const ordersSnap = await db
          .collection('orders')
          .where('status', '==', 'pending')
          .where('reservationExpiresAt', '<=', nowTs)
          .orderBy('reservationExpiresAt', 'asc')
          .limit(MAX_PER_RUN)
          .get();

        scannedOrders = ordersSnap.size;

        for (const od of ordersSnap.docs) {
          if (Date.now() - start > TIME_BUDGET_MS) break;

          const orderId = od.id;
          const orderRef = db.collection('orders').doc(orderId);

          try {
            const outcome = await db.runTransaction(async (tx) => {
              const oSnap = await tx.get(orderRef);
              if (!oSnap.exists) return 'noop_missing_order' as const;
              const o = oSnap.data() as any;
              if (String(o?.status || '') !== 'pending') return 'noop_not_pending' as const;

              const listingId = o?.listingId ? String(o.listingId) : '';
              if (!listingId) return 'noop_no_listing' as const;
              const listingRef = db.collection('listings').doc(listingId);
              const lSnap = await tx.get(listingRef);
              if (!lSnap.exists) return 'noop_missing_listing' as const;
              const l = lSnap.data() as any;

              const reservationRef = listingRef.collection('purchaseReservations').doc(orderId);
              const rSnap = await tx.get(reservationRef);
              if (rSnap.exists) {
                const r = rSnap.data() as any;
                const q = typeof r?.quantity === 'number' ? Math.max(1, Math.floor(r.quantity)) : 0;
                if (q > 0 && typeof l?.quantityAvailable === 'number' && Number.isFinite(l.quantityAvailable)) {
                  tx.set(
                    listingRef,
                    {
                      quantityAvailable: Math.max(0, Math.floor(l.quantityAvailable)) + q,
                      updatedAt: nowTs,
                      updatedBy: 'system',
                    },
                    { merge: true }
                  );
                }
                tx.delete(reservationRef);
              }

              // Also clear legacy single-item reservation if this order was holding it.
              if (l.purchaseReservedByOrderId === orderId) {
                tx.set(
                  listingRef,
                  {
                    purchaseReservedByOrderId: null,
                    purchaseReservedAt: null,
                    purchaseReservedUntil: null,
                    updatedAt: nowTs,
                    updatedBy: 'system',
                  },
                  { merge: true }
                );
              }

              tx.set(
                orderRef,
                {
                  status: 'cancelled',
                  updatedAt: nowTs,
                  lastUpdatedByRole: 'buyer',
                },
                { merge: true }
              );

              return 'cleared_order' as const;
            });

            if (outcome === 'cleared_order') clearedOrders++;
            else noops++;
          } catch (e: any) {
            errors++;
            logWarn('clearExpiredPurchaseReservations: failed to clear order reservation', {
              requestId,
              route: 'clearExpiredPurchaseReservations',
              orderId,
              message: String(e?.message || e),
            });
          }
        }
      }
    } catch (e: any) {
      const code = String(e?.code || '');
      const msg = String(e?.message || '');
      const looksLikeIndex = code === 'failed-precondition' || /requires an index/i.test(msg);
      if (looksLikeIndex) {
        logWarn('clearExpiredPurchaseReservations: missing Firestore index for order reservations; skipping', {
          requestId,
          route: 'clearExpiredPurchaseReservations',
          code,
          message: msg,
        });
      } else {
        throw e;
      }
    }

    logInfo('clearExpiredPurchaseReservations: completed', { requestId, route: 'clearExpiredPurchaseReservations', scanned, cleared, noops, errors });
    try {
      await db.collection('opsHealth').doc('clearExpiredPurchaseReservations').set(
        { lastRunAt: Timestamp.now(), status: 'success', scannedCount: scanned, processedCount: cleared, errorsCount: errors, updatedAt: Timestamp.now() },
        { merge: true }
      );
    } catch (_) {}
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, scanned, cleared, scannedOrders, clearedOrders, noops, errors }),
    };
  } catch (e: any) {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    const looksLikeIndex = code === 'failed-precondition' || /requires an index/i.test(msg);
    if (looksLikeIndex) {
      logWarn('clearExpiredPurchaseReservations: missing Firestore index; skipping run', {
        requestId,
        route: 'clearExpiredPurchaseReservations',
        code,
        message: msg,
      });
      try {
        await db.collection('opsHealth').doc('clearExpiredPurchaseReservations').set(
          { lastRunAt: Timestamp.now(), status: 'error', lastError: msg || 'Missing index', updatedAt: Timestamp.now() },
          { merge: true }
        );
      } catch (_) {}
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: 'MISSING_INDEX' }) };
    }
    logError('clearExpiredPurchaseReservations: fatal error', e, { requestId, route: 'clearExpiredPurchaseReservations' });
    try {
      await db.collection('opsHealth').doc('clearExpiredPurchaseReservations').set(
        { lastRunAt: Timestamp.now(), status: 'error', lastError: msg || 'Unknown error', updatedAt: Timestamp.now() },
        { merge: true }
      );
    } catch (_) {}
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: msg || 'Unknown error' }) };
  }
};

export const handler = schedule('*/5 * * * *', baseHandler);

