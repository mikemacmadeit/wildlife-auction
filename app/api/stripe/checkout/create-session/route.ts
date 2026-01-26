/**
 * POST /api/stripe/checkout/create-session
 * 
 * Creates a Stripe Checkout session for purchasing a listing
 * Uses destination charges with application fee (marketplace model)
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import Stripe from 'stripe';
import { stripe, calculatePlatformFee, getAppUrl, isStripeConfigured } from '@/lib/stripe/config';
import { getEffectiveSubscriptionTier, getTierWeight } from '@/lib/pricing/subscriptions';
import { MARKETPLACE_FEE_PERCENT } from '@/lib/pricing/plans';
import { validateRequest, createCheckoutSessionSchema } from '@/lib/validation/api-schemas';
import { checkRateLimitByKey, rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit/logger';
import { logInfo, logWarn } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { containsProhibitedKeywords } from '@/lib/compliance/validation';
import { ACH_DEBIT_MIN_TOTAL_USD } from '@/lib/payments/constants';
import { finalizeAuctionIfNeeded } from '@/lib/auctions/finalizeAuction';
import { normalizeCategory } from '@/lib/listings/normalizeCategory';
import { getCategoryRequirements, isTexasOnlyCategory } from '@/lib/compliance/requirements';
import { ensureBillOfSaleForOrder } from '@/lib/orders/billOfSale';
import { recomputeOrderComplianceDocsStatus } from '@/lib/orders/complianceDocsStatus';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';
import { coerceDurationDays, computeEndAt, toMillisSafe } from '@/lib/listings/duration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: any, init?: { status?: number; headers?: Record<string, string> | Headers }) {
  const headers =
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init?.headers as Record<string, string> | undefined);

  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(headers || {}),
    },
  });
}

// Small shim so we don't have to rewrite every `NextResponse.json(...)` call in this file.
const NextResponse = { json };

export async function POST(request: Request) {
  try {
    // Lazily initialize Admin SDK inside the handler so we can return a structured error instead of crashing at import-time.
    // (Netlify functions frequently fail if Admin creds are missing/malformed at module load.)
    let auth: ReturnType<typeof getAdminAuth>;
    let db: ReturnType<typeof getAdminDb>;
    try {
      auth = getAdminAuth();
      db = getAdminDb();
    } catch (e: any) {
      logWarn('Firebase Admin init failed in /api/stripe/checkout/create-session', {
        code: e?.code,
        message: e?.message,
        missing: e?.missing,
        details: e?.details,
      });
      return NextResponse.json(
        {
          error: 'Server is not configured for checkout yet',
          code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
          message: e?.message || 'Failed to initialize Firebase Admin SDK',
          missing: e?.missing || undefined,
        },
        { status: 503 }
      );
    }

    // Check if Stripe is configured
    if (!isStripeConfigured() || !stripe) {
      return NextResponse.json(
        { error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.' },
        { status: 503 }
      );
    }

    // OPTIONAL (default OFF): platform-wide checkout freeze for emergency operations.
    // This blocks creation of new Checkout Sessions but does not alter existing orders or payout flows.
    if (process.env.GLOBAL_CHECKOUT_FREEZE_ENABLED === 'true') {
      return NextResponse.json(
        {
          error: 'Checkout is temporarily paused by platform operations.',
          code: 'GLOBAL_CHECKOUT_FREEZE',
          message: 'Checkout is temporarily paused by platform operations.',
        },
        { status: 403 }
      );
    }

    // Get Firebase Auth token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid token' },
        { status: 401 }
      );
    }

    const buyerId = decodedToken.uid;

    // Verified email required before checkout (reduces fraud + ensures receipt delivery / supportability).
    // IMPORTANT: do not rely solely on ID token claims here; they can be stale until the client refreshes.
    const buyerRecord = await auth.getUser(buyerId).catch(() => null as any);
    if (buyerRecord?.emailVerified !== true) {
      return NextResponse.json(
        {
          error: 'Email verification required',
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please verify your email address before checking out.',
        },
        { status: 403 }
      );
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate request body
    const validation = validateRequest(createCheckoutSessionSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error, details: validation.details?.errors },
        { status: 400 }
      );
    }

    const { listingId, offerId, quantity: quantityRaw, paymentMethod: paymentMethodRaw, buyerAcksAnimalRisk } = validation.data as any;
    // Back-compat: clients may still send "ach" (older UI); normalize to "ach_debit".
    const normalizedPaymentMethod =
      paymentMethodRaw === 'ach' ? 'ach_debit' : (paymentMethodRaw || 'card');
    const paymentMethod = normalizedPaymentMethod as 'card' | 'ach_debit';
    const requestedQuantity =
      typeof quantityRaw === 'number' && Number.isFinite(quantityRaw) ? Math.max(1, Math.floor(quantityRaw)) : 1;

    // Rate limiting (post-auth, keyed per user+listing) to prevent shared-IP false positives.
    // This avoids scenarios where a legitimate first checkout attempt gets blocked by other users behind the same IP.
    const rlKey = `checkout:user:${buyerId}:listing:${String(listingId || 'unknown')}`;
    const rl = await checkRateLimitByKey(rlKey, RATE_LIMITS.checkout);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: rl.error || 'Too many requests. Please try again later.', retryAfter: rl.retryAfter },
        { status: rl.status ?? 429, headers: { 'Retry-After': String(rl.retryAfter) } }
      );
    }

    // IDEMPOTENCY: Check for existing checkout session within 1-minute window
    // Prevents duplicate sessions from double-clicks/refreshes
    const idempotencyWindow = Math.floor(Date.now() / 60000); // 1-minute window
    const idempotencyKey = `checkout_session:${listingId}:${buyerId}:${idempotencyWindow}`;
    const idempotencyRef = db.collection('checkoutSessions').doc(idempotencyKey);
    let existingSessionDoc;
    try {
      existingSessionDoc = await idempotencyRef.get();
    } catch (idempError: any) {
      // Non-blocking: if idempotency check fails, continue (will use Stripe idempotency key)
      existingSessionDoc = { exists: false } as any;
    }
    
    if (existingSessionDoc.exists) {
      const existingData = existingSessionDoc.data() as any;
      const existingSessionId = existingData.stripeSessionId;
      const createdAt = existingData.createdAt?.toMillis ? existingData.createdAt.toMillis() : 0;
      const windowAge = Date.now() - createdAt;
      
      // Only reuse if within 1-minute window (60 seconds)
      if (existingSessionId && windowAge < 60000) {
        try {
          const existingSession = await stripe.checkout.sessions.retrieve(existingSessionId);
          if (existingSession && existingSession.status !== 'expired') {
            logInfo('Returning existing checkout session (idempotent)', {
              route: '/api/stripe/checkout/create-session',
              listingId,
              buyerId,
              sessionId: existingSessionId,
              windowAge,
            });
            return NextResponse.json({
              sessionId: existingSession.id,
              url: existingSession.url,
              message: 'Checkout session already exists',
            });
          }
        } catch (stripeError: any) {
          // If session doesn't exist in Stripe, continue to create new one
          logWarn('Existing session ID not found in Stripe, creating new session', {
            route: '/api/stripe/checkout/create-session',
            listingId,
            buyerId,
            existingSessionId,
            error: stripeError?.message,
          });
        }
      }
    }

    // Get listing from Firestore using Admin SDK
    const listingRef = db.collection('listings').doc(listingId);
    const listingDoc = await listingRef.get();
    
    if (!listingDoc.exists) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const listingData = listingDoc.data()!;

    // Classified listings are deprecated (no direct checkout).
    if (String((listingData as any)?.type || '') === 'classified') {
      return NextResponse.json(
        { error: 'This listing type is no longer supported for checkout', code: 'CLASSIFIED_DISABLED' },
        { status: 400 }
      );
    }

    // Listing duration guard (server authoritative):
    // For non-auction listings, checkout is only allowed while the listing is still active (endAt > now).
    // For auctions, checkout can be allowed after the auction ends (winner flow), so we do NOT block
    // purely on endAt here. Auction eligibility is handled later with explicit status checks.
    if (String((listingData as any)?.type || '') !== 'auction') {
      const nowMs = Date.now();
      const endMsDirect = toMillisSafe((listingData as any)?.endAt) ?? toMillisSafe((listingData as any)?.endsAt);
      const startMs =
        toMillisSafe((listingData as any)?.startAt) ??
        toMillisSafe((listingData as any)?.publishedAt) ??
        toMillisSafe((listingData as any)?.createdAt);
      const durationDays = coerceDurationDays((listingData as any)?.durationDays, 7);
      const endMs = endMsDirect ?? (typeof startMs === 'number' ? computeEndAt(startMs, durationDays) : null);
      if ((listingData as any)?.status !== 'active') {
        return NextResponse.json({ error: 'Listing is not available for purchase' }, { status: 409 });
      }
      if (typeof endMs === 'number' && endMs <= nowMs) {
        return NextResponse.json(
          { error: 'Listing has ended', code: 'LISTING_ENDED', message: 'This listing has ended.' },
          { status: 409 }
        );
      }
    }

    // Canonicalize category (fail closed if unknown/unsupported).
    let listingCategory: string;
    try {
      listingCategory = normalizeCategory((listingData as any)?.category);
    } catch (e: any) {
      return NextResponse.json(
        { error: 'Invalid listing category', code: 'INVALID_CATEGORY', message: e?.message || 'Invalid category value' },
        { status: 400 }
      );
    }
    const categoryReq = getCategoryRequirements(listingCategory as any);

    // Animal categories require an explicit buyer acknowledgment (server-authoritative).
    if (categoryReq.isAnimal) {
      if (buyerAcksAnimalRisk !== true) {
        return NextResponse.json(
          {
            error: 'Buyer acknowledgment required',
            code: 'BUYER_ACK_REQUIRED',
            message:
              'Before purchasing an animal listing, you must acknowledge live-animal risk, seller-only representations, and that the platform does not take custody.',
          },
          { status: 400 }
        );
      }
    }

    // If a checkout reservation is still active, block additional checkouts to avoid double-selling.
    // IMPORTANT: a stale `purchaseReservedByOrderId` must NOT block indefinitely; only treat as reserved if `purchaseReservedUntil > now`.
    const reservedUntilMs =
      typeof (listingData as any)?.purchaseReservedUntil?.toMillis === 'function' ? (listingData as any).purchaseReservedUntil.toMillis() : null;
    const hasReservationId = Boolean((listingData as any)?.purchaseReservedByOrderId);
    if (hasReservationId && reservedUntilMs && reservedUntilMs > Date.now()) {
      return NextResponse.json(
        { error: 'Listing is reserved pending payment confirmation. Please try again later.' },
        { status: 409 }
      );
    }

    // Best Offer checkout path (accepted offer -> checkout at agreed price)
    let offerData: any = null;
    let offerRef: any = null;
    if (offerId) {
      offerRef = db.collection('offers').doc(String(offerId));
      const offerSnap = await offerRef.get();
      if (!offerSnap.exists) {
        return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
      }
      offerData = offerSnap.data();

      if (offerData?.listingId !== listingId) {
        return NextResponse.json({ error: 'Offer does not match listing' }, { status: 400 });
      }
      if (offerData?.buyerId !== buyerId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (offerData?.status !== 'accepted') {
        return NextResponse.json({ error: 'Offer is not accepted' }, { status: 400 });
      }
      if (listingData?.offerReservedByOfferId && listingData.offerReservedByOfferId !== String(offerId)) {
        return NextResponse.json({ error: 'Listing is reserved by another offer' }, { status: 409 });
      }
      if (!listingData?.offerReservedByOfferId) {
        return NextResponse.json({ error: 'Listing is not reserved for this offer' }, { status: 409 });
      }
      if (listingData?.sellerId !== offerData?.sellerId) {
        return NextResponse.json({ error: 'Offer seller mismatch' }, { status: 400 });
      }
      // If we already created a session for this offer, reuse it (prevent double checkout sessions)
      const existingSessionId = offerData?.checkoutSessionId;
      if (existingSessionId && typeof existingSessionId === 'string' && !existingSessionId.startsWith('creating:')) {
        const existing = await stripe.checkout.sessions.retrieve(existingSessionId);
        return NextResponse.json({
          sessionId: existing.id,
          url: existing.url,
          message: 'Checkout session already exists for this offer',
        });
      }
      if (existingSessionId && typeof existingSessionId === 'string' && existingSessionId.startsWith('creating:')) {
        return NextResponse.json({ error: 'Checkout session is being created. Please retry.' }, { status: 409 });
      }
    }

    // Validate listing is available for purchase.
    // Fixed/Classified require status=active.
    // Auctions may become status=expired after backend finalization.
    if (listingData.type !== 'auction') {
      if (listingData.status !== 'active') {
        return NextResponse.json({ error: 'Listing is not available for purchase' }, { status: 400 });
      }
    } else {
      if (listingData.status !== 'active' && listingData.status !== 'expired') {
        return NextResponse.json({ error: 'Auction is not available for purchase' }, { status: 400 });
      }
    }

    // If listing is reserved by an accepted offer, block regular checkout
    if (!offerId && listingData.offerReservedByOfferId) {
      return NextResponse.json(
        { error: 'Listing is reserved by an accepted offer' },
        { status: 409 }
      );
    }

    // Validate listing type and get purchase amount (UNIT price; total may be multiplied by quantity for fixed listings)
    let purchaseAmount: number;
    let auctionResultSnapshot: any | null = null;
    
    if (offerId) {
      // Accepted offer dictates the price (server authoritative)
      if (listingData.type !== 'fixed' && listingData.type !== 'classified') {
        return NextResponse.json({ error: 'Offer checkout is only supported for fixed/classified listings' }, { status: 400 });
      }
      const accepted = Number(offerData?.acceptedAmount ?? offerData?.currentAmount);
      if (!Number.isFinite(accepted) || accepted <= 0) {
        return NextResponse.json({ error: 'Offer has an invalid accepted amount' }, { status: 400 });
      }
      purchaseAmount = accepted;
    } else if (listingData.type === 'fixed') {
      // Fixed price listing - use listing price
      if (!listingData.price || listingData.price <= 0) {
        return NextResponse.json(
          { error: 'Listing does not have a valid price' },
          { status: 400 }
        );
      }
      purchaseAmount = listingData.price;
    } else if (listingData.type === 'auction') {
      // Auction listing - winner MUST be verified via AuctionResult (not bids query).
      // If missing (cron delayed), finalize inline (idempotent).
      const finalize = await finalizeAuctionIfNeeded({
        db: db as any,
        listingId,
        requestId: request.headers.get('x-request-id') || undefined,
      });
      if (!finalize.ok) {
        return NextResponse.json(
          {
            error: 'Auction could not be finalized for checkout',
            code: finalize.code,
            message: finalize.message,
          },
          { status: 409 }
        );
      }

      auctionResultSnapshot = finalize.auctionResult as any;

      const status = String(auctionResultSnapshot.status || '');
      const winnerBidderId = auctionResultSnapshot.winnerBidderId ? String(auctionResultSnapshot.winnerBidderId) : null;
      const finalPriceCents = typeof auctionResultSnapshot.finalPriceCents === 'number' ? auctionResultSnapshot.finalPriceCents : null;
      const paymentDueAtMs =
        typeof auctionResultSnapshot.paymentDueAt?.toMillis === 'function' ? auctionResultSnapshot.paymentDueAt.toMillis() : null;

      if (status !== 'ended_winner_pending_payment') {
        const msg =
          status === 'ended_no_bids'
            ? 'This auction ended with no bids.'
            : status === 'ended_reserve_not_met'
              ? 'This auction ended without meeting reserve.'
              : status === 'ended_unpaid_expired' || status === 'ended_relisted'
                ? 'The payment window for this auction has expired.'
                : 'This auction is not available for checkout.';
        return NextResponse.json({ error: msg, code: 'AUCTION_NOT_PAYABLE', status }, { status: 400 });
      }

      if (!winnerBidderId || winnerBidderId !== buyerId) {
        return NextResponse.json({ error: 'You are not the winning bidder', code: 'NOT_AUCTION_WINNER' }, { status: 403 });
      }

      if (!finalPriceCents || finalPriceCents <= 0) {
        return NextResponse.json({ error: 'Auction final price is invalid', code: 'INVALID_FINAL_PRICE' }, { status: 400 });
      }

      if (typeof paymentDueAtMs === 'number' && Number.isFinite(paymentDueAtMs) && paymentDueAtMs <= Date.now()) {
        return NextResponse.json({ error: 'Payment window expired for this auction', code: 'PAYMENT_WINDOW_EXPIRED' }, { status: 409 });
      }

      purchaseAmount = finalPriceCents / 100;
    } else {
      return NextResponse.json(
        { error: 'This listing type does not support checkout' },
        { status: 400 }
      );
    }

    // Multi-quantity support:
    // - For offers: use offer.quantity (if present, otherwise default to 1)
    // - For fixed listings without offers: use requestedQuantity
    // - For auctions: always 1
    const offerQuantity = offerData && typeof offerData.quantity === 'number' && offerData.quantity >= 1 ? Math.floor(offerData.quantity) : 1;
    const isMultiQuantityEligible = listingData.type === 'fixed' && !offerId;
    const attrsQty = Number((listingData as any)?.attributes?.quantity ?? 1) || 1;
    const quantityTotal =
      typeof (listingData as any)?.quantityTotal === 'number' && Number.isFinite((listingData as any).quantityTotal)
        ? Math.max(1, Math.floor((listingData as any).quantityTotal))
        : Math.max(1, Math.floor(attrsQty));
    const quantityRequested = offerId ? offerQuantity : (isMultiQuantityEligible ? Math.min(requestedQuantity, 100) : 1);

    if (!isMultiQuantityEligible && requestedQuantity !== 1) {
      return NextResponse.json({ error: 'Quantity is only supported for Buy Now listings', code: 'QUANTITY_NOT_SUPPORTED' }, { status: 400 });
    }

    // Total amount is per-unit price * quantity.
    const purchaseTotalAmount = purchaseAmount * quantityRequested;

    // Prevent buying own listing
    if (listingData.sellerId === buyerId) {
      return NextResponse.json(
        { error: 'You cannot purchase your own listing' },
        { status: 400 }
      );
    }

    // P0: Texas-only enforcement for animal listings
    if (categoryReq.texasOnly) {
      // Verify listing is in Texas
      if (listingData.location?.state !== 'TX') {
        return NextResponse.json(
          { error: 'Animal listings must be located in Texas.' },
          { status: 400 }
        );
      }

      // Get buyer profile to check state
      const buyerRef = db.collection('users').doc(buyerId);
      const buyerDoc = await buyerRef.get();
      
      if (!buyerDoc.exists) {
        return NextResponse.json(
          { error: 'Buyer profile not found. Please complete your profile.' },
          { status: 400 }
        );
      }

      const buyerData = buyerDoc.data()!;
      const buyerState = buyerData.profile?.location?.state;
      
      if (!buyerState || buyerState !== 'TX') {
        return NextResponse.json(
          { 
            error: 'Only Texas residents can purchase animal listings. Please update your profile location to Texas.',
            code: 'TEXAS_ONLY_REQUIRED'
          },
          { status: 400 }
        );
      }

      // Defensive: Re-check prohibited content
      if (containsProhibitedKeywords(listingData.title) || containsProhibitedKeywords(listingData.description)) {
        return NextResponse.json(
          { error: 'Listing contains prohibited content and cannot be purchased.' },
          { status: 400 }
        );
      }
    }

    // Get seller's Stripe account info using Admin SDK
    const sellerRef = db.collection('users').doc(listingData.sellerId);
    const sellerDoc = await sellerRef.get();
    
    if (!sellerDoc.exists) {
      return NextResponse.json(
        { error: 'Seller not found' },
        { status: 404 }
      );
    }

    const sellerData = sellerDoc.data()!;
    const sellerStripeAccountId = sellerData.stripeAccountId;
    let sellerChargesEnabled = sellerData.chargesEnabled ?? false;
    let sellerPayoutsEnabled = sellerData.payoutsEnabled ?? false;
    let sellerDetailsSubmitted = sellerData.stripeDetailsSubmitted ?? false;
    let sellerOnboardingStatus = sellerData.stripeOnboardingStatus || 'not_started';
    
    const sellerTier = getEffectiveSubscriptionTier(sellerData as any);
    const sellerTierWeight = getTierWeight(sellerTier);

    // Check for admin override flag (optional, defaults to block)
    const allowUnreadySeller = request.headers.get('x-allow-unready-seller') === 'true';
    
    // Validate seller payout readiness (unless admin override)
    let isPayoutReady =
      !!sellerStripeAccountId &&
      !!sellerChargesEnabled &&
      !!sellerPayoutsEnabled &&
      !!sellerDetailsSubmitted &&
      sellerOnboardingStatus === 'complete';

    // If seller has a Stripe account but the cached flags say "not ready",
    // refresh from Stripe once. This fixes real-world cases where the user completed onboarding
    // but our stored `chargesEnabled/payoutsEnabled/stripeOnboardingStatus` is stale.
    if (!isPayoutReady && sellerStripeAccountId && !allowUnreadySeller) {
      try {
        const acct = await stripe.accounts.retrieve(String(sellerStripeAccountId));
        // Prefer capabilities for Connect accounts; fall back to legacy booleans.
        const nextChargesEnabled =
          (acct as any)?.capabilities?.card_payments === 'active' || !!(acct as any)?.charges_enabled;
        const nextPayoutsEnabled =
          (acct as any)?.capabilities?.transfers === 'active' || !!(acct as any)?.payouts_enabled;
        const nextDetailsSubmitted = !!(acct as any)?.details_submitted;
        const nextOnboardingStatus =
          nextDetailsSubmitted && nextChargesEnabled && nextPayoutsEnabled ? 'complete' : nextDetailsSubmitted ? 'details_submitted' : 'pending';

        // Persist refreshed state (best-effort)
        await sellerRef.update({
          chargesEnabled: nextChargesEnabled,
          payoutsEnabled: nextPayoutsEnabled,
          stripeDetailsSubmitted: nextDetailsSubmitted,
          stripeOnboardingStatus: nextOnboardingStatus,
          updatedAt: Timestamp.now(),
          updatedBy: 'system',
        });

        sellerChargesEnabled = nextChargesEnabled;
        sellerPayoutsEnabled = nextPayoutsEnabled;
        sellerDetailsSubmitted = nextDetailsSubmitted;
        sellerOnboardingStatus = nextOnboardingStatus;

        isPayoutReady =
          !!sellerStripeAccountId &&
          nextChargesEnabled &&
          nextPayoutsEnabled &&
          nextDetailsSubmitted &&
          nextOnboardingStatus === 'complete';
      } catch (e: any) {
        // If Stripe is misconfigured (invalid/revoked key) we will fall back to cached flags.
        logWarn('Failed to refresh seller Stripe status; using cached flags', {
          sellerId: listingData.sellerId,
          sellerStripeAccountId,
          code: e?.code,
          type: e?.type,
          message: e?.message,
        });
      }
    }

    if (!isPayoutReady && !allowUnreadySeller) {
      // Log audit event for blocked checkout
      const requestId = request.headers.get('x-request-id') || `checkout_${Date.now()}`;
      await createAuditLog(db, {
        actorUid: buyerId,
        actorRole: 'buyer',
        actionType: 'order_created',
        listingId: listingId,
        beforeState: {},
        afterState: {},
        metadata: {
          blocked: true,
          reason: 'seller_not_payout_ready',
          sellerId: listingData.sellerId,
          sellerStripeAccountId: sellerStripeAccountId || null,
          sellerChargesEnabled,
          sellerPayoutsEnabled,
          sellerDetailsSubmitted,
          sellerOnboardingStatus,
        },
        source: 'api',
      });

      logWarn('Checkout blocked: seller not payout ready', {
        requestId,
        route: '/api/stripe/checkout/create-session',
        buyerId,
        sellerId: listingData.sellerId,
        listingId,
        sellerStripeAccountId: sellerStripeAccountId || null,
        sellerChargesEnabled,
        sellerPayoutsEnabled,
        sellerDetailsSubmitted,
        sellerOnboardingStatus,
      });

      return NextResponse.json(
        { 
          error: 'Seller is not ready to receive payouts yet. Please contact seller or try later.',
          code: 'SELLER_NOT_PAYOUT_READY',
          details: {
            hasAccount: !!sellerStripeAccountId,
            chargesEnabled: sellerChargesEnabled,
            payoutsEnabled: sellerPayoutsEnabled,
            detailsSubmitted: sellerDetailsSubmitted,
            onboardingStatus: sellerOnboardingStatus,
          }
        },
        { status: 400 }
      );
    }

    // Legacy validation (keep for backward compatibility, but should be covered by isPayoutReady check above)
    if (!sellerStripeAccountId) {
      return NextResponse.json(
        { error: 'Seller has not set up payment processing. Please contact the seller.' },
        { status: 400 }
      );
    }

    // Calculate fees (flat fee for all sellers/categories; never trust client)
    const feePercent = MARKETPLACE_FEE_PERCENT;
    const amount = Math.round(purchaseTotalAmount * 100); // Convert to cents
    const platformFee = calculatePlatformFee(amount);
    const sellerAmount = amount - platformFee;

    // NOTE: We intentionally do NOT enforce a hard minimum for ACH here.
    // Stripe + risk controls remain server-side authoritative, but UX should always allow ACH selection.

    // Create Stripe Checkout Session with funds held in platform balance until payout release.
    // (We avoid regulated-service wording here; this is a settlement/payout-hold workflow.)
    const baseUrl = getAppUrl();
    
    // P0: Collect address for animal listings (TX-only enforcement)
    const requiresAddress = getCategoryRequirements(listingCategory as any).isAnimal;
    
    // Reserve listing + create an order *before* creating Stripe session (prevents double-buy).
    // NOTE: We create the Firestore order now (status=pending) so the reservation has a stable ID.
    // The webhook will update this order instead of creating a duplicate.
    const orderRef = db.collection('orders').doc();
    const orderId = orderRef.id;
    const nowTs = Timestamp.now();
    // Extend reservation window to 30 minutes to reduce expiry risk during payment
    const reserveMinutes = parseInt(process.env.CHECKOUT_RESERVATION_MINUTES || '30', 10);
    const reserveUntilTs = Timestamp.fromMillis(Date.now() + Math.max(5, reserveMinutes) * 60_000);
    const reservationCol = listingRef.collection('purchaseReservations');
    const reservationRef = reservationCol.doc(orderId);

    // Atomically reserve listing and create order skeleton.
    // IMPORTANT: Firestore transactions require all reads to happen before any writes.
    await db.runTransaction(async (tx) => {
      const listingSnap: any = await (tx as any).get(listingRef);
      if (!listingSnap?.exists) throw new Error('Listing not found');
      const live = listingSnap.data() as any;

      // If offer checkout, read + validate offer BEFORE any transaction writes.
      // (Firestore requires all reads to be executed before all writes.)
      let lockToken: string | null = null;
      if (offerId && offerRef) {
        const offerSnap: any = await (tx as any).get(offerRef);
        if (!offerSnap?.exists) throw new Error('Offer not found');
        const offer = offerSnap.data() as any;
        if (offer.status !== 'accepted') throw new Error('Offer is not accepted');
        if (offer.buyerId !== buyerId) throw new Error('Forbidden');
        if (offer.checkoutSessionId) {
          const existing = String(offer.checkoutSessionId || '');
          if (existing.startsWith('creating:')) throw new Error('Checkout session is being created. Please retry.');
          throw new Error('Checkout session already exists');
        }
        lockToken = `creating:${Date.now()}:${buyerId}`;
      }

      // Build public-safe snapshots for fast "My Purchases" rendering (avoid N+1 listing reads).
      const photos = Array.isArray(live?.photos) ? live.photos : [];
      const sortedPhotos = photos.length
        ? [...photos].sort((a: any, b: any) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))
        : [];
      const coverPhotoUrl =
        (sortedPhotos.find((p: any) => typeof p?.url === 'string' && p.url.trim())?.url as string | undefined) ||
        (Array.isArray(live?.images) ? (live.images.find((u: any) => typeof u === 'string' && u.trim()) as string | undefined) : undefined);

      const city = live?.location?.city ? String(live.location.city) : '';
      const state = live?.location?.state ? String(live.location.state) : '';
      const locationLabel = city && state ? `${city}, ${state}` : state || '';

      const sellerDisplayName =
        String(live?.sellerSnapshot?.displayName || '').trim() ||
        String(live?.sellerSnapshot?.name || '').trim() ||
        'Seller';
      const sellerPhotoURL =
        typeof live?.sellerSnapshot?.photoURL === 'string' && live.sellerSnapshot.photoURL.trim()
          ? String(live.sellerSnapshot.photoURL)
          : undefined;

      // Validate listing availability (server-side authoritative)
      if (live.type !== 'auction') {
        if (live.status !== 'active') throw new Error('Listing is not available for purchase');
        // Read-time guard inside the transaction: treat expired actives as ended.
        const nowMs = Date.now();
        const endMsDirect = toMillisSafe((live as any)?.endAt) ?? toMillisSafe((live as any)?.endsAt);
        const startMs =
          toMillisSafe((live as any)?.startAt) ??
          toMillisSafe((live as any)?.publishedAt) ??
          toMillisSafe((live as any)?.createdAt);
        const durationDays = coerceDurationDays((live as any)?.durationDays, 7);
        const endMs = endMsDirect ?? (typeof startMs === 'number' ? computeEndAt(startMs, durationDays) : null);
        if (typeof endMs === 'number' && endMs <= nowMs) throw new Error('Listing has ended');
      } else {
        // Auctions can be status=expired after backend finalization.
        if (live.status !== 'active' && live.status !== 'expired' && live.status !== 'ended') throw new Error('Auction is not available for purchase');
      }
      if (!offerId && live.offerReservedByOfferId) throw new Error('Listing is reserved by an accepted offer');

      const liveAttrsQty = Number(live?.attributes?.quantity ?? 1) || 1;
      const liveQuantityTotal =
        typeof live?.quantityTotal === 'number' && Number.isFinite(live.quantityTotal)
          ? Math.max(1, Math.floor(live.quantityTotal))
          : Math.max(1, Math.floor(liveAttrsQty));
      const liveQuantityAvailable =
        typeof live?.quantityAvailable === 'number' && Number.isFinite(live.quantityAvailable)
          ? Math.max(0, Math.floor(live.quantityAvailable))
          : liveQuantityTotal;
      const multiQty = String(live?.type || '') === 'fixed' && !offerId && liveQuantityTotal > 1;

      if (!multiQty) {
        // Legacy single-reservation behavior.
        const reservedUntil = typeof live.purchaseReservedUntil?.toDate === 'function' ? live.purchaseReservedUntil.toDate() : null;
        if (reservedUntil instanceof Date && reservedUntil.getTime() > Date.now()) {
          throw new Error('Listing is reserved pending payment confirmation. Please try again later.');
        }
      } else {
        const q = Math.max(1, Math.min(quantityRequested, liveQuantityTotal));
        if (q > liveQuantityAvailable) {
          throw new Error('Not enough available quantity for this listing.');
        }
        // Reserve quantity by decrementing available + recording a reservation doc.
        tx.set(
          listingRef,
          {
            quantityTotal: liveQuantityTotal,
            quantityAvailable: liveQuantityAvailable - q,
            updatedAt: nowTs,
            updatedBy: 'system',
          },
          { merge: true }
        );
        tx.set(
          reservationRef,
          {
            id: orderId,
            orderId,
            listingId,
            buyerId,
            quantity: q,
            status: 'reserved',
            createdAt: nowTs,
            expiresAt: reserveUntilTs,
          },
          { merge: true }
        );
      }

      // Create order skeleton (will be finalized/updated by webhooks)
      tx.set(orderRef, {
        listingId,
        ...(live.type === 'auction' ? { auctionResultId: listingId } : {}),
        ...(offerId ? { offerId: String(offerId) } : {}),
        buyerId,
        sellerId: live.sellerId,
        // Redundant but useful: admin tooling often uses listingTitle for display.
        listingTitle: String(live?.title || 'Listing'),
        listingSnapshot: {
          listingId,
          title: String(live?.title || 'Listing'),
          type: live?.type ? String(live.type) : undefined,
          category: live?.category ? String(live.category) : undefined,
          ...(coverPhotoUrl ? { coverPhotoUrl: String(coverPhotoUrl) } : {}),
          ...(locationLabel ? { locationLabel } : {}),
        },
        sellerSnapshot: {
          sellerId: String(live?.sellerId || ''),
          displayName: sellerDisplayName,
          ...(sellerPhotoURL ? { photoURL: sellerPhotoURL } : {}),
        },
        amount: amount / 100,
        platformFee: platformFee / 100,
        sellerAmount: sellerAmount / 100,
        quantity: quantityRequested,
        unitPrice: listingData.type === 'fixed' ? purchaseAmount : undefined,
        reservationExpiresAt: reserveUntilTs,
        status: 'pending',
        paymentMethod,
        adminHold: false,
        timeline: [
          {
            id: `ORDER_PLACED:${orderId}`,
            type: 'ORDER_PLACED',
            label: 'Order placed',
            timestamp: nowTs,
            actor: 'buyer',
            visibility: 'buyer',
          },
        ],
        ...(categoryReq.isAnimal
          ? {
              buyerAcksAnimalRisk: true,
              buyerAcksAnimalRiskAt: nowTs,
              buyerAcksAnimalRiskVersion: LEGAL_VERSIONS.buyerAcknowledgment.version,
            }
          : {}),
        ...(live.type === 'auction' && auctionResultSnapshot?.paymentDueAt ? { auctionPaymentDueAt: auctionResultSnapshot.paymentDueAt } : {}),
        createdAt: nowTs,
        updatedAt: nowTs,
        lastUpdatedByRole: 'buyer',
      });

      // Reserve listing for this order (legacy single-item behavior only).
      if (!(String(live?.type || '') === 'fixed' && !offerId && (typeof live?.quantityTotal === 'number' ? live.quantityTotal : liveAttrsQty) > 1)) {
        tx.set(
          listingRef,
          {
            purchaseReservedByOrderId: orderId,
            purchaseReservedAt: nowTs,
            purchaseReservedUntil: reserveUntilTs,
            updatedAt: nowTs,
          },
          { merge: true }
        );
      }

      // If offer checkout, lock offer against duplicate session creation and link orderId
      if (offerId && offerRef) {
        tx.update(offerRef, { checkoutSessionId: lockToken, orderId, updatedAt: nowTs });
      }
    });

    const rollbackReservationBestEffort = async () => {
      try {
        await db.runTransaction(async (tx) => {
          const snap: any = await (tx as any).get(listingRef);
          if (snap?.exists) {
            const live = snap.data() as any;
            // Legacy reservation rollback
            if (live.purchaseReservedByOrderId === orderId) {
              tx.set(
                listingRef,
                {
                  purchaseReservedByOrderId: null,
                  purchaseReservedAt: null,
                  purchaseReservedUntil: null,
                  updatedAt: Timestamp.now(),
                },
                { merge: true }
              );
            }
            // Multi-quantity reservation rollback (best-effort): restore quantityAvailable and remove reservation doc
            try {
              const rSnap: any = await (tx as any).get(reservationRef);
              if (rSnap?.exists) {
                const r = rSnap.data() as any;
                const q = typeof r?.quantity === 'number' ? Math.max(1, Math.floor(r.quantity)) : 0;
                if (q > 0) {
                  const avail =
                    typeof live?.quantityAvailable === 'number' && Number.isFinite(live.quantityAvailable)
                      ? Math.max(0, Math.floor(live.quantityAvailable))
                      : null;
                  if (avail !== null) {
                    tx.set(listingRef, { quantityAvailable: avail + q, updatedAt: Timestamp.now(), updatedBy: 'system' }, { merge: true });
                  }
                }
                tx.delete(reservationRef);
              }
            } catch {
              // ignore
            }
          }
          tx.set(orderRef, { status: 'cancelled', updatedAt: Timestamp.now() }, { merge: true });
        });
      } catch {
        // ignore rollback failures
      }
    };

    // Category-based: ensure Bill of Sale exists (or generate it) before creating a Checkout session.
    if (categoryReq.requireBillOfSaleAtCheckout) {
      const buyerSnap = await db.collection('users').doc(buyerId).get();
      const sellerSnap = await db.collection('users').doc(listingData.sellerId).get();
      const buyerData = buyerSnap.exists ? (buyerSnap.data() as any) : null;
      const sellerDataLatest = sellerSnap.exists ? (sellerSnap.data() as any) : null;

      const bucket = getStorage().bucket();
      const now = nowTs;
      const bos = await ensureBillOfSaleForOrder({
        db: db as any,
        bucket: bucket as any,
        orderId,
        listing: {
          id: listingId,
          title: String(listingData.title || 'Listing'),
          category: listingCategory as any,
          attributes: (listingData as any).attributes || {},
        },
        orderAmountUsd: amount / 100,
        buyer: {
          uid: buyerId,
          fullName: String(buyerData?.profile?.fullName || '').trim(),
          email: String(buyerData?.email || decodedToken.email || '') || null,
          phoneNumber: String(buyerData?.phoneNumber || '') || null,
          location: {
            address: buyerData?.profile?.location?.address || null,
            city: String(buyerData?.profile?.location?.city || '').trim(),
            state: String(buyerData?.profile?.location?.state || '').trim(),
            zip: String(buyerData?.profile?.location?.zip || '').trim(),
          },
        },
        seller: {
          uid: String(listingData.sellerId),
          fullName: String(sellerDataLatest?.profile?.fullName || '').trim(),
          email: String(sellerDataLatest?.email || '') || null,
          phoneNumber: String(sellerDataLatest?.phoneNumber || '') || null,
          location: {
            address: sellerDataLatest?.profile?.location?.address || null,
            city: String(sellerDataLatest?.profile?.location?.city || '').trim(),
            state: String(sellerDataLatest?.profile?.location?.state || '').trim(),
            zip: String(sellerDataLatest?.profile?.location?.zip || '').trim(),
          },
        },
        now,
      });

      if (!bos.ok) {
        await rollbackReservationBestEffort();
        return NextResponse.json(
          {
            error: 'Bill of Sale required',
            code: bos.code,
            message: bos.message,
            missing: bos.missing || undefined,
          },
          { status: 400 }
        );
      }
    }

    // Keep order compliance snapshot current (required docs vs provided docs).
    try {
      await recomputeOrderComplianceDocsStatus({ db: db as any, orderId });
    } catch {
      // ignore; best-effort
    }

    /**
     * STRIPE-COMPLIANT PAYMENT MODEL:
     * - Uses Stripe Connect destination charges with immediate payment to seller.
     * - Platform fee (10%) is deducted automatically via application_fee_amount.
     * - Seller receives funds immediately upon successful payment (no escrow, no payout holds).
     * - This is a marketplace facilitation model; platform does not take custody of funds or goods.
     */
    
    // Determine transport option from listing (default to SELLER_TRANSPORT if not set for backward compatibility)
    const transportOption = (listingData as any)?.transportOption || 
                           ((listingData as any)?.trust?.sellerOffersDelivery ? 'SELLER_TRANSPORT' : 'BUYER_TRANSPORT') ||
                           'SELLER_TRANSPORT';
    
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: paymentMethod === 'ach_debit' ? ['us_bank_account'] : ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: listingData.title,
              description: listingData.type === 'auction' 
                ? `Auction Winner - ${(listingData.description || '').substring(0, 450)}`
                : (listingData.description || '').substring(0, 500), // Stripe limit
              images: (listingData.images || []).slice(0, 1), // First image only
            },
            unit_amount: Math.round(purchaseAmount * 100),
          },
          quantity: quantityRequested,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/dashboard/orders?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: offerId ? `${baseUrl}/listing/${listingId}?offer=${offerId}` : `${baseUrl}/listing/${listingId}`,
      // STRIPE CONNECT DESTINATION CHARGE: Seller receives funds immediately, platform fee deducted automatically
      payment_intent_data: {
        application_fee_amount: platformFee, // 10% platform fee (in cents)
        transfer_data: {
          destination: sellerStripeAccountId, // Seller's Stripe Connect account ID
        },
        // Automatic capture (default) - seller is paid immediately upon successful payment
        metadata: {
          transactionId: orderId,
          listingId: listingId,
          buyerId: buyerId,
          sellerId: listingData.sellerId,
          transportOption: String(transportOption),
          paymentType: 'full',
        },
      },
      metadata: {
        orderId,
        listingId: listingId,
        buyerId: buyerId,
        sellerId: listingData.sellerId,
        sellerStripeAccountId: sellerStripeAccountId,
        listingTitle: listingData.title,
        sellerAmount: sellerAmount.toString(), // For reference only (seller already paid via destination charge)
        platformFee: platformFee.toString(),
        quantity: String(quantityRequested),
        unitPrice: String(purchaseAmount),
        sellerTierSnapshot: sellerTier,
        sellerTierWeight: String(sellerTierWeight),
        platformFeePercent: feePercent.toString(), // Immutable snapshot at checkout time (flat)
        paymentMethod,
        transportOption: String(transportOption),
        ...(offerId ? { offerId: String(offerId), acceptedAmount: String(purchaseAmount) } : {}),
      },
      customer_email: decodedToken.email || undefined,
    };
    
    // Require address collection for animal listings (TX-only enforcement)
    if (requiresAddress) {
      sessionConfig.shipping_address_collection = {
        allowed_countries: ['US'],
      };
      // Also collect billing address
      sessionConfig.billing_address_collection = 'required';
    }
    
    let session: Stripe.Checkout.Session;
    try {
      // Use Stripe idempotency key to prevent duplicate sessions at Stripe level
      const stripeIdempotencyKey = `checkout:${listingId}:${buyerId}:${idempotencyWindow}`;
      session = await stripe.checkout.sessions.create(sessionConfig, {
        idempotencyKey: stripeIdempotencyKey,
      });
    } catch (stripeError: any) {
      // Roll back reservation + cancel the order skeleton (best-effort).
      await rollbackReservationBestEffort();
      const msg = String(stripeError?.message || '');
      const lower = msg.toLowerCase();
      if (lower.includes('rejected') || lower.includes('account has been rejected') || lower.includes('cannot create new')) {
        return NextResponse.json(
          {
            error: 'Stripe platform account rejected',
            code: 'STRIPE_PLATFORM_REJECTED',
            message:
              'Stripe is currently blocking payments because the platform account is rejected. Resolve this in Stripe Dashboard, then retry.',
            stripe: { type: stripeError?.type, code: stripeError?.code },
          },
          { status: 503 }
        );
      }
      throw stripeError;
    }

    // Persist idempotency record (expires after 2 minutes to allow cleanup)
    try {
      await idempotencyRef.set({
        stripeSessionId: session.id,
        listingId,
        buyerId,
        orderId,
        createdAt: nowTs,
        expiresAt: Timestamp.fromMillis(Date.now() + 2 * 60 * 1000), // 2 minutes
      });
    } catch (idempError) {
      // Non-blocking: idempotency record failure shouldn't block checkout
      logWarn('Failed to persist idempotency record', {
        route: '/api/stripe/checkout/create-session',
        listingId,
        buyerId,
        error: String(idempError),
      });
    }

    // Persist session ID onto the pre-created order (webhook idempotency + buyer/seller visibility).
    try {
      await orderRef.set({ stripeCheckoutSessionId: session.id, updatedAt: Timestamp.now() }, { merge: true });
    } catch {
      // ignore; webhook can still reconcile by metadata.orderId
    }

    if (offerId && offerRef) {
      try {
        await offerRef.set({ checkoutSessionId: session.id, orderId, updatedAt: Timestamp.now() }, { merge: true });
        await createAuditLog(db, {
          actorUid: buyerId,
          actorRole: 'buyer',
          actionType: 'offer_checkout_session_created',
          listingId,
          metadata: { offerId: String(offerId), checkoutSessionId: session.id, acceptedAmount: purchaseAmount },
          source: 'buyer_ui',
        });
      } catch {
        // If we fail to persist the session id, we still return it; webhook will reconcile.
      }
    }

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      message: 'Checkout session created successfully',
    });
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/stripe/checkout/create-session',
      errorMessage: error.message,
    });
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
