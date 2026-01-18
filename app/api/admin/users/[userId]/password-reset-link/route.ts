/**
 * POST /api/admin/users/[userId]/password-reset-link
 *
 * Returns a Firebase Auth password reset link (admin-only) so support can help users recover access.
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

  try {
    const user = await auth.getUser(targetUid);
    const email = user.email;
    if (!email) return json({ ok: false, error: 'Target user has no email address' }, { status: 400 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';
    const continueUrl = appUrl ? `${appUrl}/login` : undefined;
    const link = await auth.generatePasswordResetLink(email, continueUrl ? { url: continueUrl } : undefined);

    return json({ ok: true, userId: targetUid, email, link });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to generate reset link', message: e?.message }, { status: 500 });
  }
}

