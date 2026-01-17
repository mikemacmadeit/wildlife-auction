/**
 * POST /api/orders/[orderId]/mark-in-transit
 *
 * Phase 2C (Option A - preferred):
 * - Seller-initiated explicit transition to `status: 'in_transit'`
 * - Emits `Order.InTransit` so buyers get a visible state change
 *
 * NOTE: This does NOT change escrow/payout logic. It only makes an implicit step explicit.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { emitEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { OrderStatus } from '@/lib/types';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

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
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
    }

    // Auth
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    let decodedToken: any;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const sellerId = decodedToken.uid;
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
          details: `Cannot mark in transit for order with status '${currentStatus}'. Order must be in one of: ${allowedStatuses.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    await orderRef.update({
      status: 'in_transit' as OrderStatus,
      updatedAt: now,
      lastUpdatedByRole: 'seller',
      // Keep a server timestamp as well for audit/ordering if needed in other systems.
      lastStatusChangeAt: Timestamp.now(),
    });

    // Emit canonical notification event for buyer
    try {
      const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = listingDoc.data()?.title || 'Your listing';
      await emitEventForUser({
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
        optionalHash: `in_transit:${now.toISOString()}`,
      });
    } catch (e) {
      console.error('Error emitting Order.InTransit notification event:', e);
    }

    return json({
      success: true,
      orderId,
      status: 'in_transit',
      message: 'Order marked as in transit.',
    });
  } catch (error: any) {
    console.error('Error marking order as in transit:', error);
    return json({ error: 'Failed to mark order as in transit', message: error.message }, { status: 500 });
  }
}

