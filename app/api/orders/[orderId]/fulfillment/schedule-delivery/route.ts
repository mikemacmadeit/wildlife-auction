/**
 * POST /api/orders/[orderId]/fulfillment/schedule-delivery
 * 
 * SELLER_TRANSPORT: Seller sets delivery ETA and optional transporter info
 * Transitions: FULFILLMENT_REQUIRED → DELIVERY_SCHEDULED
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
import { sanitizeFirestorePayload } from '@/lib/firebase/sanitizeFirestore';
import { assertNoCorruptInt32 } from '@/lib/firebase/assertNoCorruptInt32';

const scheduleDeliverySchema = z.object({
  eta: z.string().datetime(), // ISO 8601 datetime string
  transporter: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    plate: z.string().optional(),
  }).optional(),
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
    const body = await request.json();
    const validation = scheduleDeliverySchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { eta, transporter } = validation.data;
    const etaDate = new Date(eta);

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
    const allowedStatuses: TransactionStatus[] = ['FULFILLMENT_REQUIRED', 'DELIVERY_SCHEDULED'];
    
    // Also allow legacy statuses for backward compatibility
    const currentLegacyStatus = orderData.status;
    const isLegacyAllowed = ['paid', 'paid_held'].includes(currentLegacyStatus);
    
    if (!currentTxStatus && !isLegacyAllowed) {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot schedule delivery. Current status: ${currentTxStatus || currentLegacyStatus}`
        },
        { status: 400 }
      );
    }

    if (currentTxStatus && !allowedStatuses.includes(currentTxStatus)) {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot schedule delivery. Current status: ${currentTxStatus}`
        },
        { status: 400 }
      );
    }

    // Update order
    const now = new Date();
    const updateData: any = {
      transactionStatus: 'DELIVERY_SCHEDULED' as TransactionStatus,
      updatedAt: now,
      lastUpdatedByRole: 'seller',
      delivery: {
        ...(orderData.delivery || {}),
        eta: etaDate,
        ...(transporter ? { transporter } : {}),
      },
    };

    // Sanitize payload before writing to prevent int32 serialization errors
    const sanitizedUpdateData = sanitizeFirestorePayload(updateData);
    if (process.env.NODE_ENV !== 'production') {
      assertNoCorruptInt32(sanitizedUpdateData);
    }
    await orderRef.update(sanitizedUpdateData);

    // Timeline (server-authored, idempotent).
    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `DELIVERY_SCHEDULED:${orderId}`,
          type: 'SELLER_PREPARING',
          label: 'Seller scheduled delivery',
          actor: 'seller',
          visibility: 'buyer',
          timestamp: Timestamp.fromDate(now),
          meta: { eta: etaDate.toISOString(), transporter: transporter || null },
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
        type: 'Order.DeliveryScheduled',
        actorId: sellerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.buyerId,
        payload: {
          type: 'Order.DeliveryScheduled',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/dashboard/orders/${orderId}`,
          eta: etaDate.toISOString(),
        },
        optionalHash: `delivery_scheduled:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch(() => {});
      }
    } catch (e) {
      console.error('Error emitting Order.DeliveryScheduled notification event:', e);
    }

    return json({
      success: true,
      orderId,
      transactionStatus: 'DELIVERY_SCHEDULED',
      eta: etaDate.toISOString(),
      message: 'Delivery scheduled successfully.',
    });
  } catch (error: any) {
    console.error('Error scheduling delivery:', error);
    return json({ error: 'Failed to schedule delivery', message: error.message }, { status: 500 });
  }
}
