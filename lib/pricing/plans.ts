/**
 * Seller Pricing Plans Configuration
 * Single source of truth for plan definitions
 */

export type PlanId = 'free' | 'pro' | 'elite';

export interface PlanConfig {
  id: PlanId;
  displayName: string;
  monthlyPrice: number;
  takeRate: number; // Transaction fee percentage (0.07 = 7%)
  listingLimit: number | null; // null = unlimited
}

/**
 * Plan configuration - single source of truth
 */
export const PLAN_CONFIG: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    displayName: 'Free',
    monthlyPrice: 0,
    takeRate: 0.07, // 7%
    listingLimit: 3,
  },
  pro: {
    id: 'pro',
    displayName: 'Pro',
    monthlyPrice: 49,
    takeRate: 0.06, // 6%
    listingLimit: 10,
  },
  elite: {
    id: 'elite',
    displayName: 'Elite',
    monthlyPrice: 199,
    takeRate: 0.04, // 4%
    listingLimit: null, // Unlimited
  },
};

/**
 * Get plan configuration by plan ID
 * Handles backward compatibility: maps old plan names to new ones
 */
export function getPlanConfig(planId: string | null | undefined): PlanConfig {
  // Default to free if no plan specified
  if (!planId) {
    return PLAN_CONFIG.free;
  }

  // Normalize plan ID to lowercase
  const normalizedId = planId.toLowerCase().trim();

  // Backward compatibility: map old plan names to new ones
  const planMapping: Record<string, PlanId> = {
    'ranch': 'elite',
    'broker': 'elite',
    'ranch / broker': 'elite',
    'starter': 'free',
  };

  const mappedId = planMapping[normalizedId] || (normalizedId as PlanId);

  // Return plan config or default to free if invalid
  return PLAN_CONFIG[mappedId as PlanId] || PLAN_CONFIG.free;
}

/**
 * Get plan display name
 */
export function getPlanDisplayName(planId: string | null | undefined): string {
  return getPlanConfig(planId).displayName;
}

/**
 * Get transaction fee percentage for a plan
 */
export function getPlanTakeRate(planId: string | null | undefined): number {
  return getPlanConfig(planId).takeRate;
}

/**
 * Get listing limit for a plan
 */
export function getPlanListingLimit(planId: string | null | undefined): number | null {
  return getPlanConfig(planId).listingLimit;
}

/**
 * Check if plan has unlimited listings
 */
export function hasUnlimitedListings(planId: string | null | undefined): boolean {
  return getPlanListingLimit(planId) === null;
}

/**
 * Check if user can create more listings
 */
export function canCreateListing(
  planId: string | null | undefined,
  currentActiveListings: number
): boolean {
  const limit = getPlanListingLimit(planId);
  if (limit === null) {
    return true; // Unlimited
  }
  return currentActiveListings < limit;
}

/**
 * Get remaining listing slots
 */
export function getRemainingListingSlots(
  planId: string | null | undefined,
  currentActiveListings: number
): number | null {
  const limit = getPlanListingLimit(planId);
  if (limit === null) {
    return null; // Unlimited
  }
  return Math.max(0, limit - currentActiveListings);
}
