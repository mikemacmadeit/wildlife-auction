/**
 * POST /api/listings/publish
 * 
 * Server-side listing publish (Seller Tiers model: NO listing limits)
 */

// IMPORTANT:
// Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// Route handlers work fine with standard Web `Request` / `Response`.
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { validateRequest } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { getEffectiveSubscriptionTier, getTierWeight } from '@/lib/pricing/subscriptions';
import { logInfo, logError } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';
import { validateListingCompliance } from '@/lib/compliance/validation';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { emitEventToUsers } from '@/lib/notifications';
import { listAdminRecipientUids } from '@/lib/admin/adminRecipients';
import { normalizeCategory } from '@/lib/listings/normalizeCategory';
import { getCategoryRequirements } from '@/lib/compliance/requirements';
import { coerceDurationDays, computeEndAt, isValidDurationDays, toMillisSafe } from '@/lib/listings/duration';

const publishListingSchema = z.object({
  listingId: z.string().min(1),
});

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      if (d instanceof Date) return d;
    } catch {
      // ignore
    }
  }
  if (typeof value?.seconds === 'number') {
    const d = new Date(value.seconds * 1000);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function validatePublishRequiredFields(listingData: any): { ok: true } | { ok: false; missing: string[]; message: string } {
  const missing: string[] = [];

  const title = String(listingData?.title || '').trim();
  const description = String(listingData?.description || '').trim();
  const type = String(listingData?.type || '').trim();
  const category = String(listingData?.category || '').trim();
  const city = String(listingData?.location?.city || '').trim();
  const state = String(listingData?.location?.state || '').trim();

  if (!category) missing.push('category');
  if (!type) missing.push('type');
  if (!title) missing.push('title');
  if (!description) missing.push('description');
  if (!city) missing.push('location.city');
  if (!state) missing.push('location.state');

  const hasPhotos =
    (Array.isArray(listingData?.photoIds) && listingData.photoIds.length > 0) ||
    (Array.isArray(listingData?.photos) && listingData.photos.length > 0) ||
    (Array.isArray(listingData?.images) && listingData.images.length > 0);
  if (!hasPhotos) missing.push('photos');

  const price = typeof listingData?.price === 'number' ? listingData.price : Number(listingData?.price);
  const startingBid = typeof listingData?.startingBid === 'number' ? listingData.startingBid : Number(listingData?.startingBid);
  const durationDaysRaw = listingData?.durationDays;
  const durationDays = typeof durationDaysRaw === 'number' ? durationDaysRaw : Number(durationDaysRaw);
  const reservePrice =
    listingData?.reservePrice === undefined || listingData?.reservePrice === null
      ? null
      : typeof listingData.reservePrice === 'number'
        ? listingData.reservePrice
        : Number(listingData.reservePrice);

  if (type === 'fixed' || type === 'classified') {
    if (!Number.isFinite(price) || price <= 0) missing.push('price');
  }

  if (type === 'auction') {
    if (!Number.isFinite(startingBid) || startingBid <= 0) missing.push('startingBid');
    if (reservePrice !== null) {
      if (!Number.isFinite(reservePrice) || reservePrice <= 0) missing.push('reservePrice');
      if (Number.isFinite(reservePrice) && Number.isFinite(startingBid) && reservePrice < startingBid) {
        missing.push('reservePrice (must be >= startingBid)');
      }
    }
  }

  // Duration: default is applied server-side on publish if missing, but if provided it must be valid.
  if (durationDaysRaw !== undefined && durationDaysRaw !== null) {
    if (![1, 3, 5, 7, 10].includes(durationDays)) {
      missing.push('durationDays (invalid)');
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      message:
        'Listing is incomplete or has invalid values. Fix the highlighted fields and try again. ' +
        '(Drafts can be incomplete; publishing requires all required fields.)',
    };
  }
  return { ok: true };
}

async function computeWhitetailInternalFlags(db: Firestore, listingData: any): Promise<{
  internalFlags: { duplicatePermitNumber?: boolean; duplicateFacilityId?: boolean };
  internalFlagsNotes: { duplicatePermitNumber?: string; duplicateFacilityId?: string };
}> {
  const permit = listingData?.attributes?.tpwdBreederPermitNumber;
  const facility = listingData?.attributes?.breederFacilityId;
  const sellerId = listingData?.sellerId;

  const internalFlags: any = {};
  const internalFlagsNotes: any = {};

  // Duplicate permit number across multiple sellers
  if (permit && String(permit).trim().length > 0) {
    const snap = await db
      .collection('listings')
      .where('attributes.tpwdBreederPermitNumber', '==', String(permit).trim())
      .get();

    const sellerIds = new Set<string>();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data?.category === 'whitetail_breeder' && data?.sellerId) {
        sellerIds.add(String(data.sellerId));
      }
    });

    // Count distinct sellers using this permit
    if (sellerIds.size > 1 && !sellerIds.has(String(sellerId))) {
      // Defensive, but should not happen.
      sellerIds.add(String(sellerId));
    }

    const distinctSellers = sellerIds.size;
    if (distinctSellers > 1) {
      internalFlags.duplicatePermitNumber = true;
      internalFlagsNotes.duplicatePermitNumber = `Permit number appears on ${distinctSellers} sellers`;
    }
  }

  // Duplicate facility ID across multiple sellers
  if (facility && String(facility).trim().length > 0) {
    const snap = await db
      .collection('listings')
      .where('attributes.breederFacilityId', '==', String(facility).trim())
      .get();

    const sellerIds = new Set<string>();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data?.category === 'whitetail_breeder' && data?.sellerId) {
        sellerIds.add(String(data.sellerId));
      }
    });

    const distinctSellers = sellerIds.size;
    if (distinctSellers > 1) {
      internalFlags.duplicateFacilityId = true;
      internalFlagsNotes.duplicateFacilityId = `Facility ID appears on ${distinctSellers} sellers`;
    }
  }

  return { internalFlags, internalFlagsNotes };
}

