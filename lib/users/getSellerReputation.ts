import type { UserProfile } from '@/lib/types';

export type SellerReputationLevel = 'new' | 'established' | 'trusted';

export interface SellerReputation {
  level: SellerReputationLevel;
  deliverySuccessRate: number;
  disputeRate: number;
  badges: string[];
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function daysSince(d: Date | undefined | null): number {
  if (!d) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000)));
}

/**
 * Derived seller reputation stats (Phase 2E).
 *
 * NON-NEGOTIABLE:
 * - Derived only (no DB writes, no fake reviews/ratings)
 * - Uses existing fields on the user profile (and optional caller-provided dispute counts)
 */
export function getSellerReputation(params: {
  profile: UserProfile | null;
  disputeCount?: number; // If caller can compute (seller/admin views)
  totalTransactionsOverride?: number; // Optional explicit denominator
}): SellerReputation {
  const { profile } = params;
  if (!profile) {
    return { level: 'new', deliverySuccessRate: 0, disputeRate: 0, badges: [] };
  }

  const completed = Number(profile.completedSalesCount || 0);
  const verifiedTx = Number(profile.verifiedTransactionsCount || 0);
  const totalTx = Number.isFinite(params.totalTransactionsOverride as any)
    ? Number(params.totalTransactionsOverride)
    : Math.max(completed, verifiedTx);

  const completionRateRaw = profile.completionRate;
  const deliverySuccessRate =
    typeof completionRateRaw === 'number'
      ? clamp01(completionRateRaw > 1 ? completionRateRaw / 100 : completionRateRaw)
      : totalTx > 0
        ? 1
        : 0;

  const disputeCount = typeof params.disputeCount === 'number' && params.disputeCount >= 0 ? params.disputeCount : 0;
  const disputeRate = totalTx > 0 ? clamp01(disputeCount / totalTx) : 0;

  const accountAgeDays = daysSince(profile.createdAt);

  const badges: string[] = [];
  if (profile.emailVerified) badges.push('Email verified');
  if (profile.seller?.credentials?.identityVerified) badges.push('Identity verified');
  if (profile.payoutsEnabled) badges.push('Payouts enabled');
  if (profile.chargesEnabled) badges.push('Payments enabled');
  if (profile.profile?.location?.state === 'TX') badges.push('Texas-based');

  // Leveling: conservative thresholds (derived, explainable, easy to tune).
  let level: SellerReputationLevel = 'new';
  if (totalTx >= 3 && accountAgeDays >= 30) level = 'established';
  if (totalTx >= 10 && accountAgeDays >= 180 && deliverySuccessRate >= 0.95 && disputeRate <= 0.05) level = 'trusted';

  // Add level badges for UI.
  if (level === 'trusted') badges.unshift('Trusted seller');
  else if (level === 'established') badges.unshift('Established seller');
  else badges.unshift('New seller');

  return {
    level,
    deliverySuccessRate,
    disputeRate,
    badges,
  };
}

