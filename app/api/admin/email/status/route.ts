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

  const ses = {
    region: process.env.SES_AWS_REGION || 'us-east-1',
    hasAccessKey: !!process.env.SES_AWS_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.SES_AWS_SECRET_ACCESS_KEY,
    from: redactMailbox(process.env.SES_FROM || null),
    replyTo: redactMailbox(process.env.SES_REPLY_TO || null),
    sandboxMode: truthy(process.env.SES_SANDBOX_MODE),
    sandboxTo: redactMailbox(process.env.SES_SANDBOX_TO || 'michael@redwolfcinema.com'),
  };

  return json({
    ok: true,
    provider,
    emailDisabled: truthy(process.env.EMAIL_DISABLED),
    ses,
    hints: [
      'If SES is in sandbox, both the sender identity (SES_FROM email/domain) AND the recipient (SES_SANDBOX_TO) must be verified in SES.',
      'If provider is "none", set EMAIL_PROVIDER=ses and provide SES_AWS_ACCESS_KEY_ID / SES_AWS_SECRET_ACCESS_KEY / SES_FROM in Netlify env vars.',
    ],
  });
}

