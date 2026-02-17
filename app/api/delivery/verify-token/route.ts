/**
 * POST /api/delivery/verify-token
 *
 * Public. Validates a driver or buyer token.
 * Returns minimal safe info for display (order short id, ranch/brand label, delivery date/time).
 */

import { getFirestore } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminDb } from '@/lib/firebase/admin';
import { verifyDeliveryToken } from '@/lib/delivery/tokens';

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

    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token : null;
    if (!token) {
      return json({ error: 'token required', valid: false }, { status: 400 });
    }

    const payload = verifyDeliveryToken(token);
    if (!payload) {
      return json({ error: 'Invalid or expired link', valid: false }, { status: 401 });
    }

    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
    const sessionRef = db.collection('deliverySessions').doc(payload.sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return json({ error: 'Session not found', valid: false }, { status: 404 });
    }

    const session = sessionDoc.data()!;
    const status = session.status as string;
    const expiresAt = session.expiresAt?.toDate?.() ?? new Date(session.expiresAt);

    if (status !== 'active') {
      if (status === 'delivered') {
        return json({ error: 'Already confirmed', valid: false, alreadyDelivered: true }, { status: 400 });
      }
      return json({ error: 'Session no longer active', valid: false }, { status: 400 });
    }

    if (expiresAt < new Date()) {
      return json({ error: 'Link expired', valid: false, expired: true }, { status: 401 });
    }

    if (session.orderId !== payload.orderId) {
      return json({ error: 'Token mismatch', valid: false }, { status: 403 });
    }

    const orderRef = db.collection('orders').doc(payload.orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return json({ error: 'Order not found', valid: false }, { status: 404 });
    }

    const order = orderDoc.data()!;
    const listingSnap = await db.collection('listings').doc(order.listingId).get();
    const listing = listingSnap.data() as { title?: string } | undefined;
    const sellerSnap = order.sellerId
      ? await db.collection('users').doc(order.sellerId).get()
      : null;
    const sellerProfile = (sellerSnap?.data() as { profile?: { ranchName?: string; brand?: string } })?.profile;

    const agreedWindow = order.delivery?.agreedWindow;
    const windowStart = agreedWindow?.start?.toDate?.() ?? agreedWindow?.start;
    const windowEnd = agreedWindow?.end?.toDate?.() ?? agreedWindow?.end;

    const finalPaymentAmount = typeof order.finalPaymentAmount === 'number' ? order.finalPaymentAmount : 0;
    const finalPaymentConfirmed = !!order.finalPaymentConfirmedAt;
    const finalPaymentPending = finalPaymentAmount > 0 && !finalPaymentConfirmed;

    return json({
      valid: true,
      role: payload.role,
      sessionId: payload.sessionId,
      orderId: payload.orderId,
      orderShortId: payload.orderId.slice(-8),
      listingTitle: listing?.title || 'Order',
      ranchLabel: sellerProfile?.ranchName || sellerProfile?.brand || '',
      deliveryWindowStart: windowStart ? new Date(windowStart).toISOString() : null,
      deliveryWindowEnd: windowEnd ? new Date(windowEnd).toISOString() : null,
      finalPaymentConfirmed: !finalPaymentPending,
      finalPaymentPending,
    });
  } catch (error: any) {
    if (error?.message?.includes('DELIVERY_TOKEN_SECRET')) {
      return json({ error: 'Server misconfigured', valid: false }, { status: 503 });
    }
    console.error('[verify-token]', error);
    return json({ error: 'Verification failed', valid: false }, { status: 500 });
  }
}