export async function POST(request: Request) {
  try {
    // Lazily initialize Admin SDK inside the handler so we can return a structured error
    // (instead of a generic 500 caused by module-load failure) if production env vars are missing/misformatted.
    let auth: ReturnType<typeof getAdminAuth>;
    let db: Firestore;
    try {
      auth = getAdminAuth();
      db = getAdminDb() as unknown as Firestore;
    } catch (e: any) {
      logError('Firebase Admin init failed in /api/listings/publish', {
        code: e?.code,
        message: e?.message,
        missing: e?.missing,
        details: e?.details,
      });
      captureException(e);
      return json(
        {
          error: 'Server is not configured to publish listings yet',
          code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
          message: e?.message || 'Failed to initialize Firebase Admin SDK',
          missing: e?.missing || undefined,
          details: e?.details || undefined,
        },
        { status: 503 }
      );
    }

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    // Auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    const userId = decodedToken.uid;
    // Require verified email before allowing publish (reduces abuse + ensures reliable seller contact).
    if ((decodedToken as any)?.email_verified !== true) {
      return json(
        {
          error: 'Email verification required',
          message: 'Please verify your email address before publishing listings.',
          code: 'EMAIL_NOT_VERIFIED',
        },
        { status: 403 }
      );
    }

    // Admin moderation: disable selling (server-authoritative flag on users/{uid}).
    try {
      const userSnap = await db.collection('users').doc(userId).get();
      const userData = userSnap.exists ? (userSnap.data() as any) : null;
      if (userData?.adminFlags?.sellingDisabled === true) {
        return json(
          {
            error: 'Selling disabled',
            code: 'SELLING_DISABLED',
            message: 'Your selling privileges are currently disabled. Please contact support.',
          },
          { status: 403 }
        );
      }
    } catch {
      // If user doc read fails, fail open (do not block publishing).
    }

    // Validate request body
    const body = await request.json();
    const validation = validateRequest(publishListingSchema, body);
    if (!validation.success) {
      return json({ error: validation.error, details: validation.details?.errors }, { status: 400 });
    }

    const { listingId } = validation.data;

    // Get listing
    const listingRef = db.collection('listings').doc(listingId);
    const listingDoc = await listingRef.get();
    
    if (!listingDoc.exists) {
      return json({ error: 'Listing not found' }, { status: 404 });
    }

    const listingData = listingDoc.data()!;

    // Canonicalize category (fail closed if unknown/unsupported).
    let normalizedCategory: string;
    try {
      normalizedCategory = normalizeCategory((listingData as any)?.category);
    } catch (e: any) {
      return json(
        {
          error: 'Invalid listing category',
          code: 'INVALID_CATEGORY',
          message: e?.message || 'Invalid category value',
        },
        { status: 400 }
      );
    }

    // Verify ownership
    if (listingData.sellerId !== userId) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if listing is already active
    if (listingData.status === 'active') {
      // Idempotency: treat publish as a no-op if it's already active.
      // This prevents "autosave restored an old listingId" from hard-failing the seller flow.
      return json({ ok: true, alreadyActive: true }, { status: 200 });
    }

    // Defensive compliance validation (server-side)
    try {
      // Type switches can leave legacy fields on the doc (e.g. auction -> fixed leaving startingBid).
      // Validate against the fields that matter for the chosen type so publishing stays smooth.
      const pricingForType =
        listingData.type === 'auction'
          ? {
              price: undefined,
              startingBid: listingData.startingBid,
              reservePrice: listingData.reservePrice,
            }
          : {
              price: listingData.price,
              startingBid: undefined,
              reservePrice: undefined,
            };

      validateListingCompliance(
        normalizedCategory as any,
        listingData.attributes,
        listingData.location?.state,
        listingData.title,
        listingData.description,
        listingData.type,
        pricingForType
      );
    } catch (e: any) {
      return json({ error: 'Compliance validation failed', message: e?.message || String(e) }, { status: 400 });
    }

    // Core publish validation (business rules). Prevent publishing "free" listings (price=0) and other incomplete data.
    const required = validatePublishRequiredFields(listingData);
    if (!required.ok) {
      return json(
        {
          error: 'Listing validation failed',
          code: 'LISTING_VALIDATION_FAILED',
          message: required.message,
          missing: required.missing,
        },
        { status: 400 }
      );
    }

    // Whitetail seller attestation hard gate
    if (listingData.category === 'whitetail_breeder' && listingData.sellerAttestationAccepted !== true) {
      return json(
        {
          error: 'Seller attestation required',
          message:
            'Seller attestation is required for whitetail breeder listings. Please certify that permit information is accurate and permit is valid/current.',
        },
        { status: 400 }
      );
    }

    // Animal categories: require seller acknowledgment (server-authoritative).
    // NOTE: whitetail uses a stricter, category-specific attestation above.
    const req = getCategoryRequirements(normalizedCategory as any);
    if (req.isAnimal && normalizedCategory !== 'whitetail_breeder') {
      if (listingData.sellerAnimalAttestationAccepted !== true) {
        return json(
          {
            error: 'Seller acknowledgment required',
            code: 'SELLER_ANIMAL_ACK_REQUIRED',
            message:
              'Before publishing an animal listing, you must acknowledge that you are solely responsible for representations, permits, and compliance, and that Wildlife Exchange does not take custody of animals.',
          },
          { status: 400 }
        );
      }
    }

    // Get user (for seller tier snapshot)
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data()!;

    // Seller readiness gates (publish is the "go live" moment).
    const fullNameOk = !!userData?.profile?.fullName && String(userData.profile.fullName).trim().length > 0;
    const phoneOk = !!userData?.phoneNumber && String(userData.phoneNumber).trim().length > 0;
    const loc = userData?.profile?.location;
    const locationOk = !!loc && !!loc.city && !!loc.state && !!loc.zip;
    if (!fullNameOk || !phoneOk || !locationOk) {
      return json(
        {
          error: 'Seller profile incomplete',
          code: 'SELLER_PROFILE_INCOMPLETE',
          message: 'Please complete your profile (name, phone, and location) before publishing listings.',
        },
        { status: 400 }
      );
    }

    const payoutsReady =
      userData?.stripeOnboardingStatus === 'complete' &&
      userData?.payoutsEnabled === true &&
      userData?.chargesEnabled === true &&
      !!userData?.stripeAccountId;

    if (!payoutsReady) {
      return json(
        {
          error: 'Payouts setup required',
          code: 'PAYOUTS_NOT_READY',
          message: 'Please connect Stripe payouts before publishing listings so you can get paid.',
        },
        { status: 400 }
      );
    }

    // Snapshot seller tier onto listing for public badge + deterministic ranking (without reading users).
    const sellerTier = getEffectiveSubscriptionTier(userData as any);
    const sellerTierWeight = getTierWeight(sellerTier);

    // Phase 3A (A4): Public trust snapshot (anon-safe).
    // Copy seller trust signals into the listing doc at publish time so listing cards/details
    // can show trust without requiring a /users/{uid} read (which is auth-gated in firestore.rules).
    const completedSalesCount = Number(userData?.completedSalesCount || 0) || 0;
    const identityVerified = userData?.seller?.credentials?.identityVerified === true;
    const sellerVerified = userData?.seller?.verified === true || identityVerified;
    const displayName =
      (listingData?.sellerSnapshot?.displayName && String(listingData.sellerSnapshot.displayName)) ||
      (userData?.displayName && String(userData.displayName)) ||
      (userData?.profile?.fullName && String(userData.profile.fullName)) ||
      'Seller';

    const sellerBadges: string[] = [];
    if ((decodedToken as any)?.email_verified === true) sellerBadges.push('Email verified');
    if (identityVerified) sellerBadges.push('Identity verified');
    if (userData?.payoutsEnabled === true) sellerBadges.push('Payouts enabled');
    if (userData?.profile?.location?.state === 'TX') sellerBadges.push('Texas-based');
    if (listingData?.category === 'whitetail_breeder' && listingData?.attributes?.tpwdBreederPermitNumber) {
      sellerBadges.push('TPWD permit provided');
    }

    // Seller-level compliance badge: TPWD breeder permit verified (public trust doc).
    // This is a stronger signal than "permit provided" and should show on listing cards once approved.
    try {
      const trustSnap = await db.collection('publicSellerTrust').doc(userId).get();
      const badgeIds: string[] = trustSnap.exists ? ((trustSnap.data() as any)?.badgeIds || []) : [];
      if (Array.isArray(badgeIds) && badgeIds.includes('tpwd_breeder_permit_verified')) {
        sellerBadges.push('TPWD breeder permit');
      }
    } catch {
      // ignore; listing publish should not fail if trust doc can't be read
    }

    const photoURL =
      typeof userData?.photoURL === 'string' && userData.photoURL.trim().length > 0 ? String(userData.photoURL) : undefined;

    const publicSellerSnapshot = {
      displayName,
      verified: sellerVerified,
      ...(photoURL ? { photoURL } : {}),
      completedSalesCount,
      badges: sellerBadges,
    };

    // Approval gating:
    // - Whitetail breeder: always requires compliance review + admin approval
    // - New/unverified sellers: require admin approval before going live
    // - Some categories/attributes require compliance review
    const complianceStatus = listingData.complianceStatus || 'none';
    if (complianceStatus === 'rejected') {
      return json(
        { error: 'Listing rejected', message: 'This listing was rejected during compliance review. Please address issues and resubmit.' },
        { status: 400 }
      );
    }

    // Default rule: if seller isn't verified yet, send to admin approval queue.
    // (This matches the expected "new seller listings go to admin first" behavior.)
    const requiresAdminApproval = sellerVerified !== true;

    const needsReview =
      requiresAdminApproval ||
      complianceStatus === 'pending_review' ||
      normalizedCategory === 'whitetail_breeder';

    // Admin-only guardrails (flags only): compute on submission/publish for whitetail
    const flagUpdate: any = {};
    if (normalizedCategory === 'whitetail_breeder') {
      const { internalFlags, internalFlagsNotes } = await computeWhitetailInternalFlags(db, listingData);
      flagUpdate.internalFlags = internalFlags;
      flagUpdate.internalFlagsNotes = internalFlagsNotes;
    }

    if (needsReview) {
      const durationDays = coerceDurationDays((listingData as any)?.durationDays, 7);
      await listingRef.update({
        category: normalizedCategory,
        status: 'pending',
        durationDays,
        updatedAt: Timestamp.now(),
        updatedBy: userId,
        sellerTierSnapshot: sellerTier,
        sellerTierWeightSnapshot: sellerTierWeight,
        sellerSnapshot: publicSellerSnapshot,
        ...flagUpdate,
      });

      // Admin notifications (email + in-app) for review queues.
      // Non-blocking: listing submission should not fail if notifications fail.
      try {
        const origin = 'https://wildlife.exchange';
        const adminUids = await listAdminRecipientUids(db as any);
        if (adminUids.length > 0) {
          const pendingReason: 'admin_approval' | 'compliance_review' | 'unknown' = requiresAdminApproval
            ? 'admin_approval'
            : complianceStatus === 'pending_review' || listingData.category === 'whitetail_breeder'
              ? 'compliance_review'
              : 'unknown';

          const listingUrl = `${origin}/listing/${listingId}`;
          const adminQueueUrl = `${origin}/dashboard/admin/listings`;
          const adminComplianceUrl = `${origin}/dashboard/admin/compliance`;

          await emitEventToUsers({
            type: 'Admin.Listing.Submitted',
            actorId: userId,
            entityType: 'listing',
            entityId: listingId,
            targetUserIds: adminUids,
            payload: {
              type: 'Admin.Listing.Submitted',
              listingId,
              listingTitle: String(listingData?.title || 'Listing'),
              sellerId: userId,
              sellerName: displayName,
              category: String(normalizedCategory || ''),
              listingType: String(listingData.type || ''),
              complianceStatus: String(complianceStatus || 'none'),
              pendingReason,
              listingUrl,
              adminQueueUrl,
              ...(pendingReason === 'compliance_review' ? { adminComplianceUrl } : {}),
            },
          });

          if (pendingReason === 'admin_approval') {
            await emitEventToUsers({
              type: 'Admin.Listing.AdminApprovalRequired',
              actorId: userId,
              entityType: 'listing',
              entityId: listingId,
              targetUserIds: adminUids,
              payload: {
                type: 'Admin.Listing.AdminApprovalRequired',
                listingId,
              listingTitle: String(listingData?.title || 'Listing'),
                sellerId: userId,
                sellerName: displayName,
                listingUrl,
                adminQueueUrl,
              },
              // Collapse multiple emails for rapid resubmits
              optionalHash: `admin_listing_admin_approval:${listingId}`,
            });
          }

          if (pendingReason === 'compliance_review') {
            await emitEventToUsers({
              type: 'Admin.Listing.ComplianceReviewRequired',
              actorId: userId,
              entityType: 'listing',
              entityId: listingId,
              targetUserIds: adminUids,
              payload: {
                type: 'Admin.Listing.ComplianceReviewRequired',
                listingId,
              listingTitle: String(listingData?.title || 'Listing'),
                sellerId: userId,
                sellerName: displayName,
                complianceStatus: String(complianceStatus || 'pending_review'),
                listingUrl,
                adminComplianceUrl,
              },
              optionalHash: `admin_listing_compliance:${listingId}`,
            });
          }
        }
      } catch (e: any) {
        logError('Admin notification emit failed (listing submission)', e, {
          route: '/api/listings/publish',
          listingId,
          userId,
        });
      }

      return json({
        success: true,
        listingId,
        status: 'pending',
        pendingReview: true,
        pendingReason: requiresAdminApproval ? 'admin_approval' : 'compliance_review',
      });
    }

    // Publish listing (non-review categories)
    const now = Timestamp.now();
    const durationDays = coerceDurationDays((listingData as any)?.durationDays, 7);
    // startAt/endAt are only set when the listing becomes ACTIVE (not pending review).
    const startAt = now;
    const endAtMs = computeEndAt(startAt.toMillis(), durationDays);
    const endAt = Timestamp.fromMillis(endAtMs);

    // Safety: hard cap at 10 days even if caller tries to sneak something else in.
    if (!isValidDurationDays(durationDays)) {
      return json(
        { error: 'Invalid duration', code: 'INVALID_DURATION', message: 'Listing duration must be 1, 3, 5, 7, or 10 days.' },
        { status: 400 }
      );
    }

    await listingRef.update({
      category: normalizedCategory,
      status: 'active',
      publishedAt: now,
      startAt,
      endAt,
      durationDays,
      // Back-compat: auctions still use endsAt for countdown/bidding gates.
      ...(String((listingData as any)?.type || '') === 'auction' ? { endsAt: endAt } : {}),
      updatedAt: now,
      updatedBy: userId,
      sellerTierSnapshot: sellerTier,
      sellerTierWeightSnapshot: sellerTierWeight,
      sellerSnapshot: publicSellerSnapshot,
      ...flagUpdate,
    });

    logInfo('Listing published', {
      route: '/api/listings/publish',
      listingId,
      userId,
      sellerTier,
    });

    return json({
      success: true,
      listingId,
      status: 'active',
    });
  } catch (error: any) {
    logError('Error publishing listing', error, {
      route: '/api/listings/publish',
    });
    captureException(error instanceof Error ? error : new Error(String(error)), {
      route: '/api/listings/publish',
    });
    return json({ error: 'Failed to publish listing', message: error.message }, { status: 500 });
  }
}
