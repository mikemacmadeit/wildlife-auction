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
import { OrderStatus } from '@/lib/types';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';

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

    // Validate status transition
    const currentStatus = orderData.status as OrderStatus;
    const allowedStatuses: OrderStatus[] = ['paid', 'paid_held', 'in_transit'];
    
    if (!allowedStatuses.includes(currentStatus)) {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot mark delivered for order with status '${currentStatus}'. Order must be in one of: ${allowedStatuses.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Check if already delivered or beyond
    if (['delivered', 'accepted', 'buyer_confirmed', 'ready_to_release', 'completed', 'disputed'].includes(currentStatus)) {
      return json({ error: `Order is already ${currentStatus}` }, { status: 400 });
    }

    // Update order to delivered
    const now = new Date();
    const updateData: any = {
      status: 'delivered' as OrderStatus,
      deliveredAt: now,
      updatedAt: now,
      lastUpdatedByRole: 'seller',
    };

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

    return json({
      success: true,
      orderId,
      status: 'delivered',
      deliveredAt: now,
      message: 'Order marked as delivered. Buyer can now accept or dispute.',
    });
  } catch (error: any) {
    console.error('Error marking order as delivered:', error);
    return json({ error: 'Failed to mark order as delivered', message: error.message }, { status: 500 });
  }
}
