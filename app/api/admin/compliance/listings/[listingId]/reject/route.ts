/**
 * POST /api/admin/compliance/listings/[listingId]/reject
 *
 * Admin-only: reject compliance for a listing (keeps listing pending; seller can edit/resubmit).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { emitEventForUser, emitEventToUsers } from '@/lib/notifications';
import { listAdminRecipientUids } from '@/lib/admin/adminRecipients';
import { getSiteUrl } from '@/lib/site-url';

const bodySchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500),
});

export async function POST(request: Request, ctx: { params: { listingId: string } }) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const listingId = String(ctx?.params?.listingId || '').trim();
  if (!listingId) return json({ ok: false, error: 'Missing listingId' }, { status: 400 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  const { reason } = parsed.data;
  const { db, actorUid } = admin.ctx;
  const ref = db.collection('listings').doc(listingId);
  const snap = await ref.get();
  if (!snap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

  const listing = snap.data() as any;
  const sellerId = String(listing?.sellerId || '');
  const title = String(listing?.title || 'Listing');
  if (!sellerId) return json({ ok: false, error: 'Listing missing sellerId' }, { status: 400 });

  const now = Timestamp.now();
  await ref.update({
    complianceStatus: 'rejected',
    complianceRejectionReason: reason,
    complianceReviewedBy: actorUid,
    complianceReviewedAt: now,
    updatedAt: now,
    updatedBy: actorUid,
  });

  // Seller notification through canonical pipeline (idempotent, best-effort).
  try {
    const origin = getSiteUrl();
    await emitEventForUser({
      type: 'Listing.ComplianceRejected',
      actorId: actorUid,
      entityType: 'listing',
      entityId: listingId,
      targetUserId: sellerId,
      payload: {
        type: 'Listing.ComplianceRejected',
        listingId,
        listingTitle: title,
        editUrl: `${origin}/seller/listings/${listingId}/edit`,
        reason,
      },
      optionalHash: `compliance_rejected:${listingId}`,
    });
  } catch {
    // ignore
  }

  // Admin notification (best effort)
  try {
    const origin = getSiteUrl();
    const adminUids = await listAdminRecipientUids(db as any);
    if (adminUids.length > 0) {
      await emitEventToUsers({
        type: 'Admin.Listing.Rejected',
        actorId: actorUid,
        entityType: 'listing',
        entityId: listingId,
        targetUserIds: adminUids,
        payload: {
          type: 'Admin.Listing.Rejected',
          listingId,
          listingTitle: title,
          sellerId,
          sellerName: String(listing?.sellerSnapshot?.displayName || listing?.seller?.name || sellerId),
          reason,
          adminQueueUrl: `${origin}/dashboard/admin/listings`,
        },
        optionalHash: `admin_listing_rejected:${listingId}`,
      });
    }
  } catch {
    // ignore
  }

  return json({ ok: true });
}

