/**
 * POST /api/orders/[orderId]/mark-delivered
 * 
 * Seller marks order as delivered
 * Transitions: paid/in_transit → delivered
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { OrderStatus, TransactionStatus } from '@/lib/types';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { captureException } from '@/lib/monitoring/capture';

const markDeliveredSchema = z.object({
  deliveryProofUrls: z.array(z.string().url()).optional(),
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

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      body = {}; // Optional body
    }

    const validation = markDeliveredSchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { deliveryProofUrls } = validation.data;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Verify seller owns this order
    if (orderData.sellerId !== sellerId) {
      return json({ error: 'Unauthorized - You can only mark your own orders as delivered' }, { status: 403 });
    }

    // Validate transport option - this endpoint is for SELLER_TRANSPORT only
    const transportOption = orderData.transportOption || 'SELLER_TRANSPORT';
    if (transportOption !== 'SELLER_TRANSPORT') {
      return json(
        { 
          error: 'Invalid transport option',
          details: 'This endpoint is for SELLER_TRANSPORT orders only. Use pickup endpoints for BUYER_TRANSPORT orders.'
        },
        { status: 400 }
      );
    }

    // Validate status transition - check transactionStatus if available, else legacy status
    const currentTxStatus = orderData.transactionStatus as TransactionStatus | undefined;
    const currentLegacyStatus = orderData.status as OrderStatus;
    
    // Allowed states: FULFILLMENT_REQUIRED, DELIVERY_SCHEDULED, OUT_FOR_DELIVERY
    const allowedTxStatuses: TransactionStatus[] = ['FULFILLMENT_REQUIRED', 'DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY'];
    const allowedLegacyStatuses: OrderStatus[] = ['paid', 'paid_held', 'in_transit'];
    
    const isValidTransition = currentTxStatus 
      ? allowedTxStatuses.includes(currentTxStatus)
      : allowedLegacyStatuses.includes(currentLegacyStatus);
    
    if (!isValidTransition) {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot mark delivered. Current status: ${currentTxStatus || currentLegacyStatus}`
        },
        { status: 400 }
      );
    }

    // Check if already delivered or beyond
    if (currentTxStatus === 'DELIVERED_PENDING_CONFIRMATION' || currentTxStatus === 'COMPLETED' || 
        ['delivered', 'accepted', 'buyer_confirmed', 'ready_to_release', 'completed', 'disputed'].includes(currentLegacyStatus)) {
      return json({ error: `Order is already ${currentTxStatus || currentLegacyStatus}` }, { status: 400 });
    }

    // Update order to delivered
    const now = new Date();
    const updateData: any = {
      status: 'delivered' as OrderStatus, // Legacy status for backward compatibility
      transactionStatus: 'DELIVERED_PENDING_CONFIRMATION' as TransactionStatus, // NEW: Primary status
      deliveredAt: now,
      updatedAt: now,
      lastUpdatedByRole: 'seller',
    };

    // Populate delivery object
    updateData.delivery = {
      ...(orderData.delivery || {}),
      deliveredAt: now,
      ...(deliveryProofUrls && deliveryProofUrls.length > 0 ? { 
        proofUploads: [
          ...(orderData.delivery?.proofUploads || []),
          ...deliveryProofUrls.map(url => ({ type: 'delivery_proof', url, uploadedAt: now }))
        ]
      } : {}),
    };

    // Legacy field for backward compatibility
    if (deliveryProofUrls && deliveryProofUrls.length > 0) {
      updateData.deliveryProofUrls = deliveryProofUrls;
    }

    await orderRef.update(updateData);

    // Timeline (server-authored, idempotent).
    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `DELIVERED:${orderId}`,
          type: 'DELIVERED',
          label: 'Seller marked delivered',
          actor: 'seller',
          visibility: 'buyer',
          timestamp: Timestamp.fromDate(now),
          ...(deliveryProofUrls?.length ? { meta: { deliveryProofUrlsCount: deliveryProofUrls.length } } : {}),
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
            orderId: params.orderId,
            endpoint: '/api/orders/[orderId]/mark-delivered',
          });
        });
      }
    } catch (e) {
      captureException(e instanceof Error ? e : new Error(String(e)), {
        endpoint: '/api/orders/[orderId]/mark-delivered',
        orderId: params.orderId,
        context: 'Order.Delivered notification event',
      });
    }

    return json({
      success: true,
      orderId,
      status: 'delivered',
      deliveredAt: now,
      message: 'Order marked as delivered. Buyer can now accept or dispute.',
    });
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/orders/[orderId]/mark-delivered',
      orderId: params.orderId,
      errorMessage: error.message,
    });
    return json({ error: 'Failed to mark order as delivered', message: error.message }, { status: 500 });
  }
}
