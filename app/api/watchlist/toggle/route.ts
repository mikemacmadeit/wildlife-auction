/**
 * POST /api/watchlist/toggle
 *
 * Server-side watchlist toggle used for accurate seller analytics.
 * - Creates/deletes /users/{uid}/watchlist/{listingId}
 * - Updates listings/{listingId}.metrics.favorites (idempotent, never negative)
 *
 * NOTE: Clients can still write watchlist directly via Firestore rules, but the app uses this
 * endpoint to ensure metrics stay correct for seller dashboards.
 */

import { z } from 'zod';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';

const bodySchema = z.object({
  listingId: z.string().min(1),
  action: z.enum(['add', 'remove']),
});

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(request: Request) {
  try {
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
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

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { listingId, action } = parsed.data;
    const uid = decoded.uid;
    const db = getAdminDb();

    const listingRef = db.collection('listings').doc(listingId);
    const watchRef = db.collection('users').doc(uid).collection('watchlist').doc(listingId);

    const result = await db.runTransaction(async (tx) => {
      const [listingSnap, watchSnap] = await Promise.all([tx.get(listingRef), tx.get(watchRef)]);
      if (!listingSnap.exists) {
        return { ok: false as const, status: 404 as const, body: { error: 'Listing not found' } };
      }

      const listingData: any = listingSnap.data() || {};
      const currentFavs = Number(listingData?.metrics?.favorites || 0) || 0;

      if (action === 'add') {
        if (watchSnap.exists) {
          return { ok: true as const, state: 'unchanged' as const, favorites: currentFavs };
        }
        tx.set(watchRef, { listingId, createdAt: Timestamp.now() }, { merge: false });
        // Use FieldValue.increment for concurrency safety; also return best-effort count.
        tx.update(listingRef, { 'metrics.favorites': FieldValue.increment(1) });
        return { ok: true as const, state: 'added' as const, favorites: currentFavs + 1 };
      }

      // action === 'remove'
      if (!watchSnap.exists) {
        return { ok: true as const, state: 'unchanged' as const, favorites: currentFavs };
      }
      tx.delete(watchRef);

      // Prevent negative counts by computing new value inside the transaction.
      const nextFavs = Math.max(currentFavs - 1, 0);
      tx.update(listingRef, { 'metrics.favorites': nextFavs });
      return { ok: true as const, state: 'removed' as const, favorites: nextFavs };
    });

    if ('status' in result) {
      return json(result.body, { status: result.status });
    }
    return json({ ok: true, state: result.state, favorites: result.favorites });
  } catch (e: any) {
    return json({ error: 'Failed to update watchlist', message: e?.message || String(e) }, { status: 500 });
  }
}

