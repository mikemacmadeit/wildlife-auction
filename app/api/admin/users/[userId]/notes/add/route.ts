/**
 * POST /api/admin/users/[userId]/notes/add
 *
 * Admin-only: add an internal note on a user.
 * Server-authoritative + audit logged.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';
import { createAuditLog } from '@/lib/audit/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  note: z.string().min(1).max(2000),
});

export async function POST(request: Request, ctx: { params: { userId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { actorUid, db } = admin.ctx;
  const meta = getRequestMeta(request);

  const targetUid = String(ctx?.params?.userId || '').trim();
  if (!targetUid) return json({ ok: false, error: 'Missing userId' }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });

  try {
    const now = Timestamp.now();
    const ref = db.collection('adminUserNotes').doc(targetUid).collection('notes').doc();
    await ref.set({
      id: ref.id,
      note: parsed.data.note,
      createdAt: now,
      createdBy: actorUid,
    });

    await createAuditLog(db as any, {
      actorUid,
      actorRole: 'admin',
      actionType: 'admin_user_note_added',
      source: 'admin_ui',
      targetUserId: targetUid,
      metadata: { noteId: ref.id, ip: meta.ip, userAgent: meta.userAgent },
    });

    return json({ ok: true, noteId: ref.id });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to add note', message: e?.message || String(e) }, { status: 500 });
  }
}

