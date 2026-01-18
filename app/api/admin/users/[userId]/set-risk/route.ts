/**
 * POST /api/admin/users/[userId]/set-risk
 *
 * Admin-only: set/reset risk label + reason codes.
 * Server-authoritative + audit logged. Also mirrors into userSummaries/{uid}.
 */
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json, getRequestMeta } from '@/app/api/admin/_util';
import { createAuditLog } from '@/lib/audit/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  riskLabel: z.enum(['low', 'med', 'high', 'unknown']),
  reasons: z.array(z.string().min(1).max(120)).max(25).optional(),
  reason: z.string().min(1).max(500), // required admin note
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
        riskLabel: parsed.data.riskLabel,
        riskReasons: parsed.data.reasons || [],
        riskUpdatedAt: now,
        riskUpdatedBy: actorUid,
        updatedAt: now,
        updatedBy: actorUid,
      },
      { merge: true }
    );

    await db.collection('userSummaries').doc(targetUid).set(
      {
        risk: { label: parsed.data.riskLabel, reasons: parsed.data.reasons || [], updatedAt: now, updatedBy: actorUid },
        updatedAt: now,
      },
      { merge: true }
    );

    await createAuditLog(db as any, {
      actorUid,
      actorRole: 'admin',
      actionType: 'admin_user_risk_updated',
      source: 'admin_ui',
      targetUserId: targetUid,
      beforeState: before ? { riskLabel: before.riskLabel || 'unknown', riskReasons: before.riskReasons || [] } : undefined,
      afterState: { riskLabel: parsed.data.riskLabel, riskReasons: parsed.data.reasons || [] },
      metadata: { reason: parsed.data.reason, ip: meta.ip, userAgent: meta.userAgent },
    });

    return json({ ok: true, userId: targetUid, riskLabel: parsed.data.riskLabel });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to set risk', message: e?.message || String(e) }, { status: 500 });
  }
}

