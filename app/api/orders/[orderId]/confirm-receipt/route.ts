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
import { OrderStatus } from '@/lib/types';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { Timestamp } from 'firebase-admin/firestore';
import { emitEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';

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

    // Require the seller to have marked at least "in transit" (or delivered/admin-confirmed),
    // otherwise buyers get stuck waiting on a redundant seller "delivered" action.
    const hasInTransit = currentStatus === 'in_transit' || !!orderData.inTransitAt;
    const hasDeliveredMarker = !!orderData.deliveredAt || !!orderData.deliveryConfirmedAt || currentStatus === 'delivered';
    if (!hasInTransit && !hasDeliveredMarker) {
      return json(
        {
          error: 'Not yet in transit',
          details: 'The seller must mark the order as in transit before you can confirm receipt.',
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
      buyerConfirmedAt: now,
      acceptedAt: now, // legacy
      buyerAcceptedAt: now, // protected transaction legacy
      updatedAt: now,
      lastUpdatedByRole: 'buyer',
    };

    // Ensure we have a delivery marker even if seller never pressed "delivered".
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
      await emitEventForUser({
        type: 'Order.Received',
        actorId: buyerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.sellerId,
        payload: {
          type: 'Order.Received',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/seller/orders/${orderId}`,
          amount: typeof orderData.amount === 'number' ? orderData.amount : 0,
        },
        optionalHash: `buyer_confirmed:${now.toISOString()}`,
      });
    } catch (e) {
      console.warn('[confirm-receipt] Failed to emit Order.Received (best-effort)', { orderId, error: String(e) });
    }

    return json({
      success: true,
      orderId,
      status: updateData.status,
      buyerConfirmedAt: now,
      message:
        updateData.status === 'ready_to_release'
          ? 'Receipt confirmed. Order is ready for admin review and release.'
          : 'Receipt confirmed. Order will be reviewed for release.',
    });
  } catch (error: any) {
    console.error('Error confirming receipt:', error);
    return json({ error: 'Failed to confirm receipt', message: error.message }, { status: 500 });
  }
}

