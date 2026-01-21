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
    let adminAuth: ReturnType<typeof getAdminAuth>;
    try {
      adminAuth = getAdminAuth();
    } catch (e: any) {
      return {
        ok: false as const,
        response: json(
          {
            error: 'Server is not configured for offers yet',
            code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
            message: e?.message || 'Failed to initialize Firebase Admin SDK',
            missing: e?.missing || undefined,
          },
          { status: 503 }
        ),
      };
    }

    const decoded = await adminAuth.verifyIdToken(token);
    // Require verified email across all offer operations (prevents spam/abuse and aligns with checkout gating).
    // IMPORTANT: don't rely solely on ID token claims; they can be stale until the client refreshes.
    const userRecord = await adminAuth.getUser(decoded.uid).catch(() => null as any);
    if (userRecord?.emailVerified !== true) {
      return {
        ok: false as const,
        response: json(
          {
            error: 'Email verification required',
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Please verify your email address to use offers.',
          },
          { status: 403 }
        ),
      };
    }
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

