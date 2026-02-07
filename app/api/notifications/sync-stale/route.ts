/**
 * GET /api/notifications/sync-stale
 *
 * Marks action-required notifications as completed when the underlying order/offer/listing
 * is already past the action step (e.g. order already delivered, offer declined, listing sold).
 * Call when the user opens the notifications page so To do and "Needs action" stay accurate.
 */

import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { syncStaleActionNotifications } from '@/lib/notifications/syncStaleActions';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';

function json(body: Record<string, unknown>, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET(request: Request) {
  try {
    const rateLimitResult = await rateLimitMiddleware(RATE_LIMITS.default)(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, { status: rateLimitResult.status });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const auth = getAdminAuth();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch {
      return json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    const db = getAdminDb();
    const result = await syncStaleActionNotifications(db as any, decoded.uid);
    return json({ ok: true, updated: result.updated });
  } catch (e: any) {
    console.warn('[sync-stale]', e?.message || e);
    return json({ error: 'Failed to sync', message: e?.message || String(e) }, { status: 500 });
  }
}
