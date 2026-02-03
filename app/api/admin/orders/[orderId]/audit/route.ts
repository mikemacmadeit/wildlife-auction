/**
 * GET /api/admin/orders/[orderId]/audit
 *
 * Admin-only: fetch audit logs for an order (Ops "Audit Trail" section).
 */
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuditLogsForOrder } from '@/lib/audit/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMIT = 50;

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') {
    const d = v.toDate();
    return d instanceof Date ? d.toISOString() : null;
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return null;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> | { orderId: string } }
) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { db } = admin.ctx;

  const params = typeof (ctx.params as any)?.then === 'function'
    ? await (ctx.params as Promise<{ orderId: string }>)
    : (ctx.params as { orderId: string });
  const orderId = String(params?.orderId || '').trim();
  if (!orderId) return json({ ok: false, error: 'Missing orderId' }, { status: 400 });

  try {
    const dbTyped = db as unknown as ReturnType<typeof getFirestore>;
    const logs = await getAuditLogsForOrder(dbTyped, orderId, LIMIT);

    const result = logs.map((log) => ({
      auditId: log.auditId,
      actorUid: log.actorUid,
      actorRole: log.actorRole,
      actionType: log.actionType,
      orderId: log.orderId ?? null,
      listingId: log.listingId ?? null,
      targetUserId: log.targetUserId ?? null,
      createdAt: tsToIso(log.createdAt),
      beforeState: log.beforeState ?? null,
      afterState: log.afterState ?? null,
      metadata: log.metadata ?? null,
    }));

    return json({ ok: true, logs: result });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Failed to fetch order audit logs' }, { status: 500 });
  }
}
