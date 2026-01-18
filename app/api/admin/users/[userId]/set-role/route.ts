/**
 * POST /api/admin/users/[userId]/set-role
 *
 * Sets admin role for a user (Firestore `users/{uid}.role` + Firebase Auth custom claims).
 */
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { isAdminUid } from '@/app/api/admin/notifications/_admin';
import { z } from 'zod';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

const bodySchema = z.object({
  role: z.enum(['user', 'admin', 'super_admin']),
  reason: z.string().min(1).max(500),
});

export async function POST(request: Request, ctx: { params: { userId: string } }) {
  const targetUid = String(ctx?.params?.userId || '').trim();
  if (!targetUid) return json({ ok: false, error: 'Missing userId' }, { status: 400 });

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
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
  const actorUid = decoded?.uid as string | undefined;
  if (!actorUid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const claimRole = (decoded as any)?.role;
  const claimSuper = (decoded as any)?.superAdmin === true;
  const claimIsAdmin = claimRole === 'admin' || claimRole === 'super_admin' || claimSuper;
  const docIsAdmin = claimIsAdmin ? true : await isAdminUid(actorUid);
  if (!docIsAdmin) return json({ ok: false, error: 'Admin access required' }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const { role, reason } = parsed.data;

  try {
    // Firestore role (source-of-truth fallback)
    await db.collection('users').doc(targetUid).set(
      {
        role,
        updatedAt: new Date(),
        updatedBy: actorUid,
        adminOverrideReason: reason,
        adminOverrideAt: new Date(),
      },
      { merge: true }
    );

    // Custom claims for fast client gating
    const claims: Record<string, any> = { role };
    if (role === 'super_admin') claims.superAdmin = true;
    await auth.setCustomUserClaims(targetUid, claims);

    return json({ ok: true, userId: targetUid, role });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to set role', message: e?.message }, { status: 500 });
  }
}

