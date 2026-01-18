import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { isAdminUid } from './notifications/_admin';

export function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
}

export async function requireRateLimit(request: Request) {
  const check = rateLimitMiddleware(RATE_LIMITS.admin);
  const result = await check(request as any);
  if ('allowed' in result && result.allowed) return { ok: true as const };
  return {
    ok: false as const,
    response: json(result.body, { status: result.status, headers: { 'Retry-After': result.body.retryAfter.toString() } }),
  };
}

export type AdminContext = {
  actorUid: string;
  auth: ReturnType<typeof getAdminAuth>;
  db: ReturnType<typeof getAdminDb>;
  decoded: any;
  isSuperAdmin: boolean;
};

export async function requireAdmin(request: Request): Promise<{ ok: true; ctx: AdminContext } | { ok: false; response: Response }> {
  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return { ok: false, response: json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 }) };
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, response: json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  const token = authHeader.slice('Bearer '.length);

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return { ok: false, response: json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const actorUid = decoded?.uid as string | undefined;
  if (!actorUid) return { ok: false, response: json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };

  const claimRole = (decoded as any)?.role;
  const claimSuper = (decoded as any)?.superAdmin === true;
  const claimIsAdmin = claimRole === 'admin' || claimRole === 'super_admin' || claimSuper;
  const docIsAdmin = claimIsAdmin ? true : await isAdminUid(actorUid);
  if (!docIsAdmin) return { ok: false, response: json({ ok: false, error: 'Admin access required' }, { status: 403 }) };

  const isSuperAdmin = claimRole === 'super_admin' || claimSuper === true;
  return { ok: true, ctx: { actorUid, auth, db, decoded, isSuperAdmin } };
}

export async function requireSuperAdmin(request: Request): Promise<{ ok: true; ctx: AdminContext } | { ok: false; response: Response }> {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin;
  if (!admin.ctx.isSuperAdmin) {
    // Fallback to Firestore check to support environments where claims are stale.
    const doc = await admin.ctx.db.collection('users').doc(admin.ctx.actorUid).get();
    const role = doc.exists ? (doc.data() as any)?.role : null;
    const superAdmin = doc.exists ? (doc.data() as any)?.superAdmin : null;
    const ok = role === 'super_admin' || superAdmin === true;
    if (!ok) return { ok: false, response: json({ ok: false, error: 'Super admin access required' }, { status: 403 }) };
    return { ok: true, ctx: { ...admin.ctx, isSuperAdmin: true } };
  }
  return admin;
}

export function getRequestMeta(request: Request): { ip?: string; userAgent?: string } {
  const xfwd = request.headers.get('x-forwarded-for');
  const ip = xfwd ? xfwd.split(',')[0]?.trim() : request.headers.get('x-real-ip') || undefined;
  const userAgent = request.headers.get('user-agent') || undefined;
  return { ip: ip || undefined, userAgent: userAgent || undefined };
}

