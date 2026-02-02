/**
 * POST /api/delivery/buyer-pin
 *
 * Auth required. Buyer fetches their delivery PIN for an order.
 * Only the order's buyer can retrieve the PIN.
 */

import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';

function json(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request) {
  try {
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, { status: rateLimitResult.status });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(authHeader.split('Bearer ')[1]!);
      uid = decoded.uid;
    } catch {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : null;
    if (!orderId) return json({ error: 'orderId required' }, { status: 400 });

    const db = getAdminDb();
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) return json({ error: 'Order not found' }, { status: 404 });

    const order = orderDoc.data()!;
    if (order.buyerId !== uid) {
      return json({ error: 'Only the buyer can view the delivery PIN' }, { status: 403 });
    }

    const sessionSnap = await db
      .collection('deliverySessions')
      .where('orderId', '==', orderId)
      .limit(1)
      .get();

    if (sessionSnap.empty) {
      return json({ error: 'Delivery session not yet created. The seller will set it up when delivery is scheduled.' }, { status: 404 });
    }

    const session = sessionSnap.docs[0]!.data();
    if (session.status !== 'active') {
      return json({ error: 'Delivery session no longer active' }, { status: 400 });
    }

    const deliveryPin = (session.deliveryPin ?? '').toString();
    if (!deliveryPin) {
      return json({ error: 'PIN not yet generated' }, { status: 404 });
    }

    return json({ deliveryPin });
  } catch (error: any) {
    console.error('[buyer-pin]', error);
    return json({ error: 'Failed to get PIN' }, { status: 500 });
  }
}
