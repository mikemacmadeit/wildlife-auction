/**
 * POST /api/orders/[orderId]/start-delivery-tracking
 *
 * SELLER_TRANSPORT: Seller starts live delivery tracking. Transitions to OUT_FOR_DELIVERY,
 * sets deliveryTracking.enabled, writes RTDB trackingAccess, notifies buyer.
 * Only seller (or assigned driver) can start. Order must be DELIVERY_SCHEDULED (buyer has
 * agreed to a delivery window). Not allowed in FULFILLMENT_REQUIRED so the buyer never sees
 * "in-transit" before a delivery window was proposed.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { TransactionStatus } from '@/lib/types';
import { getAdminAuth, getAdminDb, getAdminDatabase } from '@/lib/firebase/admin';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { captureException } from '@/lib/monitoring/capture';

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

    const driverUid = decodedToken.uid;
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    const sellerId = orderData.sellerId as string;
    const buyerId = orderData.buyerId as string;

    if (driverUid !== sellerId) {
      return json(
        { error: 'Only the seller (or assigned driver) can start delivery tracking' },
        { status: 403 }
      );
    }

    const transportOption = orderData.transportOption || 'SELLER_TRANSPORT';
    if (transportOption !== 'SELLER_TRANSPORT') {
      return json(
        { error: 'Invalid transport option', details: 'This endpoint is for SELLER_TRANSPORT orders only.' },
        { status: 400 }
      );
    }

    const currentTxStatus = (orderData.transactionStatus as TransactionStatus | undefined) || orderData.status;
    // Only allow after buyer has agreed to a delivery window (DELIVERY_SCHEDULED).
    // Do NOT allow FULFILLMENT_REQUIRED: seller must propose a window and buyer must agree first,
    // otherwise the buyer would see "in-transit" before any delivery window was proposed.
    const allowedStatuses: TransactionStatus[] = ['DELIVERY_SCHEDULED'];
    const legacyOk = ['DELIVERY_SCHEDULED'].includes(String(currentTxStatus));

    if (!allowedStatuses.includes(currentTxStatus as TransactionStatus) && !legacyOk) {
      return json(
        {
          error: 'Invalid status',
          details: `Cannot start delivery tracking yet. Propose a delivery window and have the buyer agree first. Current status: ${currentTxStatus}.`,
        },
        { status: 400 }
      );
    }

    if ((orderData.deliveryTracking as { enabled?: boolean } | undefined)?.enabled) {
      return json({ error: 'Tracking already enabled', success: true, orderId }, { status: 200 });
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      transactionStatus: 'OUT_FOR_DELIVERY' as TransactionStatus,
      updatedAt: now,
      lastUpdatedByRole: 'seller',
      inTransitAt: Timestamp.fromDate(now),
      deliveryTracking: {
        enabled: true,
        driverUid,
        startedAt: Timestamp.fromDate(now),
        endedAt: null,
        lastLocationAt: null,
      },
    };

    await orderRef.update(updateData);

    try {
      await appendOrderTimelineEvent({
        db: db as never,
        orderId,
        event: {
          id: `DELIVERY_TRACKING_STARTED:${orderId}`,
          type: 'SELLER_SHIPPED',
          label: 'Seller started live delivery tracking',
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
        enabled: true,
      });
    } else if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '[start-delivery-tracking] Realtime Database not configured (FIREBASE_DATABASE_URL or NEXT_PUBLIC_FIREBASE_DATABASE_URL). Buyer will not see live map until RTDB is set up.'
      );
    }

    const listingDoc = await db.collection('listings').doc(orderData.listingId as string).get();
    const listingTitle = (listingDoc.data()?.title as string) || 'Your order';
    const orderUrl = `${getSiteUrl()}/dashboard/orders/${orderId}`;

    try {
      const ev = await emitAndProcessEventForUser({
        type: 'Order.DeliveryTrackingStarted',
        actorId: driverUid,
        entityType: 'order',
        entityId: orderId,
        targetUserId: buyerId,
        payload: {
          type: 'Order.DeliveryTrackingStarted',
          orderId,
          listingId: orderData.listingId as string,
          listingTitle,
          orderUrl,
        },
        optionalHash: `delivery_tracking_started:${now.getTime()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as never, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.DeliveryTrackingStarted',
            jobId: ev.eventId,
            orderId,
            endpoint: '/api/orders/[orderId]/start-delivery-tracking',
          });
        });
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error emitting Order.DeliveryTrackingStarted:', e);
      }
    }

    return json({
      success: true,
      orderId,
      transactionStatus: 'OUT_FOR_DELIVERY',
      deliveryTracking: { enabled: true, driverUid, startedAt: now.toISOString() },
      message: 'Live delivery tracking started.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start delivery tracking';
    if (process.env.NODE_ENV === 'development') {
      console.error('Error starting delivery tracking:', error);
    }
    return json({ error: 'Failed to start delivery tracking', message }, { status: 500 });
  }
}
