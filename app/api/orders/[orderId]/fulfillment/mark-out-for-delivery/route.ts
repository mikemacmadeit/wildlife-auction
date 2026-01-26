/**
 * POST /api/orders/[orderId]/fulfillment/mark-out-for-delivery
 * 
 * SELLER_TRANSPORT: Seller marks order as out for delivery (optional step)
 * Transitions: DELIVERY_SCHEDULED → OUT_FOR_DELIVERY
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

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
    }

    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const sellerId = decodedToken.uid;
    const orderId = params.orderId;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Verify seller owns this order
    if (orderData.sellerId !== sellerId) {
      return json({ error: 'Unauthorized - You can only update your own orders' }, { status: 403 });
    }

    // Verify transport option
    const transportOption = orderData.transportOption || 'SELLER_TRANSPORT';
    if (transportOption !== 'SELLER_TRANSPORT') {
      return json(
        { 
          error: 'Invalid transport option',
          details: 'This endpoint is for SELLER_TRANSPORT orders only.'
        },
        { status: 400 }
      );
    }

    // Validate status transition
    const currentTxStatus = orderData.transactionStatus as TransactionStatus | undefined;
    const allowedStatuses: TransactionStatus[] = ['DELIVERY_SCHEDULED'];
    
    // Also allow legacy statuses for backward compatibility
    const currentLegacyStatus = orderData.status;
    const isLegacyAllowed = ['paid', 'paid_held', 'in_transit'].includes(currentLegacyStatus);
    
    if (!currentTxStatus && !isLegacyAllowed) {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot mark out for delivery. Current status: ${currentTxStatus || currentLegacyStatus}`
        },
        { status: 400 }
      );
    }

    if (currentTxStatus && !allowedStatuses.includes(currentTxStatus)) {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot mark out for delivery. Current status: ${currentTxStatus}`
        },
        { status: 400 }
      );
    }

    // Update order
    const now = new Date();
    const updateData: any = {
      transactionStatus: 'OUT_FOR_DELIVERY' as TransactionStatus,
      updatedAt: now,
      lastUpdatedByRole: 'seller',
      inTransitAt: Timestamp.fromDate(now), // Legacy field for backward compatibility
    };

    await orderRef.update(updateData);

    // Timeline (server-authored, idempotent).
    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `OUT_FOR_DELIVERY:${orderId}`,
          type: 'SELLER_SHIPPED',
          label: 'Seller marked out for delivery',
          actor: 'seller',
          visibility: 'buyer',
          timestamp: Timestamp.fromDate(now),
        },
      });
    } catch {
      // best-effort
    }

    // Emit notification to buyer
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
        },
        optionalHash: `out_for_delivery:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.InTransit',
            jobId: ev.eventId,
            orderId: params.orderId,
            endpoint: '/api/orders/[orderId]/fulfillment/mark-out-for-delivery',
          });
        });
      }
    } catch (e) {
      console.error('Error emitting Order.InTransit notification event:', e);
    }

    return json({
      success: true,
      orderId,
      transactionStatus: 'OUT_FOR_DELIVERY',
      message: 'Order marked as out for delivery.',
    });
  } catch (error: any) {
    console.error('Error marking out for delivery:', error);
    return json({ error: 'Failed to mark out for delivery', message: error.message }, { status: 500 });
  }
}
