/**
 * POST /api/admin/compliance/listings/[listingId]/approve
 *
 * Admin-only: approve compliance for a listing.
 * IMPORTANT: This does NOT necessarily publish the listing:
 * - If seller is not verified (admin approval queue) OR category is whitetail_breeder, keep status 'pending'.
 * - Otherwise, activate the listing.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { emitEventToUsers } from '@/lib/notifications';
import { listAdminRecipientUids } from '@/lib/admin/adminRecipients';

export async function POST(request: Request, ctx: { params: { listingId: string } }) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const listingId = String(ctx?.params?.listingId || '').trim();
  if (!listingId) return json({ ok: false, error: 'Missing listingId' }, { status: 400 });

  const { db, actorUid } = admin.ctx;
  const ref = db.collection('listings').doc(listingId);
  const snap = await ref.get();
  if (!snap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

  const listing = snap.data() as any;
  const sellerId = String(listing?.sellerId || '');
  const title = String(listing?.title || 'Listing');
  if (!sellerId) return json({ ok: false, error: 'Listing missing sellerId' }, { status: 400 });

  const sellerVerified = listing?.sellerSnapshot?.verified === true;
  const isWhitetail = listing?.category === 'whitetail_breeder';

  const now = Timestamp.now();
  const shouldPublish = listing?.status === 'pending' && sellerVerified && !isWhitetail;

  await ref.update({
    complianceStatus: 'approved',
    complianceReviewedBy: actorUid,
    complianceReviewedAt: now,
    ...(shouldPublish ? { status: 'active', publishedAt: now } : {}),
    updatedAt: now,
    updatedBy: actorUid,
  });

  // Seller in-app notification (non-blocking best effort)
  try {
    await db
      .collection('users')
      .doc(sellerId)
      .collection('notifications')
      .doc()
      .set({
        userId: sellerId,
        type: 'compliance_approved',
        title: 'Compliance approved',
        body: shouldPublish ? `Your listing “${title}” passed compliance and is now live.` : `Your listing “${title}” passed compliance review.`,
        read: false,
        createdAt: now,
        linkUrl: shouldPublish ? `/listing/${listingId}` : `/seller/listings/${listingId}/edit`,
        linkLabel: shouldPublish ? 'View listing' : 'View listing',
        listingId,
        metadata: { complianceStatus: 'approved', status: shouldPublish ? 'active' : listing?.status || 'pending' },
      });
  } catch {
    // ignore
  }

  // Admin notifications: only emit "approved" if the listing actually went live here.
  if (shouldPublish) {
    try {
      const origin = 'https://wildlife.exchange';
      const adminUids = await listAdminRecipientUids(db as any);
      if (adminUids.length > 0) {
        await emitEventToUsers({
          type: 'Admin.Listing.Approved',
          actorId: actorUid,
          entityType: 'listing',
          entityId: listingId,
          targetUserIds: adminUids,
          payload: {
            type: 'Admin.Listing.Approved',
            listingId,
            listingTitle: title,
            sellerId,
            sellerName: String(listing?.sellerSnapshot?.displayName || listing?.seller?.name || sellerId),
            listingUrl: `${origin}/listing/${listingId}`,
            adminQueueUrl: `${origin}/dashboard/admin/listings`,
          },
          optionalHash: `admin_listing_approved:${listingId}`,
        });
      }
    } catch {
      // ignore
    }
  }

  return json({ ok: true, published: shouldPublish });
}

