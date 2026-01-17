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
import Stripe from 'stripe';
import { stripe, calculatePlatformFee, getAppUrl, isStripeConfigured } from '@/lib/stripe/config';
import { getEffectiveSubscriptionTier, getTierWeight } from '@/lib/pricing/subscriptions';
import { MARKETPLACE_FEE_PERCENT } from '@/lib/pricing/plans';
import { validateRequest, createCheckoutSessionSchema } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit/logger';
import { logInfo, logWarn } from '@/lib/monitoring/logger';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { containsProhibitedKeywords } from '@/lib/compliance/validation';
import { ACH_DEBIT_MIN_TOTAL_USD } from '@/lib/payments/constants';

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

    // Rate limiting (before auth to prevent brute force)
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.checkout);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(rateLimitResult.body, { 
        status: rateLimitResult.status,
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
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

    const { listingId, offerId, paymentMethod: paymentMethodRaw } = validation.data as any;
    // Back-compat: clients may still send "ach" (older UI); normalize to "ach_debit".
    const normalizedPaymentMethod =
      paymentMethodRaw === 'ach' ? 'ach_debit' : (paymentMethodRaw || 'card');
    const paymentMethod = normalizedPaymentMethod as 'card' | 'ach_debit';

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

    // If a high-ticket checkout is pending for this listing, block additional checkouts
    // to avoid double-selling while waiting on bank rails.
    if (listingData.purchaseReservedByOrderId) {
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

    // Validate listing is active
    if (listingData.status !== 'active') {
      return NextResponse.json(
        { error: 'Listing is not available for purchase' },
        { status: 400 }
      );
    }

    // If listing is reserved by an accepted offer, block regular checkout
    if (!offerId && listingData.offerReservedByOfferId) {
      return NextResponse.json(
        { error: 'Listing is reserved by an accepted offer' },
        { status: 409 }
      );
    }

    // Validate listing type and get purchase amount
    let purchaseAmount: number;
    
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
      // Auction listing - get winning bid amount
      // Verify auction has ended
      if (listingData.endsAt) {
        const endsAt = listingData.endsAt.toDate();
        if (endsAt.getTime() > Date.now()) {
          return NextResponse.json(
            { error: 'Auction has not ended yet' },
            { status: 400 }
          );
        }
      }
      
      // Get winning bidder using Admin SDK
      const bidsRef = db.collection('bids');
      const winningBidQuery = await bidsRef
        .where('listingId', '==', listingId)
        .orderBy('amount', 'desc')
        .limit(1)
        .get();
      
      if (winningBidQuery.empty) {
        return NextResponse.json(
          { error: 'No bids found for this auction' },
          { status: 400 }
        );
      }
      
      const winningBidDoc = winningBidQuery.docs[0];
      const winningBidData = winningBidDoc.data();
      const winningBidderId = winningBidData.bidderId;
      const winningBidAmount = winningBidData.amount;
      
      // Verify buyer is the winning bidder
      if (winningBidderId !== buyerId) {
        return NextResponse.json(
          { error: 'You are not the winning bidder' },
          { status: 403 }
        );
      }
      
      purchaseAmount = winningBidAmount;
    } else {
      return NextResponse.json(
        { error: 'This listing type does not support checkout' },
        { status: 400 }
      );
    }

    // Prevent buying own listing
    if (listingData.sellerId === buyerId) {
      return NextResponse.json(
        { error: 'You cannot purchase your own listing' },
        { status: 400 }
      );
    }

    // P0: Texas-only enforcement for animal listings
    const animalCategories = ['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock'];
    if (animalCategories.includes(listingData.category)) {
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
    const sellerChargesEnabled = sellerData.chargesEnabled ?? false;
    const sellerPayoutsEnabled = sellerData.payoutsEnabled ?? false;
    const sellerDetailsSubmitted = sellerData.stripeDetailsSubmitted ?? false;
    const sellerOnboardingStatus = sellerData.stripeOnboardingStatus || 'not_started';
    
    const sellerTier = getEffectiveSubscriptionTier(sellerData as any);
    const sellerTierWeight = getTierWeight(sellerTier);

    // Check for admin override flag (optional, defaults to block)
    const allowUnreadySeller = request.headers.get('x-allow-unready-seller') === 'true';
    
    // Validate seller payout readiness (unless admin override)
    const isPayoutReady = sellerStripeAccountId && 
                          sellerChargesEnabled && 
                          sellerPayoutsEnabled && 
                          sellerDetailsSubmitted && 
                          sellerOnboardingStatus === 'complete';

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
    const amount = Math.round(purchaseAmount * 100); // Convert to cents
    const platformFee = calculatePlatformFee(amount);
    const sellerAmount = amount - platformFee;

    // Server-side gating (mirrors UI gating): ACH is only allowed above the configured threshold.
    if (paymentMethod === 'ach_debit' && amount < Math.round(ACH_DEBIT_MIN_TOTAL_USD * 100)) {
      return NextResponse.json(
        {
          error: 'ACH debit is only available for eligible orders',
          code: 'ACH_NOT_ELIGIBLE',
          details: { minTotalUsd: ACH_DEBIT_MIN_TOTAL_USD, totalUsd: amount / 100 },
        },
        { status: 400 }
      );
    }

    // Create Stripe Checkout Session with ESCROW (no destination charge)
    // Funds are held in platform account until admin confirms delivery
    const baseUrl = getAppUrl();
    
    // P0: Collect address for animal listings (TX-only enforcement)
    const requiresAddress = animalCategories.includes(listingData.category);
    
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
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/dashboard/orders?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: offerId ? `${baseUrl}/listing/${listingId}?offer=${offerId}` : `${baseUrl}/listing/${listingId}`,
      // NO payment_intent_data.transfer_data - funds stay in platform account (escrow)
      // Admin will release funds via transfer after delivery confirmation
      metadata: {
        listingId: listingId,
        buyerId: buyerId,
        sellerId: listingData.sellerId,
        sellerStripeAccountId: sellerStripeAccountId,
        listingTitle: listingData.title,
        sellerAmount: sellerAmount.toString(), // Store seller amount in metadata for transfer
        platformFee: platformFee.toString(),
        sellerTierSnapshot: sellerTier,
        sellerTierWeight: String(sellerTierWeight),
        platformFeePercent: feePercent.toString(), // Immutable snapshot at checkout time (flat)
        paymentMethod,
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
    
    // If this is an offer checkout, lock the offer against duplicate session creation.
    if (offerId && offerRef) {
      const lockToken = `creating:${Date.now()}:${buyerId}`;
      await db.runTransaction(async (tx) => {
        const snap: any = await (tx as any).get(offerRef);
        if (!snap?.exists) throw new Error('Offer not found');
        const offer = (snap.data ? snap.data() : snap?.docs?.[0]?.data?.()) as any;
        if (offer.status !== 'accepted') throw new Error('Offer is not accepted');
        if (offer.buyerId !== buyerId) throw new Error('Forbidden');
        if (offer.checkoutSessionId) throw new Error('Checkout session already exists');
        tx.update(offerRef, { checkoutSessionId: lockToken, updatedAt: Timestamp.now() });
      });
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(sessionConfig);
    } catch (stripeError: any) {
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

    if (offerId && offerRef) {
      try {
        await offerRef.set({ checkoutSessionId: session.id, updatedAt: Timestamp.now() }, { merge: true });
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
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
