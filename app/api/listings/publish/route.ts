/**
 * POST /api/listings/publish
 * 
 * Server-side listing publish (Exposure Plans model: NO listing limits)
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

    // Verify ownership
    if (listingData.sellerId !== userId) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if listing is already active
    if (listingData.status === 'active') {
      return json({ error: 'Listing is already active' }, { status: 400 });
    }

    // Defensive compliance validation (server-side)
    try {
      validateListingCompliance(
        listingData.category,
        listingData.attributes,
        listingData.location?.state,
        listingData.title,
        listingData.description,
        listingData.type,
        {
          price: listingData.price,
          startingBid: listingData.startingBid,
          reservePrice: listingData.reservePrice,
        }
      );
    } catch (e: any) {
      return json({ error: 'Compliance validation failed', message: e?.message || String(e) }, { status: 400 });
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

    const publicSellerSnapshot = {
      displayName,
      verified: sellerVerified,
      completedSalesCount,
      badges: sellerBadges,
    };

    // Compliance review gating:
    // - Whitetail breeder: always pending review (status='pending')
    // - Other categories: can go active
    const complianceStatus = listingData.complianceStatus || 'none';
    if (complianceStatus === 'rejected') {
      return json(
        { error: 'Listing rejected', message: 'This listing was rejected during compliance review. Please address issues and resubmit.' },
        { status: 400 }
      );
    }

    const needsReview = complianceStatus === 'pending_review' || listingData.category === 'whitetail_breeder';

    // Admin-only guardrails (flags only): compute on submission/publish for whitetail
    const flagUpdate: any = {};
    if (listingData.category === 'whitetail_breeder') {
      const { internalFlags, internalFlagsNotes } = await computeWhitetailInternalFlags(db, listingData);
      flagUpdate.internalFlags = internalFlags;
      flagUpdate.internalFlagsNotes = internalFlagsNotes;
    }

    if (needsReview) {
      await listingRef.update({
        status: 'pending',
        updatedAt: Timestamp.now(),
        updatedBy: userId,
        sellerTierSnapshot: sellerTier,
        sellerTierWeightSnapshot: sellerTierWeight,
        sellerSnapshot: publicSellerSnapshot,
        ...flagUpdate,
      });

      return json({
        success: true,
        listingId,
        status: 'pending',
        pendingReview: true,
      });
    }

    // Publish listing (non-review categories)
    await listingRef.update({
      status: 'active',
      publishedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
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
