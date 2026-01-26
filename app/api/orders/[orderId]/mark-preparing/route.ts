/**
 * POST /api/orders/[orderId]/mark-preparing
 *
 * Seller marks "preparing for delivery".
 *
 * This is intentionally an explicit UX marker so buyers/sellers always know
 * where they are in the fulfillment timeline.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import type { OrderStatus } from '@/lib/types';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
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

    // Auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    let decoded: any;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const sellerId = decoded.uid;
    const orderId = params.orderId;

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return json({ error: 'Order not found' }, { status: 404 });
    const orderData = orderDoc.data() as any;

    if (orderData.sellerId !== sellerId) {
      return json({ error: 'Unauthorized - You can only update your own orders' }, { status: 403 });
    }

    const currentStatus = orderData.status as OrderStatus;
    const allowedStatuses: OrderStatus[] = ['paid', 'paid_held'];
    if (!allowedStatuses.includes(currentStatus)) {
      return json(
        {
          error: 'Invalid status transition',
          details: `Cannot mark preparing for order with status '${currentStatus}'. Order must be in one of: ${allowedStatuses.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // If seller already marked preparing, idempotent success.
    if (orderData.sellerPreparingAt) {
      return json({ success: true, orderId, message: 'Already marked preparing.' });
    }

    const now = new Date();
    await orderRef.update({
      sellerPreparingAt: Timestamp.now(),
      updatedAt: now,
      lastUpdatedByRole: 'seller',
      lastStatusChangeAt: Timestamp.now(),
    });

    // Timeline (server-authored, idempotent)
    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `SELLER_PREPARING:${orderId}`,
          type: 'SELLER_PREPARING',
          label: 'Seller marked preparing for delivery',
          actor: 'seller',
          visibility: 'buyer',
          timestamp: Timestamp.now(),
        },
      });
    } catch {
      // best-effort
    }

    // Notify buyer (email/in-app per preferences)
    try {
      const listingTitle = String(orderData?.listingSnapshot?.title || '').trim() || 'Your order';
      const ev = await emitAndProcessEventForUser({
        type: 'Order.Preparing',
        actorId: sellerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.buyerId,
        payload: {
          type: 'Order.Preparing',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/dashboard/orders/${orderId}`,
        },
        optionalHash: `preparing:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        // Best-effort: don't rely on schedulers for order timeline emails.
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.Preparing',
            jobId: ev.eventId,
            orderId: params.orderId,
            endpoint: '/api/orders/[orderId]/mark-preparing',
          });
        });
      }
    } catch (e) {
      console.error('Error emitting Order.Preparing notification event:', e);
    }

    return json({
      success: true,
      orderId,
      message: 'Order marked as preparing for delivery.',
    });
  } catch (error: any) {
    console.error('Error marking order as preparing:', error);
    return json({ error: 'Failed to mark order as preparing', message: error?.message }, { status: 500 });
  }
}

