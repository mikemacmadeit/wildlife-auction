/**
 * POST /api/admin/users/[userId]/password-reset-link
 *
 * Returns a Firebase Auth password reset link (admin-only) so support can help users recover access.
 */
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit/logger';
import { requireAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';

const bodySchema = z.object({
  reason: z.string().min(1).max(500),
});

export async function POST(request: Request, ctx: { params: { userId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { actorUid, auth, db } = admin.ctx;
  const meta = getRequestMeta(request);

  const targetUid = String(ctx?.params?.userId || '').trim();
  if (!targetUid) return json({ ok: false, error: 'Missing userId' }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await auth.getUser(targetUid);
    const email = user.email;
    if (!email) return json({ ok: false, error: 'Target user has no email address' }, { status: 400 });

    const { getSiteUrl } = await import('@/lib/site-url');
    const siteUrl = getSiteUrl();
    const continueUrl = siteUrl && !siteUrl.includes('localhost') ? `${siteUrl}/login` : undefined;
    const link = await auth.generatePasswordResetLink(email, continueUrl ? { url: continueUrl } : undefined);

    await createAuditLog(db as any, {
      actorUid,
      actorRole: 'admin',
      actionType: 'admin_user_password_reset_link_created',
      source: 'admin_ui',
      targetUserId: targetUid,
      metadata: { reason: parsed.data.reason, ip: meta.ip, userAgent: meta.userAgent },
    });

    return json({ ok: true, userId: targetUid, email, link });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to generate reset link', message: e?.message }, { status: 500 });
  }
}

