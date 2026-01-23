/**
 * POST /api/admin/support/tickets/[ticketId]/update
 *
 * Admin-only: update ticket priority, assignment, or internal notes.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';

const BodySchema = z.object({
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  assignedTo: z.string().trim().nullable().optional(),
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
    return json({ ok: false, error: 'Validation error', details: parsed.error.flatten() }, { status: 400 });
  }

  const { db, actorUid } = admin.ctx;
  const ref = db.collection('supportTickets').doc(ticketId);
  const snap = await ref.get();

  if (!snap.exists) {
    return json({ ok: false, error: 'Ticket not found' }, { status: 404 });
  }

  const updateData: any = {
    updatedAt: Timestamp.now(),
  };

  if (parsed.data.priority !== undefined) {
    updateData.priority = parsed.data.priority;
  }

  if (parsed.data.assignedTo !== undefined) {
    updateData.assignedTo = parsed.data.assignedTo;
    updateData.assignedAt = parsed.data.assignedTo ? Timestamp.now() : null;
    updateData.assignedBy = parsed.data.assignedTo ? actorUid : null;
  }

  if (parsed.data.adminNote !== undefined) {
    updateData.adminNote = parsed.data.adminNote || null;
  }

  await ref.set(updateData, { merge: true });

  return json({ ok: true }, { status: 200 });
}
