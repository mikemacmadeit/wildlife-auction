/**
 * POST /api/listings/[id]/view
 *
 * Lightweight view counter for seller analytics.
 * - No auth required (public listing pages)
 * - Rate limited
 * - Increments listings/{id}.metrics.views
 *
 * NOTE: The client de-dupes (1 per browser per 6 hours) to avoid inflating counts.
 */

import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminDb } from '@/lib/firebase/admin';

const paramsSchema = z.object({
  id: z.string().min(1),
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

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
  const rateLimitResult = await rateLimitCheck(request as any);
  if (!rateLimitResult.allowed) {
    return json(rateLimitResult.body, {
      status: rateLimitResult.status,
      headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
    });
  }

  const rawParams = await ctx.params;
  const parsed = paramsSchema.safeParse(rawParams);
  if (!parsed.success) return json({ error: 'Invalid id' }, { status: 400 });

  const { id } = parsed.data;
  const db = getAdminDb();
  const listingRef = db.collection('listings').doc(id);

  try {
    const snap = await listingRef.get();
    if (!snap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

    await listingRef.update({ 'metrics.views': FieldValue.increment(1) });
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to record view', message: e?.message || String(e) }, { status: 500 });
  }
}

