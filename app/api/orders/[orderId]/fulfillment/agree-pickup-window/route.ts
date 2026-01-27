/**
 * POST /api/orders/[orderId]/fulfillment/agree-pickup-window
 *
 * BUYER_TRANSPORT: Seller agrees to the buyer's proposed pickup window.
 * Transitions: PICKUP_PROPOSED → PICKUP_SCHEDULED.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { TransactionStatus } from '@/lib/types';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { captureException } from '@/lib/monitoring/capture';
import { sanitizeFirestorePayload } from '@/lib/firebase/sanitizeFirestore';
import { assertNoCorruptInt32 } from '@/lib/firebase/assertNoCorruptInt32';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
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
  { params }: { params: { orderId: string } }
) {
  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(authHeader.split('Bearer ')[1]);
    } catch {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const sellerId = decodedToken.uid;
    const orderId = params.orderId;

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    if (orderData.sellerId !== sellerId) {
      return json({ error: 'Unauthorized - You can only update your own orders' }, { status: 403 });
    }

    const transportOption = orderData.transportOption || 'BUYER_TRANSPORT';
    if (transportOption !== 'BUYER_TRANSPORT') {
      return json(
        { error: 'Invalid transport option', details: 'This endpoint is for BUYER_TRANSPORT orders only.' },
        { status: 400 }
      );
    }

    const currentTxStatus = orderData.transactionStatus as TransactionStatus | undefined;
    if (currentTxStatus !== 'PICKUP_PROPOSED') {
      return json(
        {
          error: 'Invalid status transition',
          details: `Cannot agree to pickup. Current status: ${currentTxStatus || orderData.status}. Order must be PICKUP_PROPOSED.`,
        },
        { status: 400 }
      );
    }

    const sel = orderData.pickup?.selectedWindow;
    if (!sel) {
      return json(
        { error: 'No proposed window', details: 'Buyer has not proposed a pickup window.' },
        { status: 400 }
      );
    }

    const start = sel.start?.toDate ? sel.start.toDate() : new Date(sel.start);
    const end = sel.end?.toDate ? sel.end.toDate() : new Date(sel.end);
    const now = new Date();

    const updateData: any = {
      transactionStatus: 'PICKUP_SCHEDULED' as TransactionStatus,
      updatedAt: now,
      lastUpdatedByRole: 'seller',
      pickup: {
        ...orderData.pickup,
        agreedAt: now,
      },
    };

    const sanitized = sanitizeFirestorePayload(updateData);
    if (process.env.NODE_ENV !== 'production') {
      assertNoCorruptInt32(sanitized);
    }
    await orderRef.update(sanitized);

    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `PICKUP_AGREED:${orderId}`,
          type: 'SELLER_PREPARING',
          label: 'Seller agreed to pickup window',
          actor: 'seller',
          visibility: 'buyer',
          timestamp: Timestamp.fromDate(now),
          meta: { windowStart: start.toISOString(), windowEnd: end.toISOString() },
        },
      });
    } catch {
      /* best-effort */
    }

    try {
      const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = (listingDoc.data() as any)?.title || 'Your order';
      const ev = await emitAndProcessEventForUser({
        type: 'Order.PickupWindowAgreed',
        actorId: sellerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.buyerId,
        payload: {
          type: 'Order.PickupWindowAgreed',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/dashboard/orders/${orderId}`,
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
        },
        optionalHash: `pickup_window_agreed:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.PickupWindowAgreed',
            jobId: ev.eventId,
            orderId: params.orderId,
            endpoint: '/api/orders/[orderId]/fulfillment/agree-pickup-window',
          });
        });
      }
    } catch (e) {
      console.error('Error emitting Order.PickupWindowAgreed notification event:', e);
    }

    return json({
      success: true,
      orderId,
      transactionStatus: 'PICKUP_SCHEDULED',
      message: 'Pickup window agreed. Buyer can confirm pickup with the code.',
    });
  } catch (error: any) {
    console.error('Error agreeing to pickup window:', error);
    return json({ error: 'Failed to agree to pickup window', message: error.message }, { status: 500 });
  }
}
