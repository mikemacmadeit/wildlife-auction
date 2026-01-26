/**
 * POST /api/orders/[orderId]/fulfillment/confirm-pickup
 * 
 * BUYER_TRANSPORT: Buyer confirms pickup with pickup code
 * Transitions: PICKUP_SCHEDULED → PICKED_UP → COMPLETED
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

const confirmPickupSchema = z.object({
  pickupCode: z.string().length(6, 'Pickup code must be 6 digits'),
  proofPhotos: z.array(z.string().url()).optional(),
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

    const buyerId = decodedToken.uid;
    const orderId = params.orderId;

    // Parse and validate request body
    const body = await request.json();
    const validation = confirmPickupSchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { pickupCode, proofPhotos } = validation.data;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Verify buyer owns this order
    if (orderData.buyerId !== buyerId) {
      return json({ error: 'Unauthorized - You can only update your own orders' }, { status: 403 });
    }

    // Verify transport option
    const transportOption = orderData.transportOption || 'BUYER_TRANSPORT';
    if (transportOption !== 'BUYER_TRANSPORT') {
      return json(
        { 
          error: 'Invalid transport option',
          details: 'This endpoint is for BUYER_TRANSPORT orders only.'
        },
        { status: 400 }
      );
    }

    // Validate status transition
    const currentTxStatus = orderData.transactionStatus as TransactionStatus | undefined;
    if (currentTxStatus !== 'PICKUP_SCHEDULED') {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot confirm pickup. Current status: ${currentTxStatus || orderData.status}. Order must be in PICKUP_SCHEDULED state.`
        },
        { status: 400 }
      );
    }

    // Validate pickup code
    const expectedCode = orderData.pickup?.pickupCode;
    if (!expectedCode) {
      return json(
        { 
          error: 'Pickup code not set',
          details: 'Seller must set pickup information before you can confirm pickup.'
        },
        { status: 400 }
      );
    }

    if (pickupCode !== expectedCode) {
      return json(
        { 
          error: 'Invalid pickup code',
          details: 'The pickup code you entered does not match. Please check with the seller.'
        },
        { status: 400 }
      );
    }

    // Update order
    const now = new Date();
    const updateData: any = {
      transactionStatus: 'COMPLETED' as TransactionStatus, // Directly to COMPLETED (PICKED_UP is implicit)
      status: 'completed', // Legacy status for backward compatibility
      updatedAt: now,
      lastUpdatedByRole: 'buyer',
      buyerConfirmedAt: now, // Legacy field
      completedAt: now,
      pickup: {
        ...orderData.pickup,
        confirmedAt: now,
        ...(proofPhotos && proofPhotos.length > 0 ? { proofPhotos } : {}),
      },
    };

    await orderRef.update(updateData);

    // Timeline (server-authored, idempotent).
    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `PICKUP_CONFIRMED:${orderId}`,
          type: 'BUYER_CONFIRMED',
          label: 'Buyer confirmed pickup',
          actor: 'buyer',
          visibility: 'seller',
          timestamp: Timestamp.fromDate(now),
          ...(proofPhotos?.length ? { meta: { proofPhotosCount: proofPhotos.length } } : {}),
        },
      });
    } catch {
      // best-effort
    }

    // Emit notification to seller
    try {
      const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = listingDoc.data()?.title || 'Your listing';
      const ev = await emitAndProcessEventForUser({
        type: 'Order.PickupConfirmed',
        actorId: buyerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.sellerId,
        payload: {
          type: 'Order.PickupConfirmed',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/seller/orders/${orderId}`,
        },
        optionalHash: `pickup_confirmed:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch(() => {});
      }
    } catch (e) {
      console.error('Error emitting Order.Received notification event:', e);
    }

    return json({
      success: true,
      orderId,
      transactionStatus: 'COMPLETED',
      message: 'Pickup confirmed. Transaction complete. Seller was paid immediately upon successful payment.',
    });
  } catch (error: any) {
    console.error('Error confirming pickup:', error);
    return json({ error: 'Failed to confirm pickup', message: error.message }, { status: 500 });
  }
}
