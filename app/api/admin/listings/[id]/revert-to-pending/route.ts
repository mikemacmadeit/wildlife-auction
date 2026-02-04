/**
 * POST /api/admin/listings/[id]/revert-to-pending
 *
 * Admin-only: reverts an AI-auto-approved listing back to pending for manual review.
 * Only allowed when listing.status === 'active' and aiModeration.decision === 'auto_approved'.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { isAdminUid } from '@/app/api/admin/notifications/_admin';
import { createAuditLog } from '@/lib/audit/logger';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const listingId = String(ctx?.params?.id || '').trim();
  if (!listingId) return json({ ok: false, error: 'Missing listingId' }, { status: 400 });

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.slice('Bearer '.length);

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const claimRole = (decoded as any)?.role;
  const claimSuper = (decoded as any)?.superAdmin === true;
  const claimIsAdmin = claimRole === 'admin' || claimRole === 'super_admin' || claimSuper;
  const docIsAdmin = claimIsAdmin ? true : await isAdminUid(uid);
  if (!docIsAdmin) return json({ ok: false, error: 'Admin access required' }, { status: 403 });

  const listingRef = db.collection('listings').doc(listingId);
  const snap = await listingRef.get();
  if (!snap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

  const listing = snap.data() as any;
  const sellerId = String(listing?.sellerId || '');

  if (listing?.status !== 'active') {
    return json(
      { ok: false, error: 'Invalid state', message: 'Only active listings can be reverted.' },
      { status: 400 }
    );
  }

  const aiDecision = listing?.aiModeration?.decision;
  if (aiDecision !== 'auto_approved') {
    return json(
      { ok: false, error: 'Invalid state', message: 'Only AI-auto-approved listings can be reverted.' },
      { status: 400 }
    );
  }

  const beforeState = {
    status: listing?.status,
    complianceStatus: listing?.complianceStatus,
  };

  await listingRef.update({
    status: 'pending',
    complianceStatus: 'pending_review',
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  });

  try {
    await createAuditLog(db as any, {
      actorUid: uid,
      actorRole: 'admin',
      actionType: 'listing_ai_override_revert_to_pending',
      listingId,
      targetUserId: sellerId,
      beforeState,
      afterState: { status: 'pending', complianceStatus: 'pending_review' },
      metadata: { listingTitle: String(listing?.title || 'Listing') },
      source: 'admin_ui',
    });
  } catch {
    // Best-effort audit
  }

  return json({ ok: true });
}
