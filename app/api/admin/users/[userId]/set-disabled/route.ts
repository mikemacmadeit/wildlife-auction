/**
 * POST /api/admin/users/[userId]/set-disabled
 *
 * Enables/disables a Firebase Auth user.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { createAuditLog } from '@/lib/audit/logger';
import { requireAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';

const bodySchema = z.object({
  disabled: z.boolean(),
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
  const { disabled, reason } = parsed.data;

  try {
    const now = Timestamp.now();
    const beforeAuth = await auth.getUser(targetUid).catch(() => null);
    await auth.updateUser(targetUid, { disabled });

    await db.collection('userSummaries').doc(targetUid).set({ authDisabled: disabled, status: disabled ? 'disabled' : 'active', updatedAt: now }, { merge: true });

    await createAuditLog(db as any, {
      actorUid,
      actorRole: 'admin',
      actionType: disabled ? 'admin_user_disabled' : 'admin_user_enabled',
      source: 'admin_ui',
      targetUserId: targetUid,
      beforeState: { authDisabled: !!beforeAuth?.disabled },
      afterState: { authDisabled: disabled },
      metadata: { reason, ip: meta.ip, userAgent: meta.userAgent },
    });

    return json({ ok: true, userId: targetUid, disabled });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to update user', message: e?.message }, { status: 500 });
  }
}

