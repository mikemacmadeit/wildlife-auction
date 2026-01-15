import { z } from 'zod';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export function json(body: any, init?: { status?: number; headers?: Record<string, string> | Headers }) {
  const headers =
    init?.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : (init?.headers as Record<string, string> | undefined);
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(headers || {}),
    },
  });
}

export async function requireAuth(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false as const, response: json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { ok: true as const, decoded };
  } catch {
    return { ok: false as const, response: json({ error: 'Unauthorized - Invalid token' }, { status: 401 }) };
  }
}

export async function requireRateLimit(request: Request, config = RATE_LIMITS.default) {
  const check = rateLimitMiddleware(config);
  const result = await check(request as any);
  if ('allowed' in result && result.allowed) return { ok: true as const };
  return {
    ok: false as const,
    response: json(result.body, { status: result.status, headers: { 'Retry-After': result.body.retryAfter.toString() } }),
  };
}

export async function isAdminUid(uid: string): Promise<boolean> {
  const db = getAdminDb();
  const doc = await db.collection('users').doc(uid).get();
  const role = doc.exists ? doc.data()?.role : null;
  const superAdmin = doc.exists ? doc.data()?.superAdmin : null;
  return role === 'admin' || role === 'super_admin' || superAdmin === true;
}

export const offerAmountSchema = z
  .number()
  .finite()
  .positive()
  .max(1_000_000_000); // guardrail

