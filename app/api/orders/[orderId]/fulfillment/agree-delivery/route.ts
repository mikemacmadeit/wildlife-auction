/**
 * POST /api/orders/[orderId]/fulfillment/agree-delivery
 *
 * SELLER_TRANSPORT: Buyer agrees to a proposed delivery window.
 * Transitions: DELIVERY_PROPOSED → DELIVERY_SCHEDULED.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { TransactionStatus } from '@/lib/types';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { captureException } from '@/lib/monitoring/capture';
import { sanitizeFirestorePayload } from '@/lib/firebase/sanitizeFirestore';
import { assertNoCorruptInt32 } from '@/lib/firebase/assertNoCorruptInt32';

const agreeDeliverySchema = z.object({
  agreedWindowIndex: z.number().int().min(0),
});

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
  ctx: { params: Promise<{ orderId: string }> | { orderId: string } }
) {
  const params = typeof (ctx.params as any)?.then === 'function' ? await (ctx.params as Promise<{ orderId: string }>) : (ctx.params as { orderId: string });
  const orderId = params?.orderId;
  if (!orderId) {
    return json({ error: 'Order ID required' }, { status: 400 });
  }

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

    const buyerId = decodedToken.uid;

    const body = await request.json();
    const validation = agreeDeliverySchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { agreedWindowIndex } = validation.data;

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    if (orderData.buyerId !== buyerId) {
      return json({ error: 'Unauthorized - You can only update your own orders' }, { status: 403 });
    }

    const transportOption = orderData.transportOption || 'SELLER_TRANSPORT';
    if (transportOption !== 'SELLER_TRANSPORT') {
      return json(
        { error: 'Invalid transport option', details: 'This endpoint is for SELLER_TRANSPORT orders only.' },
        { status: 400 }
      );
    }

    const currentTxStatus = orderData.transactionStatus as TransactionStatus | undefined;
    if (currentTxStatus !== 'DELIVERY_PROPOSED') {
      return json(
        {
          error: 'Invalid status transition',
          details: `Cannot agree to delivery. Current status: ${currentTxStatus || orderData.status}. Order must be DELIVERY_PROPOSED.`,
        },
        { status: 400 }
      );
    }

    const windows = orderData.delivery?.windows;
    if (!Array.isArray(windows) || windows.length === 0) {
      return json(
        { error: 'No delivery windows', details: 'Seller has not proposed delivery windows.' },
        { status: 400 }
      );
    }

    if (agreedWindowIndex < 0 || agreedWindowIndex >= windows.length) {
      return json(
        { error: 'Invalid window index', details: `Window index ${agreedWindowIndex} is out of range.` },
        { status: 400 }
      );
    }

    const w = windows[agreedWindowIndex];
    const start = w?.start?.toDate ? w.start.toDate() : new Date(w?.start);
    const end = w?.end?.toDate ? w.end.toDate() : new Date(w?.end);
    const agreedWindow = { start, end };

    const now = new Date();
    // Use dot notation so we never spread raw Firestore data (avoids serialization/500 issues)
    const updateData: Record<string, unknown> = {
      transactionStatus: 'DELIVERY_SCHEDULED' as TransactionStatus,
      updatedAt: now,
      lastUpdatedByRole: 'buyer',
      'delivery.agreedWindow': agreedWindow,
      'delivery.agreedAt': now,
      'delivery.eta': start,
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
          id: `DELIVERY_AGREED:${orderId}`,
          type: 'ORDER_PLACED',
          label: 'Buyer agreed to delivery window',
          actor: 'buyer',
          visibility: 'seller',
          timestamp: Timestamp.fromDate(now),
          meta: {
            windowStart: start.toISOString(),
            windowEnd: end.toISOString(),
          },
        },
      });
    } catch {
      /* best-effort */
    }

    try {
      const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = (listingDoc.data() as any)?.title || 'Your listing';
      const ev = await emitAndProcessEventForUser({
        type: 'Order.DeliveryAgreed',
        actorId: buyerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.sellerId,
        payload: {
          type: 'Order.DeliveryAgreed',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/seller/orders/${orderId}`,
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
        },
        optionalHash: `delivery_agreed:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.DeliveryAgreed',
            jobId: ev.eventId,
            orderId,
            endpoint: '/api/orders/[orderId]/fulfillment/agree-delivery',
          });
        });
      }
    } catch (e) {
      console.error('Error emitting Order.DeliveryAgreed notification event:', e);
    }

    return json({
      success: true,
      orderId,
      transactionStatus: 'DELIVERY_SCHEDULED',
      agreedWindow: { start: start.toISOString(), end: end.toISOString() },
      message: 'Delivery window agreed. Seller will haul within this timeframe.',
    });
  } catch (error: any) {
    console.error('Error agreeing to delivery:', error);
    return json({ error: 'Failed to agree to delivery', message: error.message }, { status: 500 });
  }
}
