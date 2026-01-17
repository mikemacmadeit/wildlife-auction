/**
 * POST /api/auctions/[auctionId]/auto-bid/disable
 *
 * Disables auto-bid for the authenticated user for a specific auction.
 * We do NOT recompute/roll back the current price; we simply stop future proxy bidding for this user.
 */

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
}

const bodySchema = z.object({}).passthrough();

export async function POST(request: Request, ctx: { params: Promise<{ auctionId: string }> }) {
  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message || String(e) }, { status: 503 });
  }

  const rl = rateLimitMiddleware(RATE_LIMITS.default);
  const rlRes = await rl(request as any);
  if (!rlRes.allowed) {
    return json(rlRes.body, { status: rlRes.status, headers: { 'Retry-After': rlRes.body.retryAfter.toString() } });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.slice('Bearer '.length);
  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = String(decoded?.uid || '');
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const auctionId = String((await ctx.params)?.auctionId || '');
  if (!auctionId) return json({ ok: false, error: 'auctionId is required' }, { status: 400 });

  // Accept any body; route is primarily stateful.
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return json({ ok: false, error: 'Invalid request' }, { status: 400 });
  } catch {
    // ignore
  }

  try {
    const listingRef = db.collection('listings').doc(auctionId);
    const autoBidRef = listingRef.collection('autoBids').doc(userId);
    await autoBidRef.set(
      {
        userId,
        enabled: false,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Failed to disable auto-bid' }, { status: 400 });
  }
}

