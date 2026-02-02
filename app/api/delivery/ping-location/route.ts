/**
 * POST /api/delivery/ping-location
 *
 * Public (driverToken only). Accepts lat, lng. Updates deliverySessions tracking.
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
    const lat = typeof body?.lat === 'number' ? body.lat : null;
    const lng = typeof body?.lng === 'number' ? body.lng : null;

    if (!token || lat == null || lng == null) {
      return json({ error: 'token, lat, and lng required' }, { status: 400 });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json({ error: 'Invalid coordinates' }, { status: 400 });
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
    if (session.status !== 'active') {
      return json({ error: 'Session no longer active' }, { status: 400 });
    }

    const tracking = (session.tracking as { enabled?: boolean; pingsCount?: number }) || {};
    if (!tracking.enabled) {
      return json({ error: 'Tracking not started' }, { status: 400 });
    }

    const now = Timestamp.now();
    const pingsCount = (tracking.pingsCount || 0) + 1;

    await sessionRef.update({
      'tracking.lastLocation': { lat, lng, ts: now },
      'tracking.pingsCount': pingsCount,
    });

    const rtdb = getAdminDatabase();
    if (rtdb) {
      const locationRef = rtdb.ref(`liveLocations/${payload.orderId}`);
      await locationRef.set({
        lat,
        lng,
        updatedAt: Date.now(),
      });
    }

    return json({ success: true, pingsCount });
  } catch (error: any) {
    if (error?.message?.includes('DELIVERY_TOKEN_SECRET')) {
      return json({ error: 'Server misconfigured' }, { status: 503 });
    }
    console.error('[ping-location]', error);
    return json({ error: 'Failed to update location' }, { status: 500 });
  }
}
