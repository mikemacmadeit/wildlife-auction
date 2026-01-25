export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, json } from '@/app/api/admin/_util';
import { createAuditLog } from '@/lib/audit/logger';

export async function POST(request: Request, { params }: { params: { sellerId: string } }) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const adminId = admin.ctx.actorUid;
  const db = admin.ctx.db;
  const sellerId = String(params?.sellerId || '').trim();
  if (!sellerId) return json({ ok: false, error: 'sellerId required' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const status = typeof body?.status === 'string' ? body.status.trim() : '';
  const rejectionReason = typeof body?.rejectionReason === 'string' ? body.rejectionReason.trim() : '';
  const expiresAtIso = typeof body?.expiresAt === 'string' ? body.expiresAt.trim() : '';

  if (!['verified', 'rejected'].includes(status)) {
    return json({ ok: false, error: 'status must be "verified" or "rejected"' }, { status: 400 });
  }
  if (status === 'rejected' && !rejectionReason) {
    return json({ ok: false, error: 'rejectionReason is required when rejecting' }, { status: 400 });
  }

  const expiresAt = expiresAtIso ? new Date(expiresAtIso) : null;
  if (expiresAtIso && Number.isNaN(expiresAt?.getTime() || NaN)) {
    return json({ ok: false, error: 'expiresAt must be an ISO date string' }, { status: 400 });
  }

  const permitRef = db.collection('sellerPermits').doc(sellerId);
  const snap = await permitRef.get();
  if (!snap.exists) {
    console.error(`[breeder-permits/review] Permit not found for sellerId: ${sellerId}`);
    return json({ ok: false, error: 'Permit submission not found' }, { status: 404 });
  }

  const before = snap.data() as any;
  console.log(`[breeder-permits/review] Before update for sellerId ${sellerId}:`, {
    currentStatus: before?.status,
    newStatus: status,
    hasExpiresAt: !!expiresAt,
  });
  
  const now = Timestamp.now();

  const update: Record<string, any> = {
    status,
    reviewedAt: now,
    reviewedBy: adminId,
    updatedAt: now,
    rejectionReason: status === 'rejected' ? rejectionReason : null,
    ...(expiresAt ? { expiresAt: Timestamp.fromDate(expiresAt) } : {}),
  };

  await permitRef.update(update);
  console.log(`[breeder-permits/review] Updated sellerPermits document for sellerId ${sellerId} with status: ${status}`);
  
  // Verify the update was successful
  const verifySnap = await permitRef.get();
  const verifyData = verifySnap.data() as any;
  console.log(`[breeder-permits/review] Verification - permit status after update:`, verifyData?.status);

  // Update public seller trust badge (server-authored doc).
  try {
    const trustRef = db.collection('publicSellerTrust').doc(sellerId);
    const trustSnap = await trustRef.get();
    const existing = trustSnap.exists ? (trustSnap.data() as any) : {};
    const prev: string[] = Array.isArray(existing?.badgeIds) ? existing.badgeIds : [];

    const next = new Set(prev.filter((b) => b !== 'tpwd_breeder_permit_verified'));
    const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;
    if (status === 'verified' && !isExpired) next.add('tpwd_breeder_permit_verified');

    await trustRef.set(
      {
        userId: sellerId,
        badgeIds: Array.from(next),
        tpwdBreederPermit: {
          status,
          verifiedAt: now,
          ...(expiresAt ? { expiresAt: Timestamp.fromDate(expiresAt) } : {}),
        },
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (e) {
    console.error('Failed to update publicSellerTrust for breeder permit', e);
  }

  // Audit log (best-effort).
  try {
    await createAuditLog(db as any, {
      actorUid: adminId,
      actorRole: 'admin',
      actionType: status === 'verified' ? 'admin_seller_breeder_permit_verified' : 'admin_seller_breeder_permit_rejected',
      targetUserId: sellerId,
      beforeState: { status: before?.status || null, rejectionReason: before?.rejectionReason || null },
      afterState: { status, ...(status === 'rejected' ? { rejectionReason } : {}), ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) },
      source: 'admin_ui',
    });
  } catch {
    // ignore
  }

  return json({ ok: true, status });
}

