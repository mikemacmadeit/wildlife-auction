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

  // Preferred: server-side ordering (requires composite index on sellerPermits: type+status+uploadedAt).
  // If the index isn't built yet, fall back to a less strict query and sort in-memory.
  let snap: FirebaseFirestore.QuerySnapshot;
  try {
    const q = admin.ctx.db
      .collection('sellerPermits')
      .where('type', '==', 'TPWD_BREEDER_PERMIT')
      .where('status', '==', status)
      .orderBy('uploadedAt', 'desc')
      .limit(limit);
    snap = await q.get();
  } catch (e: any) {
    const msg = String(e?.message || '');
    const code = String(e?.code || '');
    const looksLikeMissingIndex = code === 'failed-precondition' || msg.toLowerCase().includes('requires an index');
    if (!looksLikeMissingIndex) throw e;

    const qFallback = admin.ctx.db
      .collection('sellerPermits')
      .where('type', '==', 'TPWD_BREEDER_PERMIT')
      .where('status', '==', status)
      .limit(Math.min(200, limit * 4)); // fetch a bit more and sort
    snap = await qFallback.get();
  }

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

  // If fallback query was used (or docs have mixed timestamp shapes), sort client-side.
  items.sort((a, b) => {
    const am = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
    const bm = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
    return bm - am;
  });

  return json({ ok: true, permits: items });
}

