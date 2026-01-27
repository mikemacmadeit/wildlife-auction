/**
 * POST /api/orders/[orderId]/confirm-receipt
 *
 * Buyer confirms receipt of the item/animal.
 * Transitions: paid_held/paid/in_transit/delivered → buyer_confirmed (or ready_to_release if eligible)
 */
// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// Route handlers work fine with Web `Request` / `Response`.
import { getFirestore } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { OrderStatus, TransactionStatus } from '@/lib/types';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { Timestamp } from 'firebase-admin/firestore';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { captureException } from '@/lib/monitoring/capture';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(request: Request, { params }: { params: { orderId: string } }) {
  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    // Auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const buyerId = decodedToken.uid;
    const orderId = params.orderId;

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    if (orderData.buyerId !== buyerId) {
      return json({ error: 'Unauthorized - You can only confirm receipt for your own orders' }, { status: 403 });
    }

    const currentStatus = orderData.status as OrderStatus;
    const allowedStatuses: OrderStatus[] = ['paid', 'paid_held', 'in_transit', 'delivered'];
    if (!allowedStatuses.includes(currentStatus)) {
      return json(
        {
          error: 'Invalid status transition',
          details: `Cannot confirm receipt for order with status '${currentStatus}'.`,
        },
        { status: 400 }
      );
    }

    // Buyer can confirm receipt once: delivery is scheduled (seller proposed, buyer agreed), or out for delivery, or in transit/delivered.
    // Sellers do not confirm delivery; only the buyer confirms receipt to complete the transaction.
    const txStatus = (orderData.transactionStatus as string) || '';
    const hasInTransit = currentStatus === 'in_transit' || !!orderData.inTransitAt;
    const hasDeliveredMarker = !!orderData.deliveredAt || !!orderData.deliveryConfirmedAt || currentStatus === 'delivered';
    const deliveryScheduledOrOut = ['DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY'].includes(txStatus);
    if (!hasInTransit && !hasDeliveredMarker && !deliveryScheduledOrOut) {
      return json(
        {
          error: 'Delivery not yet scheduled or in progress',
          details: 'The seller must propose a delivery window and you must agree before you can confirm receipt. Once the order is on the way (or delivered), use Confirm receipt to complete the transaction.',
        },
        { status: 400 }
      );
    }

    if (currentStatus === 'disputed') {
      return json({ error: 'Cannot confirm receipt for a disputed order.' }, { status: 400 });
    }

    const now = new Date();
    const updateData: any = {
      status: 'buyer_confirmed' as OrderStatus,
      transactionStatus: 'COMPLETED' as TransactionStatus,
      buyerConfirmedAt: now,
      acceptedAt: now, // legacy
      buyerAcceptedAt: now, // protected transaction legacy
      updatedAt: now,
      lastUpdatedByRole: 'buyer',
    };

    // Ensure we have a delivery marker; only the buyer confirms receipt to complete the transaction.
    if (!orderData.deliveredAt) {
      updateData.deliveredAt = now;
    }

    // If protected transaction and no open dispute, mark as ready_to_release
    if (
      orderData.protectedTransactionDaysSnapshot &&
      (!orderData.protectedDisputeStatus || orderData.protectedDisputeStatus === 'none')
    ) {
      updateData.status = 'ready_to_release';
      updateData.payoutHoldReason = 'none';
    }

    await orderRef.update(updateData);

    // Timeline (server-authored, idempotent).
    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `BUYER_CONFIRMED:${orderId}`,
          type: 'BUYER_CONFIRMED',
          label: 'Buyer confirmed receipt',
          actor: 'buyer',
          visibility: 'buyer',
          timestamp: Timestamp.fromDate(now),
        },
      });
    } catch (e) {
      console.warn('[confirm-receipt] Failed to append timeline event (best-effort)', { orderId, error: String(e) });
    }

    // Notify seller that receipt was confirmed (in-app/email per preferences).
    try {
      const listingTitle = String(orderData?.listingSnapshot?.title || '').trim() || 'Your listing';
      const ev = await emitAndProcessEventForUser({
        type: 'Order.ReceiptConfirmed',
        actorId: buyerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.sellerId,
        payload: {
          type: 'Order.ReceiptConfirmed',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/seller/orders/${orderId}`,
        },
        optionalHash: `buyer_confirmed:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.ReceiptConfirmed',
            jobId: ev.eventId,
            orderId,
            endpoint: '/api/orders/[orderId]/confirm-receipt',
          });
        });
      }
    } catch (e) {
      console.warn('[confirm-receipt] Failed to emit Order.Received (best-effort)', { orderId, error: String(e) });
    }

    return json({
      success: true,
      orderId,
      status: updateData.status,
      buyerConfirmedAt: now,
      message: 'Receipt confirmed. Transaction complete. Seller was paid immediately upon successful payment.',
    });
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/orders/[orderId]/confirm-receipt',
      orderId: params.orderId,
      errorMessage: error.message,
    });
    return json({ error: 'Failed to confirm receipt', message: error.message }, { status: 500 });
  }
}

