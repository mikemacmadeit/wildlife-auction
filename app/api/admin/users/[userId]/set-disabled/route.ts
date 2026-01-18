/**
 * POST /api/admin/users/[userId]/set-disabled
 *
 * Enables/disables a Firebase Auth user.
 */
import { getAdminAuth } from '@/lib/firebase/admin';
import { isAdminUid } from '@/app/api/admin/notifications/_admin';
import { z } from 'zod';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

const bodySchema = z.object({
  disabled: z.boolean(),
  reason: z.string().min(1).max(500),
});

export async function POST(request: Request, ctx: { params: { userId: string } }) {
  const targetUid = String(ctx?.params?.userId || '').trim();
  if (!targetUid) return json({ ok: false, error: 'Missing userId' }, { status: 400 });

  let auth: ReturnType<typeof getAdminAuth>;
  try {
    auth = getAdminAuth();
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
  const { disabled } = parsed.data;

  try {
    await auth.updateUser(targetUid, { disabled });
    return json({ ok: true, userId: targetUid, disabled });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to update user', message: e?.message }, { status: 500 });
  }
}

