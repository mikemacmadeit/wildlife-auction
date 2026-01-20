/**
 * POST /api/admin/users/[userId]/set-messaging-muted
 *
 * Admin-only: "Mute user" for messaging (blocks sending messages).
 * Tradeoff vs shadow-ban: mute is transparent + simpler; shadow-ban requires complex delivery suppression and can confuse support.
 *
 * Kill switch (diligence note):
 * - Who can set: admin/super_admin via `requireAdmin()`.
 * - What it blocks: message sending for the muted user (enforced in messaging write paths).
 * - Why it exists: marketplace abuse prevention (harassment/spam/circumvention).
 */
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';
import { createAuditLog } from '@/lib/audit/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  muted: z.boolean(),
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
          messagingMuted: parsed.data.muted,
          messagingMutedAt: now,
          messagingMutedBy: actorUid,
          messagingMutedReason: parsed.data.reason,
        },
        updatedAt: now,
        updatedBy: actorUid,
      },
      { merge: true }
    );

    await db.collection('userSummaries').doc(targetUid).set(
      { messagingFlags: { muted: parsed.data.muted }, updatedAt: now },
      { merge: true }
    );

    await createAuditLog(db as any, {
      actorUid,
      actorRole: 'admin',
      actionType: parsed.data.muted ? 'admin_user_messaging_muted' : 'admin_user_messaging_unmuted',
      source: 'admin_ui',
      targetUserId: targetUid,
      beforeState: before ? { messagingMuted: !!before?.adminFlags?.messagingMuted } : undefined,
      afterState: { messagingMuted: parsed.data.muted },
      metadata: { reason: parsed.data.reason, ip: meta.ip, userAgent: meta.userAgent },
    });

    return json({ ok: true, userId: targetUid, muted: parsed.data.muted });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to update messaging mute', message: e?.message || String(e) }, { status: 500 });
  }
}

