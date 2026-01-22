import type { Listing, ListingStatus } from '@/lib/types';
import { normalizeListingForUI } from '@/lib/listings/duration';

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
  listing: Pick<Listing, 'status' | 'type' | 'endsAt' | 'endAt' | 'startAt' | 'publishedAt' | 'createdAt' | 'soldAt'>,
  nowMs: number = Date.now()
): ListingStatus {
  const normalized = normalizeListingForUI(listing as any, nowMs) as any;

  // Trust persisted/normalized status first.
  if (normalized.status === 'sold') return 'sold';
  if (normalized.status === 'ended') return 'ended';
  if (normalized.status === 'expired') return 'expired';
  if (normalized.status === 'draft') return 'draft';
  if (normalized.status === 'pending') return 'pending';
  if (normalized.status === 'removed') return 'removed';

  // Back-compat: if a soldAt exists but status didn't get flipped, treat as sold.
  const soldAtMs = listing.soldAt instanceof Date ? listing.soldAt.getTime() : null;
  if (typeof soldAtMs === 'number' && Number.isFinite(soldAtMs)) return 'sold';

  return normalized.status;
}

export function isAuctionEnded(listing: Pick<Listing, 'type' | 'endsAt'>, nowMs: number = Date.now()): boolean {
  if (listing.type !== 'auction') return false;
  const endMs = listing.endsAt instanceof Date ? listing.endsAt.getTime() : null;
  if (typeof endMs !== 'number' || !Number.isFinite(endMs)) return false;
  return endMs <= nowMs;
}

