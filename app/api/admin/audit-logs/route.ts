/**
 * GET /api/admin/audit-logs
 *
 * Admin-only: fetch recent audit log entries for Health tab "Recent Audit Activity".
 * Returns latest 20 auditLogs ordered by createdAt desc.
 */
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { assertInt32 } from '@/lib/debug/int32Tripwire';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMIT = 20;

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

export async function GET(request: Request) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { db } = admin.ctx;

  try {
    const safeLimit = Math.min(LIMIT, 50);
    assertInt32(safeLimit, 'Firestore.limit');

    const snap = await db
      .collection('auditLogs')
      .orderBy('createdAt', 'desc')
      .limit(safeLimit)
      .get();

    const logs = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        auditId: d.id,
        actorUid: String(data.actorUid || ''),
        actorRole: String(data.actorRole || ''),
        actionType: String(data.actionType || ''),
        orderId: data.orderId ?? null,
        listingId: data.listingId ?? null,
        targetUserId: data.targetUserId ?? null,
        createdAt: tsToIso(data.createdAt),
        source: data.source ?? null,
      };
    });

    return json({ ok: true, logs });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Failed to fetch audit logs' }, { status: 500 });
  }
}
