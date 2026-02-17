/**
 * POST /api/delivery/mark-out-for-delivery
 *
 * Driver link auth. Accepts driver token (from URL), verifies it, then marks the order
 * as OUT_FOR_DELIVERY (same transition as seller mark-out). Notifies the buyer.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { TransactionStatus } from '@/lib/types';
import { getAdminDb } from '@/lib/firebase/admin';
import { verifyDeliveryToken } from '@/lib/delivery/tokens';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import type { Order } from '@/lib/types';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { captureException } from '@/lib/monitoring/capture';

function json(body: Record<string, unknown>, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request) {
  try {
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body as Record<string, unknown>, { status: rateLimitResult.status });
    }

    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token : null;
    if (!token) {
      return json({ error: 'token required' }, { status: 400 });
    }

    const payload = verifyDeliveryToken(token);
    if (!payload || payload.role !== 'driver') {
      return json({ error: 'Invalid or expired driver link' }, { status: 401 });
    }

    const orderId = payload.orderId;
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    const transportOption = orderData.transportOption || 'SELLER_TRANSPORT';
    if (transportOption !== 'SELLER_TRANSPORT') {
      return json({ error: 'Invalid transport option' }, { status: 400 });
    }

    const orderForStatus = { ...orderData, id: orderId } as Order;
    const effectiveStatus = getEffectiveTransactionStatus(orderForStatus);
    const hasAgreedWindow = !!(orderData.delivery as { agreedWindow?: { start?: unknown } } | undefined)?.agreedWindow?.start;
    const allowedStatuses: TransactionStatus[] = ['DELIVERY_SCHEDULED', 'DELIVERY_PROPOSED'];
    const allowedWithWindow = hasAgreedWindow ? [...allowedStatuses, 'FULFILLMENT_REQUIRED'] : allowedStatuses;
    if (!allowedWithWindow.includes(effectiveStatus)) {
      return json(
        { error: 'Invalid status transition', details: `Current status: ${effectiveStatus}. Delivery must be scheduled first.` },
        { status: 400 }
      );
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      transactionStatus: 'OUT_FOR_DELIVERY' as TransactionStatus,
      updatedAt: now,
      lastUpdatedByRole: 'driver',
      inTransitAt: Timestamp.fromDate(now),
    };

    await orderRef.update(updateData);

    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `OUT_FOR_DELIVERY:${orderId}`,
          type: 'SELLER_SHIPPED',
          label: 'Driver marked out for delivery',
          actor: 'driver',
          visibility: 'buyer',
          timestamp: Timestamp.fromDate(now),
        },
      });
    } catch {
      // best-effort
    }

    const sellerId = orderData.sellerId as string;
    try {
      const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = listingDoc.data()?.title || 'Your order';
      const ev = await emitAndProcessEventForUser({
        type: 'Order.InTransit',
        actorId: sellerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.buyerId,
        payload: {
          type: 'Order.InTransit',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/dashboard/orders/${orderId}`,
          ...(typeof orderData.finalPaymentAmount === 'number' && orderData.finalPaymentAmount > 0
            ? { finalPaymentAmount: orderData.finalPaymentAmount }
            : {}),
        },
        optionalHash: `out_for_delivery:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.InTransit',
            jobId: ev.eventId,
            orderId,
            endpoint: '/api/delivery/mark-out-for-delivery',
          });
        });
      }
      if (typeof orderData.finalPaymentAmount === 'number' && orderData.finalPaymentAmount > 0) {
        const payEv = await emitAndProcessEventForUser({
          type: 'Order.FinalPaymentDue',
          actorId: sellerId,
          entityType: 'order',
          entityId: orderId,
          targetUserId: orderData.buyerId,
          payload: {
            type: 'Order.FinalPaymentDue',
            orderId,
            listingId: orderData.listingId,
            listingTitle,
            orderUrl: `${getSiteUrl()}/dashboard/orders/${orderId}`,
            amount: orderData.finalPaymentAmount,
          },
          optionalHash: `final_payment_due:${now.toISOString()}`,
        });
        if (payEv?.ok && payEv.created) {
          void tryDispatchEmailJobNow({ db: db as any, jobId: payEv.eventId, waitForJob: true }).catch((err) => {
            captureException(err instanceof Error ? err : new Error(String(err)), {
              context: 'email-dispatch',
              eventType: 'Order.FinalPaymentDue',
              jobId: payEv.eventId,
              orderId,
              endpoint: '/api/delivery/mark-out-for-delivery',
            });
          });
        }
      }
    } catch (e) {
      console.error('Error emitting Order.InTransit notification:', e);
    }

    return json({
      success: true,
      orderId,
      transactionStatus: 'OUT_FOR_DELIVERY',
      message: 'Order marked as out for delivery.',
    });
  } catch (error: unknown) {
    console.error('Error marking out for delivery (driver):', error);
    return json(
      { error: 'Failed to mark out for delivery', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
