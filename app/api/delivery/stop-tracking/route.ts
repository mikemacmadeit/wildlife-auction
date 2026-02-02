/**
 * POST /api/delivery/stop-tracking
 *
 * Public (driverToken only). Stops tracking for the delivery session.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminDb, getAdminDatabase } from '@/lib/firebase/admin';
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
      return json({ error: 'token required' }, { status: 400 });
    }

    const payload = verifyDeliveryToken(token);
    if (!payload || payload.role !== 'driver') {
      return json({ error: 'Invalid or expired driver token' }, { status: 401 });
    }

    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
    const sessionRef = db.collection('deliverySessions').doc(payload.sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionDoc.data()!;
    const tracking = (session.tracking as { enabled?: boolean }) || {};
    if (!tracking.enabled) {
      return json({ success: true, alreadyStopped: true });
    }

    const now = Timestamp.now();
    await sessionRef.update({
      'tracking.enabled': false,
      'tracking.stoppedAt': now,
    });

    const orderRef = db.collection('orders').doc(payload.orderId);
    const orderDoc = await orderRef.get();
    if (orderDoc.exists) {
      const orderData = orderDoc.data()!;
      await orderRef.update({
        'deliveryTracking.enabled': false,
        'deliveryTracking.endedAt': now,
        updatedAt: new Date(),
      });

      const rtdb = getAdminDatabase();
      if (rtdb) {
        await rtdb.ref(`trackingAccess/${payload.orderId}`).update({ enabled: false });
      }
    }

    return json({ success: true, tracking: { enabled: false } });
  } catch (error: any) {
    if (error?.message?.includes('DELIVERY_TOKEN_SECRET')) {
      return json({ error: 'Server misconfigured' }, { status: 503 });
    }
    console.error('[stop-tracking]', error);
    return json({ error: 'Failed to stop tracking' }, { status: 500 });
  }
}
