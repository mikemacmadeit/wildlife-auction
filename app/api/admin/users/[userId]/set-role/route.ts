/**
 * POST /api/admin/users/[userId]/set-role
 *
 * Sets admin role for a user (Firestore `users/{uid}.role` + Firebase Auth custom claims).
 */
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { createAuditLog } from '@/lib/audit/logger';
import { requireSuperAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';

const bodySchema = z.object({
  role: z.enum(['user', 'admin', 'super_admin']),
  reason: z.string().min(1).max(500),
});

export async function POST(request: Request, ctx: { params: { userId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const targetUid = String(ctx?.params?.userId || '').trim();
  if (!targetUid) return json({ ok: false, error: 'Missing userId' }, { status: 400 });

  const admin = await requireSuperAdmin(request);
  if (!admin.ok) return admin.response;
  const { actorUid, auth, db } = admin.ctx;
  const meta = getRequestMeta(request);

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const { role, reason } = parsed.data;

  try {
    const now = Timestamp.now();
    const beforeSnap = await db.collection('users').doc(targetUid).get();
    const before = beforeSnap.exists ? (beforeSnap.data() as any) : null;

    // Firestore role (source-of-truth fallback)
    await db.collection('users').doc(targetUid).set(
      {
        role,
        updatedAt: now,
        updatedBy: actorUid,
        adminOverrideReason: reason,
        adminOverrideAt: now,
      },
      { merge: true }
    );

    // Custom claims for fast client gating
    const claims: Record<string, any> = { role };
    if (role === 'super_admin') claims.superAdmin = true;
    await auth.setCustomUserClaims(targetUid, claims);

    // Mirror into userSummaries for admin directory (best-effort)
    await db.collection('userSummaries').doc(targetUid).set({ role, updatedAt: now }, { merge: true });

    await createAuditLog(db as any, {
      actorUid,
      actorRole: 'admin',
      actionType: 'admin_user_role_changed',
      source: 'admin_ui',
      targetUserId: targetUid,
      beforeState: before ? { role: before.role || null } : undefined,
      afterState: { role },
      metadata: { reason, ip: meta.ip, userAgent: meta.userAgent },
    });

    return json({ ok: true, userId: targetUid, role });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to set role', message: e?.message }, { status: 500 });
  }
}

