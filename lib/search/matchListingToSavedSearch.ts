import type { FilterState } from '@/lib/types';

function getListingPriceUsd(listing: any): number {
  if (!listing) return 0;
  if (listing.type === 'auction') return Number(listing.currentBid ?? listing.startingBid ?? 0) || 0;
  return Number(listing.price ?? 0) || 0;
}

export function matchListingToSavedSearch(listing: any, criteria: FilterState): boolean {
  if (!listing || typeof listing !== 'object') return false;
  if (!criteria) return true;

  if (criteria.type && String(listing.type) !== criteria.type) return false;
  if (criteria.category && String(listing.category) !== criteria.category) return false;
  if (criteria.location?.state && String(listing.location?.state || '') !== String(criteria.location.state)) return false;
  if (criteria.location?.city && String(listing.location?.city || '') !== String(criteria.location.city)) return false;

  const price = getListingPriceUsd(listing);
  if (criteria.minPrice != null && Number.isFinite(criteria.minPrice) && price < criteria.minPrice) return false;
  if (criteria.maxPrice != null && Number.isFinite(criteria.maxPrice) && price > criteria.maxPrice) return false;

  if (criteria.species && criteria.species.length > 0) {
    const attrs = listing.attributes || {};
    const speciesId = String(attrs.speciesId || '').toLowerCase();
    const breed = String(attrs.breed || '').toLowerCase();
    const equipmentType = String(attrs.equipmentType || '').toLowerCase();

    const ok = criteria.species.some((s) => {
      const token = String(s).toLowerCase();
      return speciesId === token || speciesId.includes(token) || breed.includes(token) || equipmentType.includes(token);
    });
    if (!ok) return false;
  }

  // Optional toggles:
  if (criteria.verifiedSeller && listing?.sellerSnapshot?.verified !== true && listing?.trust?.verified !== true) return false;
  if (criteria.transportReady && listing?.trust?.transportReady !== true) return false;
  if (criteria.featured && listing?.featured !== true) return false;

  return true;
}

