import type { UserRecord } from 'firebase-admin/auth';

export type RiskLabel = 'low' | 'med' | 'high' | 'unknown';
export type AdminUserStatus = 'active' | 'disabled' | 'suspended' | 'banned';

function digitsOnly(v: string): string {
  return v.replace(/[^\d]/g, '');
}

function uniq(arr: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of arr) {
    const v = s.trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function buildSearchTokens(params: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
  sellerDisplayName?: string | null;
}): string[] {
  const uid = String(params.uid || '').trim();
  const email = (params.email || '').trim();
  const displayName = (params.displayName || '').trim();
  const sellerDisplayName = (params.sellerDisplayName || '').trim();
  const phone = (params.phoneNumber || '').trim();
  const phoneDigits = phone ? digitsOnly(phone) : '';

  const emailLower = email.toLowerCase();
  const nameLower = displayName.toLowerCase();
  const sellerLower = sellerDisplayName.toLowerCase();

  const emailLocal = emailLower.includes('@') ? emailLower.split('@')[0] : '';
  const emailDomain = emailLower.includes('@') ? emailLower.split('@')[1] : '';

  const tokens: string[] = [];
  if (uid) {
    tokens.push(uid.toLowerCase());
    tokens.push(uid.slice(-6).toLowerCase());
  }
  if (emailLower) {
    tokens.push(emailLower);
    if (emailLocal) tokens.push(emailLocal);
    if (emailDomain) tokens.push(emailDomain);
  }
  if (nameLower) {
    tokens.push(...nameLower.split(/\s+/g));
  }
  if (sellerLower) {
    tokens.push(...sellerLower.split(/\s+/g));
  }
  if (phoneDigits) {
    tokens.push(phoneDigits);
    if (phoneDigits.length >= 4) tokens.push(phoneDigits.slice(-4));
  }

  return uniq(tokens.map((t) => t.trim().toLowerCase()).filter(Boolean));
}

export function computeUserStatus(params: {
  authDisabled?: boolean;
  bannedAt?: any;
  suspendedUntil?: any;
}): AdminUserStatus {
  const now = Date.now();
  const banned = !!params.bannedAt;
  if (banned) return 'banned';

  const until = params.suspendedUntil;
  const untilMs =
    typeof until === 'number'
      ? until
      : typeof until?.toMillis === 'function'
        ? until.toMillis()
        : typeof until?.seconds === 'number'
          ? until.seconds * 1000
          : null;
  if (untilMs && untilMs > now) return 'suspended';

  if (params.authDisabled) return 'disabled';
  return 'active';
}

export function buildUserSummary(params: {
  uid: string;
  authUser?: UserRecord | null;
  userDoc?: any | null; // Firestore users/{uid}
  now?: Date;
}) {
  const now = params.now || new Date();
  const uid = params.uid;
  const au = params.authUser || null;
  const doc = params.userDoc || null;

  const email = au?.email || doc?.email || null;
  const displayName = au?.displayName || doc?.displayName || doc?.profile?.fullName || null;
  const sellerDisplayName = doc?.profile?.businessName || null;
  const phoneNumber = au?.phoneNumber || doc?.phoneNumber || null;

  const role = doc?.role || null;
  const emailVerified = au?.emailVerified === true || doc?.emailVerified === true;
  const authDisabled = au?.disabled === true;

  const createdAt = doc?.createdAt || (au?.metadata?.creationTime ? new Date(au.metadata.creationTime) : null) || null;
  const lastLoginAt = au?.metadata?.lastSignInTime ? new Date(au.metadata.lastSignInTime) : (doc?.lastLoginAt || null);

  const identityVerified =
    typeof doc?.seller?.credentials?.identityVerified === 'boolean' ? doc.seller.credentials.identityVerified : undefined;
  const sellerVerified = typeof doc?.seller?.verified === 'boolean' ? doc.seller.verified : undefined;

  const riskLabel: RiskLabel =
    typeof doc?.riskLabel === 'string' && ['low', 'med', 'high', 'unknown'].includes(doc.riskLabel)
      ? doc.riskLabel
      : 'unknown';

  const status = computeUserStatus({
    authDisabled,
    bannedAt: doc?.bannedAt,
    suspendedUntil: doc?.suspendedUntil,
  });

  const stripeAccountId = typeof doc?.stripeAccountId === 'string' ? doc.stripeAccountId : null;
  const stripeOnboardingStatus = typeof doc?.stripeOnboardingStatus === 'string' ? doc.stripeOnboardingStatus : null;
  const payoutsEnabled = typeof doc?.payoutsEnabled === 'boolean' ? doc.payoutsEnabled : null;
  const chargesEnabled = typeof doc?.chargesEnabled === 'boolean' ? doc.chargesEnabled : null;

  const searchTokens = buildSearchTokens({
    uid,
    email,
    displayName,
    phoneNumber,
    sellerDisplayName,
  });

  return {
    uid,
    email,
    emailLower: typeof email === 'string' ? email.toLowerCase() : null,
    displayName,
    displayNameLower: typeof displayName === 'string' ? displayName.toLowerCase() : null,
    sellerDisplayName,
    phoneNumber,
    phoneDigits: typeof phoneNumber === 'string' ? digitsOnly(phoneNumber) : null,
    role,
    emailVerified,
    authDisabled,
    status,
    createdAt: createdAt || null,
    lastLoginAt: lastLoginAt || null,
    lastActivityAt: doc?.lastActivityAt || lastLoginAt || createdAt || null,
    verification: {
      identityVerified: identityVerified ?? null,
      sellerVerified: sellerVerified ?? null,
    },
    risk: {
      label: riskLabel,
      reasons: Array.isArray(doc?.riskReasons) ? doc.riskReasons : [],
      updatedAt: doc?.riskUpdatedAt || null,
      updatedBy: doc?.riskUpdatedBy || null,
    },
    sellerFlags: {
      sellingDisabled: typeof doc?.adminFlags?.sellingDisabled === 'boolean' ? doc.adminFlags.sellingDisabled : null,
    },
    messagingFlags: {
      muted: typeof doc?.adminFlags?.messagingMuted === 'boolean' ? doc.adminFlags.messagingMuted : null,
    },
    stripe: {
      accountId: stripeAccountId,
      onboardingStatus: stripeOnboardingStatus,
      payoutsEnabled,
      chargesEnabled,
    },
    counts: {
      listingsCount: Number(doc?.listingsCount || 0) || 0,
      activeListingsCount: Number(doc?.activeListingsCount || 0) || 0,
      soldListingsCount: Number(doc?.soldListingsCount || 0) || 0,
      disputesCount: Number(doc?.disputesCount || 0) || 0,
      reportsCount: Number(doc?.reportsCount || 0) || 0,
      messagesCount: Number(doc?.messagesCount || 0) || 0,
      watchlistCount: Number(doc?.watchlistCount || 0) || 0,
      savedSearchCount: Number(doc?.savedSearchCount || 0) || 0,
      ordersBuyCount: Number(doc?.ordersBuyCount || 0) || 0,
      ordersSellCount: Number(doc?.ordersSellCount || 0) || 0,
      gmvBuyCents: Number(doc?.gmvBuyCents || 0) || 0,
      gmvSellCents: Number(doc?.gmvSellCents || 0) || 0,
    },
    searchTokens,
    updatedAt: now,
  };
}

