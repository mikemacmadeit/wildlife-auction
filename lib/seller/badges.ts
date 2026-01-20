import type { PublicSellerTrust, SellerBadgeId, UserProfile } from '@/lib/types';

export type SellerBadgeDefinition = {
  id: SellerBadgeId;
  label: string;
  description: string;
  // Tailwind classes
  className: string;
};

export const SELLER_BADGE_DEFS: Record<SellerBadgeId, SellerBadgeDefinition> = {
  verified_seller: {
    id: 'verified_seller',
    label: 'Stripe Verified',
    description: 'Stripe has verified enough information to enable payouts for this seller.',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  stripe_payouts_enabled: {
    id: 'stripe_payouts_enabled',
    label: 'Payouts enabled',
    description: 'Seller can receive payouts via Stripe Connect.',
    className: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  stripe_payments_enabled: {
    id: 'stripe_payments_enabled',
    label: 'Payments enabled',
    description: 'Seller can accept payments via Stripe.',
    className: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  },
  identity_verified: {
    id: 'identity_verified',
    label: 'Identity verified',
    description: 'Seller identity has been verified.',
    className: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  tpwd_breeder_permit_verified: {
    id: 'tpwd_breeder_permit_verified',
    label: 'Breeder permit verified',
    description: 'Breeder permit document has been verified by the marketplace (not regulator approval).',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  },
};

export function badgeIdsToDefinitions(badgeIds: SellerBadgeId[]): SellerBadgeDefinition[] {
  const seen = new Set<SellerBadgeId>();
  const out: SellerBadgeDefinition[] = [];
  for (const id of badgeIds) {
    if (!id || seen.has(id)) continue;
    const def = SELLER_BADGE_DEFS[id];
    if (!def) continue;
    seen.add(id);
    out.push(def);
  }
  return out;
}

export function computePublicSellerTrustFromUser(params: {
  userId: string;
  userDoc: Partial<UserProfile> | null | undefined;
  stripe?: {
    onboardingStatus?: string;
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
    detailsSubmitted?: boolean;
    hasPendingRequirements?: boolean;
  };
  tpwdBreederPermit?: {
    status: 'verified' | 'rejected';
    expiresAt?: Date | null;
  };
}): Pick<PublicSellerTrust, 'userId' | 'badgeIds' | 'tpwdBreederPermit' | 'stripe' | 'updatedAt'> {
  const { userId, userDoc } = params;
  const badgeIds: SellerBadgeId[] = [];

  // Keep internal identity verification badge (if present), but do not tie it to Stripe/KYC.
  const identityVerified = userDoc?.seller?.credentials?.identityVerified === true;
  if (identityVerified) badgeIds.push('identity_verified');

  const stripeOnboarding = params.stripe?.onboardingStatus;
  const payoutsEnabled = params.stripe?.payoutsEnabled === true;
  const chargesEnabled = params.stripe?.chargesEnabled === true;
  const detailsSubmitted = params.stripe?.detailsSubmitted === true;
  const hasPendingRequirements = params.stripe?.hasPendingRequirements === true;

  // Simple, user-facing trust signal:
  // If Stripe payouts are enabled, show a single badge: "Stripe Verified".
  if (payoutsEnabled) badgeIds.push('verified_seller');

  const permit = params.tpwdBreederPermit;
  if (permit?.status === 'verified') {
    const exp = permit.expiresAt || null;
    const isExpired = exp ? exp.getTime() < Date.now() : false;
    if (!isExpired) badgeIds.push('tpwd_breeder_permit_verified');
  }

  return {
    userId,
    badgeIds,
    tpwdBreederPermit: permit
      ? {
          status: permit.status,
          ...(permit.expiresAt ? { expiresAt: permit.expiresAt } : {}),
        }
      : undefined,
    stripe: params.stripe
      ? {
          onboardingStatus: stripeOnboarding,
          payoutsEnabled,
          chargesEnabled,
          detailsSubmitted,
          hasPendingRequirements,
          updatedAt: new Date(),
        }
      : undefined,
    updatedAt: new Date(),
  };
}

