/**
 * POST /api/watchlist/toggle
 *
 * Server-side watchlist toggle used for accurate seller analytics.
 * - Creates/deletes /users/{uid}/watchlist/{listingId}
 * - Updates listings/{listingId}.watcherCount (authoritative, idempotent, never negative)
 * - Keeps listings/{listingId}.metrics.favorites in sync for legacy UI surfaces
 * - Maintains a scalable reverse index: /listings/{listingId}/watchers/{uid}
 *
 * NOTE: This endpoint uses Admin SDK and is the source of truth for watcher metrics.
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
    const listingWatcherRef = listingRef.collection('watchers').doc(uid);

    const result = await db.runTransaction(async (tx) => {
      const [listingSnap, watchSnap, listingWatcherSnap] = await Promise.all([
        tx.get(listingRef),
        tx.get(watchRef),
        tx.get(listingWatcherRef),
      ]);
      if (!listingSnap.exists) {
        return { ok: false as const, status: 404 as const, body: { error: 'Listing not found' } };
      }

      const listingData: any = listingSnap.data() || {};
      const currentCount =
        typeof listingData?.watcherCount === 'number'
          ? Number(listingData.watcherCount || 0) || 0
          : Number(listingData?.metrics?.favorites || 0) || 0;

      const isWatching = watchSnap.exists || listingWatcherSnap.exists;

      if (action === 'add') {
        if (isWatching) {
          // Heal partial state (best-effort) without changing counts.
          if (!watchSnap.exists) tx.set(watchRef, { listingId, createdAt: Timestamp.now() }, { merge: false });
          if (!listingWatcherSnap.exists) tx.set(listingWatcherRef, { userId: uid, createdAt: Timestamp.now() }, { merge: false });
          return { ok: true as const, state: 'unchanged' as const, watcherCount: currentCount };
        }

        tx.set(watchRef, { listingId, createdAt: Timestamp.now() }, { merge: false });
        tx.set(listingWatcherRef, { userId: uid, createdAt: Timestamp.now() }, { merge: false });

        // Use increment for concurrency safety.
        tx.update(listingRef, {
          watcherCount: FieldValue.increment(1),
          'metrics.favorites': FieldValue.increment(1),
        });
        return { ok: true as const, state: 'added' as const, watcherCount: currentCount + 1 };
      }

      // action === 'remove'
      if (!isWatching) {
        return { ok: true as const, state: 'unchanged' as const, watcherCount: currentCount };
      }
      if (watchSnap.exists) tx.delete(watchRef);
      if (listingWatcherSnap.exists) tx.delete(listingWatcherRef);

      // Prevent negative counts by computing new value inside the transaction.
      const next = Math.max(currentCount - 1, 0);
      tx.update(listingRef, { watcherCount: next, 'metrics.favorites': next });
      return { ok: true as const, state: 'removed' as const, watcherCount: next };
    });

    if ('status' in result) {
      return json(result.body, { status: result.status });
    }
    return json({ ok: true, state: result.state, watcherCount: (result as any).watcherCount });
  } catch (e: any) {
    return json({ error: 'Failed to update watchlist', message: e?.message || String(e) }, { status: 500 });
  }
}

