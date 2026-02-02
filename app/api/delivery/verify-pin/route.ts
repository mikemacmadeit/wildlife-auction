/**
 * POST /api/delivery/verify-pin
 *
 * Public (driver token only). Verifies the recipient's PIN without revealing it.
 * Returns { valid: true } on success. Driver uses this to unlock signature and photo steps.
 */

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
    const pin = typeof body?.pin === 'string' ? body.pin.replace(/\D/g, '').slice(0, 4) : '';

    if (!token) return json({ error: 'token required' }, { status: 400 });
    if (!pin || pin.length !== 4) return json({ error: 'Valid 4-digit PIN required' }, { status: 400 });

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

    const sessionPin = (session.deliveryPin ?? '').toString().replace(/\D/g, '').slice(0, 4);
    if (!sessionPin) {
      return json({ error: 'Delivery not ready for PIN verification' }, { status: 400 });
    }

    const valid = sessionPin === pin;
    return json({ valid });
  } catch (error: any) {
    if (error?.message?.includes('DELIVERY_TOKEN_SECRET')) {
      return json({ error: 'Server misconfigured' }, { status: 503 });
    }
    console.error('[verify-pin]', error);
    return json({ error: 'Verification failed' }, { status: 500 });
  }
}
