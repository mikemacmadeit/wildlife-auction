/**
 * POST /api/admin/users/[userId]/set-status
 *
 * Admin-only: set user account status.
 * - suspended: disables Auth + sets suspendedUntil
 * - banned: disables Auth + sets bannedAt
 * - active: enables Auth + clears suspended/banned fields
 * - disabled: disables Auth (support disable) + clears suspended/banned fields
 *
 * Server-authoritative + audit logged.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';
import { createAuditLog } from '@/lib/audit/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  status: z.enum(['active', 'disabled', 'suspended', 'banned']),
  suspendedUntilMs: z.number().int().positive().optional(),
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
  if (!parsed.success) return json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });

  const now = Timestamp.now();

  try {
    const userRef = db.collection('users').doc(targetUid);
    const beforeDoc = await userRef.get();
    const before = beforeDoc.exists ? (beforeDoc.data() as any) : null;
    const beforeAuth = await auth.getUser(targetUid).catch(() => null);

    const nextStatus = parsed.data.status;
    const updates: any = {
      updatedAt: now,
      updatedBy: actorUid,
    };

    if (nextStatus === 'suspended') {
      const untilMs = parsed.data.suspendedUntilMs || Date.now() + 7 * 24 * 60 * 60 * 1000;
      updates.suspendedUntil = Timestamp.fromMillis(untilMs);
      updates.suspendedAt = now;
      updates.suspendedBy = actorUid;
      updates.suspendedReason = parsed.data.reason;
      // Do not set banned fields.
      updates.bannedAt = null;
      updates.bannedBy = null;
      updates.bannedReason = null;
      await auth.updateUser(targetUid, { disabled: true });
      await createAuditLog(db as any, {
        actorUid,
        actorRole: 'admin',
        actionType: 'admin_user_suspended',
        source: 'admin_ui',
        targetUserId: targetUid,
        beforeState: { status: before?.status || null, authDisabled: !!beforeAuth?.disabled },
        afterState: { status: 'suspended', authDisabled: true, suspendedUntilMs: untilMs },
        metadata: { reason: parsed.data.reason, ip: meta.ip, userAgent: meta.userAgent },
      });
    } else if (nextStatus === 'banned') {
      updates.bannedAt = now;
      updates.bannedBy = actorUid;
      updates.bannedReason = parsed.data.reason;
      updates.suspendedUntil = null;
      updates.suspendedAt = null;
      updates.suspendedBy = null;
      updates.suspendedReason = null;
      await auth.updateUser(targetUid, { disabled: true });
      await createAuditLog(db as any, {
        actorUid,
        actorRole: 'admin',
        actionType: 'admin_user_banned',
        source: 'admin_ui',
        targetUserId: targetUid,
        beforeState: { status: before?.status || null, authDisabled: !!beforeAuth?.disabled },
        afterState: { status: 'banned', authDisabled: true },
        metadata: { reason: parsed.data.reason, ip: meta.ip, userAgent: meta.userAgent },
      });
    } else if (nextStatus === 'disabled') {
      updates.suspendedUntil = null;
      updates.suspendedAt = null;
      updates.suspendedBy = null;
      updates.suspendedReason = null;
      updates.bannedAt = null;
      updates.bannedBy = null;
      updates.bannedReason = null;
      await auth.updateUser(targetUid, { disabled: true });
      await createAuditLog(db as any, {
        actorUid,
        actorRole: 'admin',
        actionType: 'admin_user_disabled',
        source: 'admin_ui',
        targetUserId: targetUid,
        beforeState: { authDisabled: !!beforeAuth?.disabled },
        afterState: { authDisabled: true },
        metadata: { reason: parsed.data.reason, ip: meta.ip, userAgent: meta.userAgent },
      });
    } else {
      // active
      updates.suspendedUntil = null;
      updates.suspendedAt = null;
      updates.suspendedBy = null;
      updates.suspendedReason = null;
      updates.bannedAt = null;
      updates.bannedBy = null;
      updates.bannedReason = null;
      await auth.updateUser(targetUid, { disabled: false });
      await createAuditLog(db as any, {
        actorUid,
        actorRole: 'admin',
        actionType: before?.bannedAt ? 'admin_user_unbanned' : before?.suspendedUntil ? 'admin_user_unsuspended' : 'admin_user_enabled',
        source: 'admin_ui',
        targetUserId: targetUid,
        beforeState: { authDisabled: !!beforeAuth?.disabled },
        afterState: { authDisabled: false },
        metadata: { reason: parsed.data.reason, ip: meta.ip, userAgent: meta.userAgent },
      });
    }

    await userRef.set(updates, { merge: true });

    // Mirror summary status (best-effort)
    await db.collection('userSummaries').doc(targetUid).set(
      {
        status: nextStatus,
        authDisabled: nextStatus === 'active' ? false : true,
        updatedAt: now,
      },
      { merge: true }
    );

    return json({ ok: true, userId: targetUid, status: nextStatus });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to update status', message: e?.message || String(e) }, { status: 500 });
  }
}

