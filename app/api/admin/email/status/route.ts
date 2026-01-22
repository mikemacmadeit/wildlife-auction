/**
 * GET /api/admin/email/status
 *
 * Admin-only diagnostics for email delivery configuration.
 * Does NOT expose secrets.
 */
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { getEmailProvider } from '@/lib/email/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function truthy(v: any): boolean {
  return String(v || '').toLowerCase() === 'true';
}

function redactMailbox(s: string | null): string | null {
  if (!s) return null;
  const raw = String(s).trim();
  const m = raw.match(/<([^>]+)>/);
  const email = (m?.[1] || raw).trim();
  const parts = email.split('@');
  if (parts.length !== 2) return raw;
  const [user, domain] = parts;
  const safeUser = user.length <= 2 ? user[0] + '*' : user.slice(0, 2) + '*'.repeat(Math.min(12, Math.max(1, user.length - 2)));
  return `${safeUser}@${domain}`;
}

export async function GET(request: Request) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const provider = getEmailProvider();

  const sendgrid = {
    hasApiKey: !!process.env.SENDGRID_API_KEY,
    fromEmail: redactMailbox(process.env.EMAIL_FROM || process.env.FROM_EMAIL || null),
    fromName: process.env.EMAIL_FROM_NAME || process.env.FROM_NAME || null,
    replyTo: redactMailbox(process.env.EMAIL_REPLY_TO || null),
  };

  return json({
    ok: true,
    provider,
    emailDisabled: truthy(process.env.EMAIL_DISABLED),
    sendgrid,
    hints: [
      'SendGrid is used for transactional email only. Verify your sender identity in SendGrid and set EMAIL_FROM/EMAIL_FROM_NAME.',
      'If provider is "none", set EMAIL_PROVIDER=sendgrid and provide SENDGRID_API_KEY (server-side env vars).',
    ],
  });
}

