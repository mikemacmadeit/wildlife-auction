/**
 * POST /api/admin/users/[userId]/force-logout
 *
 * Admin-only: revoke refresh tokens to force logout across devices.
 * Server-authoritative + audit logged.
 */
import { z } from 'zod';
import { requireAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';
import { createAuditLog } from '@/lib/audit/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
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

  try {
    await auth.revokeRefreshTokens(targetUid);

    await createAuditLog(db as any, {
      actorUid,
      actorRole: 'admin',
      actionType: 'admin_user_force_logout',
      source: 'admin_ui',
      targetUserId: targetUid,
      metadata: { reason: parsed.data.reason, ip: meta.ip, userAgent: meta.userAgent },
    });

    return json({ ok: true, userId: targetUid });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to force logout', message: e?.message || String(e) }, { status: 500 });
  }
}

