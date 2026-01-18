/**
 * POST /api/admin/users/[userId]/set-selling-disabled
 *
 * Admin-only: toggle seller listing/publishing privileges (server-authoritative flag).
 * Enforcement is applied in listing publish route (P0).
 */
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';
import { createAuditLog } from '@/lib/audit/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  disabled: z.boolean(),
  reason: z.string().min(1).max(500),
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
    const userRef = db.collection('users').doc(targetUid);
    const before = await userRef.get().then((s) => (s.exists ? (s.data() as any) : null)).catch(() => null);

    await userRef.set(
      {
        adminFlags: {
          ...(before?.adminFlags || {}),
          sellingDisabled: parsed.data.disabled,
          sellingDisabledAt: now,
          sellingDisabledBy: actorUid,
          sellingDisabledReason: parsed.data.reason,
        },
        updatedAt: now,
        updatedBy: actorUid,
      },
      { merge: true }
    );

    await db.collection('userSummaries').doc(targetUid).set(
      { sellerFlags: { sellingDisabled: parsed.data.disabled }, updatedAt: now },
      { merge: true }
    );

    await createAuditLog(db as any, {
      actorUid,
      actorRole: 'admin',
      actionType: parsed.data.disabled ? 'admin_user_selling_disabled' : 'admin_user_selling_enabled',
      source: 'admin_ui',
      targetUserId: targetUid,
      beforeState: before ? { sellingDisabled: !!before?.adminFlags?.sellingDisabled } : undefined,
      afterState: { sellingDisabled: parsed.data.disabled },
      metadata: { reason: parsed.data.reason, ip: meta.ip, userAgent: meta.userAgent },
    });

    return json({ ok: true, userId: targetUid, disabled: parsed.data.disabled });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to update selling privileges', message: e?.message || String(e) }, { status: 500 });
  }
}

