/**
 * POST /api/orders/[orderId]/fulfillment/select-pickup-window
 * 
 * BUYER_TRANSPORT: Buyer selects a pickup window from seller's available windows
 * Transitions: READY_FOR_PICKUP → PICKUP_SCHEDULED
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

const selectPickupWindowSchema = z.object({
  selectedWindowIndex: z.number().int().min(0),
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
    const validation = selectPickupWindowSchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { selectedWindowIndex } = validation.data;

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
    if (currentTxStatus !== 'READY_FOR_PICKUP') {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot select pickup window. Current status: ${currentTxStatus || orderData.status}. Order must be in READY_FOR_PICKUP state.`
        },
        { status: 400 }
      );
    }

    // Validate pickup info exists
    if (!orderData.pickup?.location || !orderData.pickup?.windows || !Array.isArray(orderData.pickup.windows)) {
      return json(
        { 
          error: 'Pickup info not set',
          details: 'Seller must set pickup information before you can select a window.'
        },
        { status: 400 }
      );
    }

    // Validate window index
    const windows = orderData.pickup.windows;
    if (selectedWindowIndex < 0 || selectedWindowIndex >= windows.length) {
      return json(
        { 
          error: 'Invalid window index',
          details: `Window index ${selectedWindowIndex} is out of range. Available windows: ${windows.length}`
        },
        { status: 400 }
      );
    }

    const selectedWindow = windows[selectedWindowIndex];
    
    // Convert Firestore Timestamps to Date objects if needed
    const windowStart = selectedWindow.start?.toDate ? selectedWindow.start.toDate() : new Date(selectedWindow.start);
    const windowEnd = selectedWindow.end?.toDate ? selectedWindow.end.toDate() : new Date(selectedWindow.end);

    // Update order
    const now = new Date();
    const updateData: any = {
      transactionStatus: 'PICKUP_SCHEDULED' as TransactionStatus,
      updatedAt: now,
      lastUpdatedByRole: 'buyer',
      pickup: {
        ...orderData.pickup,
        selectedWindow: {
          start: windowStart,
          end: windowEnd,
        },
      },
    };

    await orderRef.update(updateData);

    // Timeline (server-authored, idempotent).
    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `PICKUP_WINDOW_SELECTED:${orderId}`,
          type: 'ORDER_PLACED', // Using placeholder - buyer action
          label: 'Buyer selected pickup window',
          actor: 'buyer',
          visibility: 'seller',
          timestamp: Timestamp.fromDate(now),
          meta: { 
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
          },
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
        type: 'Order.PickupWindowSelected',
        actorId: buyerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.sellerId,
        payload: {
          type: 'Order.PickupWindowSelected',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/seller/orders/${orderId}`,
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
        },
        optionalHash: `pickup_window_selected:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.PickupWindowSelected',
            jobId: ev.eventId,
            orderId: params.orderId,
            endpoint: '/api/orders/[orderId]/fulfillment/select-pickup-window',
          });
        });
      }
    } catch (e) {
      console.error('Error emitting Order.PickupWindowSelected notification event:', e);
    }

    return json({
      success: true,
      orderId,
      transactionStatus: 'PICKUP_SCHEDULED',
      selectedWindow: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
      },
      message: 'Pickup window selected successfully.',
    });
  } catch (error: any) {
    console.error('Error selecting pickup window:', error);
    return json({ error: 'Failed to select pickup window', message: error.message }, { status: 500 });
  }
}
