/**
 * POST /api/orders/[orderId]/confirm-final-payment
 *
 * When the buyer returns from Stripe Checkout with session_id, this endpoint
 * verifies the session and applies the final payment (same logic as webhook).
 * Ensures the order updates immediately even if the webhook is delayed or not reachable (e.g. local dev).
 */

import { getFirestore } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { handleFinalPaymentCompleted } from '@/app/api/stripe/webhook/handlers';

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

    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter?.toString() },
      });
    }

    if (!isStripeConfigured() || !stripe) {
      return json({ error: 'Stripe is not configured' }, { status: 503 });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(authHeader.split('Bearer ')[1]!);
      uid = decoded.uid;
    } catch {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const orderId = params?.orderId?.trim();
    if (!orderId) {
      return json({ error: 'orderId required' }, { status: 400 });
    }

    let body: { session_id?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const sessionId = (body.session_id ?? '').trim();
    if (!sessionId || !sessionId.startsWith('cs_')) {
      return json({ error: 'session_id required (Stripe checkout session id)' }, { status: 400 });
    }

    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderSnap.data() as any;
    if (orderData.buyerId !== uid) {
      return json({ error: 'Only the buyer can confirm final payment' }, { status: 403 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paymentStatus = (session as any).payment_status;
    const metadata = (session.metadata || {}) as Record<string, string>;

    if (paymentStatus !== 'paid') {
      return json(
        { error: 'Payment not complete yet', payment_status: paymentStatus },
        { status: 400 }
      );
    }

    if (metadata.paymentType !== 'final') {
      return json({ error: 'This session is not a final payment' }, { status: 400 });
    }

    if (String(metadata.orderId || '').trim() !== orderId || String(metadata.buyerId || '').trim() !== uid) {
      return json({ error: 'Session does not match this order' }, { status: 400 });
    }

    if (orderData.finalPaymentConfirmedAt) {
      return json({ applied: false, alreadyConfirmed: true });
    }

    await handleFinalPaymentCompleted(db, session as any);

    return json({ applied: true });
  } catch (e: any) {
    console.error('[confirm-final-payment]', e);
    return json(
      { error: e?.message || 'Failed to confirm final payment' },
      { status: 500 }
    );
  }
}
