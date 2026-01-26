/**
 * Seller Tiers (Subscription Model)
 *
 * IMPORTANT:
 * - Marketplace fee is flat at 10% for all sellers and categories (not tier-based).
 * - Subscriptions are optional and only affect exposure/priority UX and styling.
 * - We keep backward compatibility for legacy ids 'free'|'pro'|'elite'.
 */

import type { SubscriptionTier } from '@/lib/pricing/subscriptions';
import { mapLegacyPlanToTier, getTierWeight } from '@/lib/pricing/subscriptions';

// Back-compat: some older UI/routes still pass these ids.
export type LegacyPlanId = 'free' | 'pro' | 'elite';
export type PlanId = SubscriptionTier | LegacyPlanId;

export const MARKETPLACE_FEE_PERCENT = 0.10;

export interface PlanConfig {
  /** Canonical tier id */
  id: SubscriptionTier;
  displayName: string; // Standard / Priority / Premier
  monthlyPrice: number;
  tierWeight: number; // standard=0 priority=10 premier=20

  /** Kept for compatibility with older UI; always 10% */
  takeRate: number;
  /** Kept for compatibility with older UI; always unlimited */
  listingLimit: null;
}

export const PLAN_CONFIG: Record<SubscriptionTier, PlanConfig> = {
  standard: {
    id: 'standard',
    displayName: 'Standard',
    monthlyPrice: 0,
    tierWeight: getTierWeight('standard'),
    takeRate: MARKETPLACE_FEE_PERCENT,
    listingLimit: null,
  },
  priority: {
    id: 'priority',
    displayName: 'Priority',
    monthlyPrice: 99,
    tierWeight: getTierWeight('priority'),
    takeRate: MARKETPLACE_FEE_PERCENT,
    listingLimit: null,
  },
  premier: {
    id: 'premier',
    displayName: 'Premier',
    monthlyPrice: 299,
    tierWeight: getTierWeight('premier'),
    takeRate: MARKETPLACE_FEE_PERCENT,
    listingLimit: null,
  },
};

export function getPlanConfig(planId: string | null | undefined): PlanConfig {
  const tier = mapLegacyPlanToTier(planId);
  return PLAN_CONFIG[tier];
}

export function getPlanDisplayName(planId: string | null | undefined): string {
  return getPlanConfig(planId).displayName;
}

export function getPlanTakeRate(_planId: string | null | undefined): number {
  // Flat fee for everyone.
  return MARKETPLACE_FEE_PERCENT;
}

export function getPlanListingLimit(_planId: string | null | undefined): null {
  // Unlimited listings for all tiers (limits are explicitly NOT part of the new model).
  return null;
}

export function hasUnlimitedListings(_planId: string | null | undefined): boolean {
  return true;
}

export function canCreateListing(_planId: string | null | undefined, _currentActiveListings: number): boolean {
  // Standard sellers must never be blocked from listing.
  return true;
}

export function getRemainingListingSlots(_planId: string | null | undefined, _currentActiveListings: number): null {
  return null;
}
