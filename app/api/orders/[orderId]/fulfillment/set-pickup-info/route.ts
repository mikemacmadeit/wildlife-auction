/**
 * POST /api/orders/[orderId]/fulfillment/set-pickup-info
 * 
 * BUYER_TRANSPORT: Seller sets pickup location, available windows, and generates pickup code
 * Transitions: FULFILLMENT_REQUIRED → READY_FOR_PICKUP
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

const setPickupInfoSchema = z.object({
  location: z.string().min(1, 'Location is required'),
  windows: z.array(z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  })).min(1, 'At least one pickup window is required'),
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

/**
 * Generate a 6-digit pickup code
 */
function generatePickupCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
    const validation = setPickupInfoSchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { location, windows } = validation.data;

    // Validate windows (end must be after start)
    for (const window of windows) {
      const start = new Date(window.start);
      const end = new Date(window.end);
      if (end <= start) {
        return json({ error: 'Invalid window', details: 'Window end must be after start' }, { status: 400 });
      }
    }

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
    const allowedStatuses: TransactionStatus[] = ['FULFILLMENT_REQUIRED', 'READY_FOR_PICKUP'];
    
    // Also allow legacy statuses for backward compatibility
    const currentLegacyStatus = orderData.status;
    const isLegacyAllowed = ['paid', 'paid_held'].includes(currentLegacyStatus);
    
    if (!currentTxStatus && !isLegacyAllowed) {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot set pickup info. Current status: ${currentTxStatus || currentLegacyStatus}`
        },
        { status: 400 }
      );
    }

    if (currentTxStatus && !allowedStatuses.includes(currentTxStatus)) {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot set pickup info. Current status: ${currentTxStatus}`
        },
        { status: 400 }
      );
    }

    // Generate pickup code if not already set
    const pickupCode = orderData.pickup?.pickupCode || generatePickupCode();

    // Convert window strings to Date objects
    const windowsWithDates = windows.map(w => ({
      start: new Date(w.start),
      end: new Date(w.end),
    }));

    // Update order
    const now = new Date();
    const updateData: any = {
      transactionStatus: 'READY_FOR_PICKUP' as TransactionStatus,
      updatedAt: now,
      lastUpdatedByRole: 'seller',
      pickup: {
        location,
        windows: windowsWithDates,
        pickupCode,
        // Keep existing selectedWindow and confirmedAt if already set
        ...(orderData.pickup?.selectedWindow ? { selectedWindow: orderData.pickup.selectedWindow } : {}),
        ...(orderData.pickup?.confirmedAt ? { confirmedAt: orderData.pickup.confirmedAt } : {}),
        ...(orderData.pickup?.proofPhotos ? { proofPhotos: orderData.pickup.proofPhotos } : {}),
      },
    };

    await orderRef.update(updateData);

    // Timeline (server-authored, idempotent).
    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `PICKUP_INFO_SET:${orderId}`,
          type: 'SELLER_PREPARING',
          label: 'Seller set pickup information',
          actor: 'seller',
          visibility: 'buyer',
          timestamp: Timestamp.fromDate(now),
          meta: { location, windowsCount: windows.length },
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
        type: 'Order.PickupReady',
        actorId: sellerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.buyerId,
        payload: {
          type: 'Order.PickupReady',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/dashboard/orders/${orderId}`,
          location,
        },
        optionalHash: `pickup_ready:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.PickupReady',
            jobId: ev.eventId,
            orderId: params.orderId,
            endpoint: '/api/orders/[orderId]/fulfillment/set-pickup-info',
          });
        });
      }
    } catch (e) {
      console.error('Error emitting Order.PickupReady notification event:', e);
    }

    return json({
      success: true,
      orderId,
      transactionStatus: 'READY_FOR_PICKUP',
      pickupCode, // Return code to seller (they need to share it with buyer)
      message: 'Pickup information set successfully. Share the pickup code with the buyer.',
    });
  } catch (error: any) {
    console.error('Error setting pickup info:', error);
    return json({ error: 'Failed to set pickup info', message: error.message }, { status: 500 });
  }
}
