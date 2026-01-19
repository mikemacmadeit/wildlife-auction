/**
 * POST /api/admin/users/[userId]/send-verification-email
 *
 * Admin-only: send a verification email to a target user.
 * Uses Firebase Admin to generate a verification link, then sends via configured email provider (Brevo/Resend).
 */
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit/logger';
import { requireAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';
import { getSiteUrl } from '@/lib/site-url';
import { renderEmail } from '@/lib/email';
import { sendEmailHtml } from '@/lib/email/sender';
import { getEmailProvider, FROM_EMAIL } from '@/lib/email/config';

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

    if (user.emailVerified === true) {
      return json({ ok: true, alreadyVerified: true, userId: targetUid, email });
    }

    const siteUrl = getSiteUrl();
    const dashboardUrl = `${siteUrl}/dashboard/account?verified=1`;
    const actionCodeSettings = { url: dashboardUrl, handleCodeInApp: false };
    const verifyUrl = await auth.generateEmailVerificationLink(email, actionCodeSettings as any);

    const userName =
      (user.displayName && String(user.displayName).trim()) || (email.includes('@') ? email.split('@')[0] : 'there');

    const rendered = renderEmail('verify_email', {
      userName,
      verifyUrl,
      dashboardUrl,
    });

    const sent = await sendEmailHtml(email, rendered.subject, rendered.html);
    if (!sent.success) {
      return json(
        {
          ok: false,
          error: 'Failed to send email',
          message: sent.error || 'Send failed',
          provider: getEmailProvider(),
          from: FROM_EMAIL,
        },
        { status: 500 }
      );
    }

    await createAuditLog(db as any, {
      actorUid,
      actorRole: 'admin',
      actionType: 'admin_user_verification_email_sent',
      source: 'admin_ui',
      targetUserId: targetUid,
      metadata: { reason: parsed.data.reason, ip: meta.ip, userAgent: meta.userAgent, provider: getEmailProvider(), from: FROM_EMAIL },
    });

    return json({ ok: true, userId: targetUid, email, sent: true, provider: getEmailProvider(), from: FROM_EMAIL });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to send verification email', message: e?.message || String(e) }, { status: 500 });
  }
}

