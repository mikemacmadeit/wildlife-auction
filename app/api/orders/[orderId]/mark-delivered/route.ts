/**
 * POST /api/orders/[orderId]/mark-delivered
 *
 * Sellers cannot confirm delivery. Only the buyer confirms receipt to complete the transaction.
 * This route always returns 400. Sellers use "Mark out for delivery" when the order is on the way.
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
import { getFirestore } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
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
      return json({ error: 'Unauthorized - You can only mark your own orders as delivered' }, { status: 403 });
    }

    // Sellers cannot confirm delivery. Only the buyer confirms receipt to complete the transaction.
    return json(
      {
        error: 'Sellers cannot confirm delivery',
        details: 'Only the buyer confirms receipt to complete the transaction. Use "Mark out for delivery" when the order is on the way; the buyer will confirm receipt when they receive it.',
      },
      { status: 400 }
    );
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/orders/[orderId]/mark-delivered',
      orderId: params.orderId,
      errorMessage: error.message,
    });
    return json({ error: 'Failed to mark order as delivered', message: error.message }, { status: 500 });
  }
}
