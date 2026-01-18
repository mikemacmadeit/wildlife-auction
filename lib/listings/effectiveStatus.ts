import type { Listing, ListingStatus } from '@/lib/types';

/**
 * Compute the *effective* listing status for UI purposes.
 *
 * Why this exists:
 * - Auctions can end (endsAt <= now) while the stored Firestore `status` is still 'active'
 *   (we currently don't have an auto-close job that flips status -> 'expired').
 * - Some UI (seller listings dashboard) must still show the correct state and filter correctly.
 *
 * NOTE: This does NOT write anything to Firestore. It is purely a UI normalization layer.
 */
export function getEffectiveListingStatus(
  listing: Pick<Listing, 'status' | 'type' | 'endsAt' | 'soldAt'>,
  nowMs: number = Date.now()
): ListingStatus {
  // Trust persisted status first.
  if (listing.status === 'sold') return 'sold';
  if (listing.status === 'expired') return 'expired';
  if (listing.status === 'draft') return 'draft';
  if (listing.status === 'pending') return 'pending';
  if (listing.status === 'removed') return 'removed';

  // Back-compat: if a soldAt exists but status didn't get flipped, treat as sold.
  const soldAtMs = listing.soldAt instanceof Date ? listing.soldAt.getTime() : null;
  if (typeof soldAtMs === 'number' && Number.isFinite(soldAtMs)) return 'sold';

  // UI-only normalization: ended auctions are effectively expired.
  if (listing.status === 'active' && listing.type === 'auction') {
    const endMs = listing.endsAt instanceof Date ? listing.endsAt.getTime() : null;
    if (typeof endMs === 'number' && Number.isFinite(endMs) && endMs <= nowMs) {
      return 'expired';
    }
  }

  return listing.status;
}

export function isAuctionEnded(listing: Pick<Listing, 'type' | 'endsAt'>, nowMs: number = Date.now()): boolean {
  if (listing.type !== 'auction') return false;
  const endMs = listing.endsAt instanceof Date ? listing.endsAt.getTime() : null;
  if (typeof endMs !== 'number' || !Number.isFinite(endMs)) return false;
  return endMs <= nowMs;
}

