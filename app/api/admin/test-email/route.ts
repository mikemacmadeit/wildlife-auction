/**
 * POST /api/admin/test-email
 *
 * Admin-only endpoint to send a test transactional email through the configured provider.
 * Designed for verifying transactional email end-to-end (SendGrid recommended).
 */
import { z } from 'zod';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { getSamplePayload, listEmailEvents, renderEmail } from '@/lib/email';
import { sendEmailHtml } from '@/lib/email/sender';
import { getEmailProvider } from '@/lib/email/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  to: z.string().email().optional(),
  template: z.string().max(128).optional(),
});

export async function POST(request: Request) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });

  const provider = getEmailProvider();
  const to = parsed.data.to || process.env.SENDGRID_TEST_TO || 'michael@redwolfcinema.com';
  const known = new Set(listEmailEvents().map((e) => e.type));
  const requested = parsed.data.template ? String(parsed.data.template).trim() : '';
  const template = requested && known.has(requested as any) ? requested : 'auction_winner';
  if (!known.has(template as any)) {
    return json(
      { ok: false, error: 'Unknown template', template: requested, knownTemplates: Array.from(known).slice(0, 100) },
      { status: 400 }
    );
  }

  const rendered = renderEmail(template as any, getSamplePayload(template as any));

  const sent = await sendEmailHtml(to, rendered.subject, rendered.html);
  if (!sent.success) {
    return json(
      { ok: false, error: 'Failed to send test email', provider, message: sent.error || 'Send failed' },
      { status: 500 }
    );
  }

  return json({ ok: true, provider, to, template, messageId: sent.messageId || null });
}

