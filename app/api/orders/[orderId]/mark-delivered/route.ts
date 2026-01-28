/**
 * POST /api/orders/[orderId]/mark-delivered
 *
 * SELLER_TRANSPORT: Seller marks order as delivered. Requires at least one DELIVERY_PROOF
 * document (photo of animal delivered). Transitions: OUT_FOR_DELIVERY → DELIVERED_PENDING_CONFIRMATION.
 * Buyer confirms receipt separately to complete the transaction.
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

    const sellerId = decodedToken.uid;
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    if (orderData.sellerId !== sellerId) {
      return json({ error: 'Unauthorized - You can only mark your own orders as delivered' }, { status: 403 });
    }

    const transportOption = orderData.transportOption || 'SELLER_TRANSPORT';
    if (transportOption !== 'SELLER_TRANSPORT') {
      return json(
        { error: 'Invalid transport option', details: 'This endpoint is for SELLER_TRANSPORT orders only.' },
        { status: 400 }
      );
    }

    const currentTxStatus = orderData.transactionStatus as TransactionStatus | undefined;
    const allowedStatuses: TransactionStatus[] = ['OUT_FOR_DELIVERY', 'DELIVERY_SCHEDULED'];
    if (!currentTxStatus || !allowedStatuses.includes(currentTxStatus)) {
      return json(
        {
          error: 'Invalid status',
          details: `Cannot mark delivered. Current status: ${currentTxStatus || orderData.status}. Order must be out for delivery or delivery scheduled.`,
        },
        { status: 400 }
      );
    }

    const proofSnap = await orderRef.collection('documents').where('type', '==', 'DELIVERY_PROOF').get();
    if (!proofSnap.size) {
      return json(
        {
          error: 'Delivery photo required',
          details: 'Upload a photo of the animal delivered before marking as delivered. Use the upload in the Mark delivered dialog.',
        },
        { status: 400 }
      );
    }

    const proofUrls = proofSnap.docs
      .map((d) => d.data().documentUrl)
      .filter((u): u is string => typeof u === 'string' && u.length > 0);

    const now = new Date();
    const proofUploads = proofUrls.map((url) => ({ type: 'DELIVERY_PROOF', url, uploadedAt: now }));

    const updateData: Record<string, unknown> = {
      transactionStatus: 'DELIVERED_PENDING_CONFIRMATION' as TransactionStatus,
      status: 'delivered',
      deliveredAt: now,
      updatedAt: now,
      lastUpdatedByRole: 'seller',
      deliveryProofUrls: proofUrls,
      'delivery.proofUploads': proofUploads,
      'delivery.deliveredAt': now,
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
          id: `DELIVERED:${orderId}`,
          type: 'SELLER_SHIPPED',
          label: 'Seller marked as delivered',
          actor: 'seller',
          visibility: 'buyer',
          timestamp: Timestamp.fromDate(now),
          meta: { proofCount: proofUrls.length },
        },
      });
    } catch {
      /* best-effort */
    }

    try {
      const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = (listingDoc.data() as any)?.title || 'Your order';
      const ev = await emitAndProcessEventForUser({
        type: 'Order.Delivered',
        actorId: sellerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.buyerId,
        payload: {
          type: 'Order.Delivered',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/dashboard/orders/${orderId}`,
        },
        optionalHash: `delivered:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.Delivered',
            jobId: ev.eventId,
            orderId,
            endpoint: '/api/orders/[orderId]/mark-delivered',
          });
        });
      }
    } catch (e) {
      console.error('Error emitting Order.Delivered notification event:', e);
    }

    return json({
      success: true,
      orderId,
      transactionStatus: 'DELIVERED_PENDING_CONFIRMATION',
      message: 'Order marked as delivered. Buyer can confirm receipt.',
    });
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/orders/[orderId]/mark-delivered',
      orderId,
      errorMessage: error.message,
    });
    return json({ error: 'Failed to mark order as delivered', message: error.message }, { status: 500 });
  }
}
