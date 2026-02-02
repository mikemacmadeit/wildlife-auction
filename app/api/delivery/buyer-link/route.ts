/**
 * POST /api/delivery/buyer-link
 *
 * Public. Accepts a valid driver token, returns the buyer confirmation link
 * (so the driver page can display QR for the buyer).
 */

import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminDb } from '@/lib/firebase/admin';
import { verifyDeliveryToken, signDeliveryToken } from '@/lib/delivery/tokens';
import { getSiteUrl } from '@/lib/site-url';

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
      return json({ error: 'token required' }, { status: 400 });
    }

    const payload = verifyDeliveryToken(token);
    if (!payload || payload.role !== 'driver') {
      return json({ error: 'Invalid or expired driver token' }, { status: 401 });
    }

    const db = getAdminDb();
    const sessionDoc = await db.collection('deliverySessions').doc(payload.sessionId).get();
    if (!sessionDoc.exists) {
      return json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionDoc.data()!;
    if (session.status !== 'active') {
      return json({ error: 'Session no longer active' }, { status: 400 });
    }

    const buyerToken = signDeliveryToken({
      sessionId: payload.sessionId,
      orderId: payload.orderId,
      role: 'buyer',
    });

    const baseUrl = getSiteUrl();
    const buyerConfirmLink = `${baseUrl}/delivery/confirm?token=${encodeURIComponent(buyerToken)}`;

    return json({
      success: true,
      buyerConfirmLink,
      qrValue: buyerConfirmLink,
      deliveryPin: session.deliveryPin ?? '',
    });
  } catch (error: any) {
    if (error?.message?.includes('DELIVERY_TOKEN_SECRET')) {
      return json({ error: 'Server misconfigured' }, { status: 503 });
    }
    console.error('[buyer-link]', error);
    return json({ error: 'Failed to get buyer link' }, { status: 500 });
  }
}
