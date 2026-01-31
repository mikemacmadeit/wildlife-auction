/**
 * POST /api/orders/[orderId]/stop-delivery-tracking
 *
 * SELLER_TRANSPORT: Seller stops live tracking. Body: { mode: 'DELIVERED' | 'STOP_ONLY' }.
 * Only driver or seller can stop. Disables tracking in Firestore + RTDB; if mode is DELIVERED, transitions to DELIVERED_PENDING_CONFIRMATION.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { TransactionStatus } from '@/lib/types';
import { getAdminAuth, getAdminDb, getAdminDatabase } from '@/lib/firebase/admin';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';

function json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> | { orderId: string } }
) {
  const params =
    typeof (ctx.params as { then?: (f: (p: { orderId: string }) => void) => void })?.then === 'function'
      ? await (ctx.params as Promise<{ orderId: string }>)
      : (ctx.params as { orderId: string });
  const orderId = params?.orderId;
  if (!orderId) {
    return json({ error: 'Order ID required' }, { status: 400 });
  }

  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as Request & { headers: Headers });
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': String(rateLimitResult.body.retryAfter) },
      });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken: { uid: string };
    try {
      decodedToken = await auth.verifyIdToken(authHeader.split('Bearer ')[1]!);
    } catch {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const callerUid = decodedToken.uid;
    let bodyPayload: { mode?: 'DELIVERED' | 'STOP_ONLY' };
    try {
      bodyPayload = await request.json().catch(() => ({}));
    } catch {
      bodyPayload = {};
    }
    const mode = bodyPayload.mode === 'DELIVERED' ? 'DELIVERED' : 'STOP_ONLY';

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    const sellerId = orderData.sellerId as string;
    const buyerId = orderData.buyerId as string;
    const deliveryTracking = (orderData.deliveryTracking as
      | { enabled?: boolean; driverUid?: string }
      | undefined);
    const driverUid = deliveryTracking?.driverUid || sellerId;

    if (callerUid !== sellerId && callerUid !== driverUid) {
      return json(
        { error: 'Only the seller or driver can stop delivery tracking' },
        { status: 403 }
      );
    }

    if (!deliveryTracking?.enabled) {
      return json({ success: true, orderId, message: 'Tracking was not enabled.' }, { status: 200 });
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      'deliveryTracking.enabled': false,
      'deliveryTracking.endedAt': Timestamp.fromDate(now),
      updatedAt: now,
      lastUpdatedByRole: 'seller',
    };

    if (mode === 'DELIVERED') {
      (updateData as Record<string, unknown>).transactionStatus = 'DELIVERED_PENDING_CONFIRMATION' as TransactionStatus;
      (updateData as Record<string, unknown>).status = 'delivered';
      (updateData as Record<string, unknown>).deliveredAt = Timestamp.fromDate(now);
    }

    await orderRef.update(updateData);

    try {
      await appendOrderTimelineEvent({
        db: db as never,
        orderId,
        event: {
          id: `DELIVERY_TRACKING_STOPPED:${orderId}:${now.getTime()}`,
          type: mode === 'DELIVERED' ? 'DELIVERED' : 'SELLER_SHIPPED',
          label: mode === 'DELIVERED' ? 'Seller marked delivered' : 'Seller stopped live tracking',
          actor: 'seller',
          visibility: 'buyer',
          timestamp: Timestamp.fromDate(now),
        },
      });
    } catch {
      // best-effort
    }

    const rtdb = getAdminDatabase();
    if (rtdb) {
      const accessRef = rtdb.ref(`trackingAccess/${orderId}`);
      await accessRef.set({
        buyerUid: buyerId,
        sellerUid: sellerId,
        driverUid,
        enabled: false,
      });
      const locationRef = rtdb.ref(`liveLocations/${orderId}`);
      await locationRef.remove().catch(() => {});
    }

    const listingDoc = await db.collection('listings').doc(orderData.listingId as string).get();
    const listingTitle = (listingDoc.data()?.title as string) || 'Your order';
    const orderUrl = `${getSiteUrl()}/dashboard/orders/${orderId}`;

    try {
      await emitAndProcessEventForUser({
        type: 'Order.DeliveryTrackingStopped',
        actorId: callerUid,
        entityType: 'order',
        entityId: orderId,
        targetUserId: buyerId,
        payload: {
          type: 'Order.DeliveryTrackingStopped',
          orderId,
          listingId: orderData.listingId as string,
          listingTitle,
          orderUrl,
          delivered: mode === 'DELIVERED',
        },
        optionalHash: `delivery_tracking_stopped:${now.getTime()}`,
      });
    } catch {
      // best-effort
    }

    return json({
      success: true,
      orderId,
      mode,
      ...(mode === 'DELIVERED' && { transactionStatus: 'DELIVERED_PENDING_CONFIRMATION' }),
      message: mode === 'DELIVERED' ? 'Marked as delivered.' : 'Live tracking stopped.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to stop delivery tracking';
    if (process.env.NODE_ENV === 'development') {
      console.error('Error stopping delivery tracking:', error);
    }
    return json({ error: 'Failed to stop delivery tracking', message }, { status: 500 });
  }
}
