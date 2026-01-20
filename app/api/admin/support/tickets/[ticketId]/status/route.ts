/**
 * POST /api/admin/support/tickets/[ticketId]/status
 *
 * Admin-only: set ticket status (open/resolved).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';

const BodySchema = z.object({
  status: z.enum(['open', 'resolved']),
  adminNote: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request, ctx: { params: { ticketId: string } }) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const ticketId = String(ctx?.params?.ticketId || '').trim();
  if (!ticketId) return json({ ok: false, error: 'Missing ticketId' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: 'Validation error' }, { status: 400 });
  }

  const db = admin.ctx.db;
  const ref = db.collection('supportTickets').doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) return json({ ok: false, error: 'Not found' }, { status: 404 });

  await ref.set(
    {
      status: parsed.data.status,
      updatedAt: Timestamp.now(),
      ...(parsed.data.status === 'resolved'
        ? { resolvedAt: Timestamp.now(), resolvedBy: admin.ctx.actorUid }
        : { resolvedAt: null, resolvedBy: null }),
      ...(parsed.data.adminNote ? { adminNote: parsed.data.adminNote } : {}),
    },
    { merge: true }
  );

  return json({ ok: true }, { status: 200 });
}

