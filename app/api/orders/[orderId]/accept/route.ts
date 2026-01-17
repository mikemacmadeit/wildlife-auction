/**
 * POST /api/orders/[orderId]/accept
 * 
 * Buyer confirms receipt
 * Transitions: paid_held/paid/in_transit/delivered → buyer_confirmed (or ready_to_release if eligible)
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
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

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Verify buyer owns this order
    if (orderData.buyerId !== buyerId) {
      return json({ error: 'Unauthorized - You can only accept your own orders' }, { status: 403 });
    }

    // Validate status transition (back-compat: 'paid' treated same as 'paid_held')
    const currentStatus = orderData.status as OrderStatus;
    const allowedStatuses: OrderStatus[] = ['paid', 'paid_held', 'in_transit', 'delivered'];
    
    if (!allowedStatuses.includes(currentStatus)) {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot accept order with status '${currentStatus}'. Order must be in one of: ${allowedStatuses.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Check if already disputed
    if (currentStatus === 'disputed') {
      return json({ error: 'Cannot accept a disputed order. Please wait for admin resolution.' }, { status: 400 });
    }

    // Check if already accepted
    if (currentStatus === 'accepted') {
      return json({ error: 'Order already accepted' }, { status: 400 });
    }

    // Require delivery to be marked before buyer can confirm receipt.
    // Accept either seller-marked `deliveredAt` or ops/admin `deliveryConfirmedAt`.
    if (!orderData.deliveredAt && !orderData.deliveryConfirmedAt) {
      return json(
        {
          error: 'Delivery not confirmed',
          details: 'Delivery must be marked as delivered before you can confirm receipt.',
        },
        { status: 400 }
      );
    }

    // Update order to buyer_confirmed (canonical)
    const now = new Date();
    const updateData: any = {
      status: 'buyer_confirmed' as OrderStatus,
      buyerConfirmedAt: now,
      // Maintain legacy fields for older UI and protected transaction code paths
      acceptedAt: now,
      buyerAcceptedAt: now,
      updatedAt: now,
      lastUpdatedByRole: 'buyer',
    };

    // If protected transaction and no open dispute, mark as ready_to_release
    if (
      orderData.protectedTransactionDaysSnapshot &&
      (!orderData.protectedDisputeStatus || orderData.protectedDisputeStatus === 'none')
    ) {
      updateData.status = 'ready_to_release';
      updateData.payoutHoldReason = 'none';
    }

    await orderRef.update(updateData);

    return json({
      success: true,
      orderId,
      status: updateData.status,
      buyerConfirmedAt: now,
      message: updateData.status === 'ready_to_release' 
        ? 'Order accepted. Funds will be released to seller.'
        : 'Order accepted successfully. Funds will be released to seller.',
    });
  } catch (error: any) {
    console.error('Error accepting order:', error);
    return json({ error: 'Failed to accept order', message: error.message }, { status: 500 });
  }
}
