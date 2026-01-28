/**
 * POST /api/admin/orders/cancel-abandoned-checkouts
 *
 * Finds orders that are still "awaiting payment" (pending / awaiting_bank_transfer / awaiting_wire)
 * and whose Stripe Checkout Session has expired. Cancels those orders and clears any listing
 * reservation, so they stop showing as awaiting payment.
 *
 * Use when many such orders were created from checkout sessions that were never completed
 * (e.g. webhook for checkout.session.expired was missed or not deployed).
 *
 * Query params:
 *   limit=50     Max orders to process (default 50).
 *   dryRun=1     If set, only report what would be cancelled; do not write.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, json } from '@/app/api/admin/_util';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';

const AWAITING_STATUSES = ['pending', 'awaiting_bank_transfer', 'awaiting_wire'] as const;

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const { db } = admin.ctx;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const dryRun = searchParams.get('dryRun') === '1' || searchParams.get('dryRun') === 'true';

  if (!isStripeConfigured() || !stripe) {
    return json({ ok: false, error: 'Stripe is not configured' }, { status: 503 });
  }

  const results: { orderId: string; sessionId: string; action: 'cancelled' | 'skipped_not_expired' | 'skipped_terminal' | 'error'; message?: string }[] = [];
  let cancelled = 0;

  // Orders that look "awaiting payment" and have a checkout session
  const ordersSnap = await db
    .collection('orders')
    .where('status', 'in', AWAITING_STATUSES)
    .limit(limit)
    .get();

  for (const doc of ordersSnap.docs) {
    const orderId = doc.id;
    const data = doc.data() as { stripeCheckoutSessionId?: string; status?: string; listingId?: string };
    const sessionId = typeof data.stripeCheckoutSessionId === 'string' && data.stripeCheckoutSessionId.startsWith('cs_')
      ? data.stripeCheckoutSessionId
      : null;

    if (!sessionId) {
      results.push({ orderId, sessionId: '', action: 'skipped_terminal', message: 'No checkout session id' });
      continue;
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.status !== 'expired') {
        results.push({
          orderId,
          sessionId,
          action: 'skipped_not_expired',
          message: `Session status is ${session.status}, not expired`,
        });
        continue;
      }

      if (dryRun) {
        results.push({ orderId, sessionId, action: 'cancelled', message: 'Would cancel (dry run)' });
        cancelled++;
        continue;
      }

      const now = new Date();
      const orderRef = db.collection('orders').doc(orderId);
      await orderRef.set({ status: 'cancelled', updatedAt: now, lastUpdatedByRole: 'admin' }, { merge: true });
      cancelled++;

      const listingId = data.listingId;
      if (listingId) {
        try {
          const listingRef = db.collection('listings').doc(String(listingId));
          const reservationRef = listingRef.collection('purchaseReservations').doc(orderId);
          await db.runTransaction(async (tx) => {
            const listingSnap = await tx.get(listingRef);
            if (!listingSnap.exists) return;
            const l = listingSnap.data() as any;
            const rs = await tx.get(reservationRef);
            if (rs.exists) {
              const r = rs.data() as any;
              const q = typeof r?.quantity === 'number' ? Math.max(1, Math.floor(r.quantity)) : 0;
              if (q > 0 && typeof l?.quantityAvailable === 'number' && Number.isFinite(l.quantityAvailable)) {
                tx.update(listingRef, {
                  quantityAvailable: Math.max(0, Math.floor(l.quantityAvailable)) + q,
                  updatedAt: Timestamp.fromDate(now),
                  updatedBy: 'system',
                });
              }
              tx.delete(reservationRef);
            }
            if (l?.purchaseReservedByOrderId === orderId) {
              tx.update(listingRef, {
                purchaseReservedByOrderId: null,
                purchaseReservedAt: null,
                purchaseReservedUntil: null,
                updatedAt: Timestamp.fromDate(now),
                updatedBy: 'system',
              });
            }
          });
        } catch (e: any) {
          results.push({ orderId, sessionId, action: 'cancelled', message: `Order cancelled but listing clear failed: ${e?.message || e}` });
          continue;
        }
      }
      results.push({ orderId, sessionId, action: 'cancelled' });
    } catch (e: any) {
      results.push({
        orderId,
        sessionId: sessionId ?? '',
        action: 'error',
        message: e?.message || String(e),
      });
    }
  }

  return json({
    ok: true,
    dryRun,
    totalScanned: ordersSnap.size,
    cancelled,
    results,
  });
}
