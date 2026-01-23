/**
 * POST /api/admin/support/tickets/[ticketId]/reply
 *
 * Admin-only: post a reply to the user and send it via email.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';
import { createAuditLog } from '@/lib/audit/logger';
import { sendEmailHtml } from '@/lib/email/sender';
import { getSupportTicketReplyEmail } from '@/lib/email/templates';

const BodySchema = z.object({
  message: z.string().trim().min(1).max(5000),
});

export async function POST(request: Request, ctx: { params: { ticketId: string } }) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const ticketId = String(ctx?.params?.ticketId || '').trim();
  if (!ticketId) return json({ ok: false, error: 'Missing ticketId' }, { status: 400 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, error: 'Validation error', details: parsed.error.flatten() }, { status: 400 });

  const { actorUid, db } = admin.ctx;
  const meta = getRequestMeta(request);
  const ref = db.collection('supportTickets').doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) return json({ ok: false, error: 'Not found' }, { status: 404 });

  const before = snap.data() as any;
  const toEmail = String(before?.email || '').trim();
  if (!toEmail) return json({ ok: false, error: 'Ticket has no email' }, { status: 400 });

  const now = Timestamp.now();

  await ref.collection('messages').doc(`m_${Date.now()}`).set(
    { kind: 'admin', by: actorUid, body: parsed.data.message, createdAt: now },
    { merge: true }
  );

  await ref.set(
    {
      status: 'open',
      updatedAt: now,
      lastPublicReplyAt: now,
      lastPublicReplyBy: 'admin',
      adminLastRepliedAt: now,
      adminLastRepliedBy: actorUid,
    },
    { merge: true }
  );

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://wildlife.exchange';
  const { subject, html } = getSupportTicketReplyEmail({
    ticketId,
    userName: String(before?.name || 'there'),
    userMessage: parsed.data.message,
    ticketUrl: `${origin}/dashboard/support?ticketId=${encodeURIComponent(ticketId)}`,
    subjectLine: String(before?.subject || 'Support'),
  });

  const sent = await sendEmailHtml(toEmail, subject, html);

  await createAuditLog(db as any, {
    actorUid,
    actorRole: 'admin',
    actionType: 'admin_support_reply',
    source: 'admin_ui',
    targetUserId: before?.userId || null,
    beforeState: { ticketId, status: before?.status || null },
    afterState: { ticketId, status: 'open', emailed: sent.success },
    metadata: { ip: meta.ip, userAgent: meta.userAgent, to: toEmail, subject },
  });

  return json({ ok: true, emailed: sent.success, messageId: sent.messageId || null }, { status: 200 });
}

