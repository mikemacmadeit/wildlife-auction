/**
 * GET /api/seller/dashboard
 *
 * Phase 3A (A1): Seller dashboard data, server-aggregated (no mocks).
 *
 * Auth: seller (any authenticated user fetching *their own* dashboard).
 * - We do not allow requesting other seller IDs.
 * - No DB writes; read-only aggregation.
 */
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getSellerDashboardData } from '@/lib/seller/getSellerDashboardData';

function json(body: any, init?: { status?: number; headers?: Record<string, string> | Headers }) {
  const headers =
    init?.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : (init?.headers as Record<string, string> | undefined);
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(headers || {}) },
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Rate limit (cheap, before auth)
  const rl = rateLimitMiddleware(RATE_LIMITS.default);
  const rlRes = await rl(request as any);
  if (!rlRes.allowed) {
    return json(rlRes.body, {
      status: rlRes.status,
      headers: { 'Retry-After': rlRes.body.retryAfter.toString() },
    });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice('Bearer '.length);

  let uid: string | null = null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded?.uid || null;
    // Require verified email: the seller dashboard includes operational surfaces.
    if ((decoded as any)?.email_verified !== true) {
      return json(
        { error: 'Email verification required', code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email to view seller dashboard.' },
        { status: 403 }
      );
    }
  } catch {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!uid) return json({ error: 'Unauthorized' }, { status: 401 });

  const db = getAdminDb();
  const data = await getSellerDashboardData({ db: db as any, sellerId: uid });
  return json({ ok: true, data });
}

