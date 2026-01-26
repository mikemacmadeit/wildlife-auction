/**
 * Whitetail Breeder Buck Compliance Detection
 * 
 * Identifies regulated whitetail breeder buck listings/orders that require
 * TPWD transfer permit compliance confirmation before fulfillment.
 */

import type { Listing, Order } from '@/lib/types';
import type { WhitetailBreederAttributes } from '@/lib/types';

/**
 * Check if a listing is a regulated whitetail breeder buck transaction
 * that requires TPWD transfer permit compliance confirmation.
 * 
 * Criteria:
 * - Category must be 'whitetail_breeder'
 * - Must have whitetail breeder attributes
 * - Must be a breeder buck (male deer)
 */
export function isRegulatedWhitetailDeal(listingOrOrder: Listing | Order): boolean {
  // For orders, check listingSnapshot
  if ('listingSnapshot' in listingOrOrder && listingOrOrder.listingSnapshot) {
    const snapshot = listingOrOrder.listingSnapshot;
    if (snapshot.category === 'whitetail_breeder') {
      const attrs = snapshot.attributes as WhitetailBreederAttributes | undefined;
      if (attrs && attrs.sex === 'male') {
        return true;
      }
    }
    return false;
  }

  // For listings, check directly
  if ('category' in listingOrOrder) {
    const listing = listingOrOrder as Listing;
    if (listing.category === 'whitetail_breeder') {
      const attrs = listing.attributes as WhitetailBreederAttributes | undefined;
      if (attrs && attrs.sex === 'male') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get compliance confirmation status for an order.
 * Returns whether both buyer and seller have confirmed compliance.
 */
export function hasComplianceConfirmations(order: Order): {
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  bothConfirmed: boolean;
} {
  const buyerConfirmed = !!order.complianceTransfer?.buyerConfirmedAt;
  const sellerConfirmed = !!order.complianceTransfer?.sellerConfirmedAt;
  
  return {
    buyerConfirmed,
    sellerConfirmed,
    bothConfirmed: buyerConfirmed && sellerConfirmed,
  };
}
