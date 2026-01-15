/**
 * Exposure Plans (Subscription Tiers)
 *
 * Single source of truth for mapping legacy plan fields to the new subscriptionTier:
 * - free  -> standard
 * - pro   -> priority
 * - elite -> premier
 *
 * IMPORTANT:
 * - This tier is for exposure/priority UX only. It does NOT imply compliance approval.
 * - Marketplace fee is NOT tier-based (kept flat elsewhere).
 */

import type { UserProfile } from '@/lib/types';

export type SubscriptionTier = 'standard' | 'priority' | 'premier';

export function isSubscriptionTier(v: any): v is SubscriptionTier {
  return v === 'standard' || v === 'priority' || v === 'premier';
}

export function mapLegacyPlanToTier(planId: string | null | undefined): SubscriptionTier {
  if (!planId) return 'standard';
  const normalized = String(planId).toLowerCase().trim();
  if (normalized === 'standard') return 'standard';
  if (normalized === 'priority') return 'priority';
  if (normalized === 'premier') return 'premier';
  if (normalized === 'free') return 'standard';
  if (normalized === 'pro') return 'priority';
  if (normalized === 'elite') return 'premier';
  return 'standard';
}

export function mapTierToLegacyPlanId(tier: SubscriptionTier): 'free' | 'pro' | 'elite' {
  switch (tier) {
    case 'priority':
      return 'pro';
    case 'premier':
      return 'elite';
    case 'standard':
    default:
      return 'free';
  }
}

export function getTierWeight(tier: SubscriptionTier): number {
  switch (tier) {
    case 'premier':
      return 20;
    case 'priority':
      return 10;
    case 'standard':
    default:
      return 0;
  }
}

export function getTierLabel(tier: SubscriptionTier): string {
  switch (tier) {
    case 'premier':
      return 'Premier Seller';
    case 'priority':
      return 'Priority Seller';
    case 'standard':
    default:
      return 'Standard Seller';
  }
}

export function getEffectiveSubscriptionTier(user: Partial<UserProfile> | null | undefined): SubscriptionTier {
  if (!user) return 'standard';

  // 1) New field (preferred)
  const direct = (user as any).subscriptionTier;
  if (isSubscriptionTier(direct)) return direct;

  // 2) Admin override (legacy field) maps into tier
  const adminOverride = (user as any).adminPlanOverride;
  if (typeof adminOverride === 'string' && adminOverride.trim()) {
    return mapLegacyPlanToTier(adminOverride);
  }

  // 3) Stripe lifecycle states: if not active/trialing, revert to standard (unless admin override)
  const status = (user as any).subscriptionStatus as UserProfile['subscriptionStatus'];
  if (status === 'past_due' || status === 'canceled' || status === 'unpaid') {
    return 'standard';
  }

  // 4) Legacy plan field
  const legacyPlan = (user as any).subscriptionPlan;
  return mapLegacyPlanToTier(typeof legacyPlan === 'string' ? legacyPlan : undefined);
}

export function isPrioritySeller(tier: SubscriptionTier): boolean {
  return tier === 'priority';
}

export function isPremierSeller(tier: SubscriptionTier): boolean {
  return tier === 'premier';
}

