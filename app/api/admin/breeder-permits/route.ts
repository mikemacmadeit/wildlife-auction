export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, json } from '@/app/api/admin/_util';

function toIso(ts: any): string | null {
  try {
    if (!ts) return null;
    if (typeof ts?.toDate === 'function') return ts.toDate().toISOString();
    if (ts instanceof Date) return ts.toISOString();
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || 'pending').trim();
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '25', 10) || 25));

  const allowed = new Set(['pending', 'verified', 'rejected']);
  if (!allowed.has(status)) return json({ ok: false, error: 'Invalid status' }, { status: 400 });

  const q = admin.ctx.db
    .collection('sellerPermits')
    .where('type', '==', 'TPWD_BREEDER_PERMIT')
    .where('status', '==', status)
    .orderBy('uploadedAt', 'desc')
    .limit(limit);

  const snap = await q.get();
  const items = snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      sellerId: String(data?.sellerId || d.id),
      status: String(data?.status || ''),
      permitNumber: data?.permitNumber || null,
      documentUrl: data?.documentUrl || null,
      storagePath: data?.storagePath || null,
      rejectionReason: data?.rejectionReason || null,
      expiresAt: toIso(data?.expiresAt),
      uploadedAt: toIso(data?.uploadedAt),
      reviewedAt: toIso(data?.reviewedAt),
      reviewedBy: data?.reviewedBy || null,
      updatedAt: toIso(data?.updatedAt),
    };
  });

  return json({ ok: true, permits: items });
}

