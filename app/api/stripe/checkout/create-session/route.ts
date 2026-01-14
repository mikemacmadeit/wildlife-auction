/**
 * POST /api/stripe/checkout/create-session
 * 
 * Creates a Stripe Checkout session for purchasing a listing
 * Uses destination charges with application fee (marketplace model)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import Stripe from 'stripe';
import { stripe, calculatePlatformFee, calculatePlatformFeeForPlan, getAppUrl, isStripeConfigured } from '@/lib/stripe/config';
import { validateRequest, createCheckoutSessionSchema } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit/logger';
import { logInfo, logWarn } from '@/lib/monitoring/logger';

// Initialize Firebase Admin (if not already initialized)
let adminApp: App;
if (!getApps().length) {
  try {
    const serviceAccount = process.env.FIREBASE_PRIVATE_KEY
      ? {
          projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }
      : undefined;

    if (serviceAccount?.projectId && serviceAccount?.clientEmail && serviceAccount?.privateKey) {
      adminApp = initializeApp({
        credential: cert(serviceAccount as any),
      });
    } else {
      try {
        // Try Application Default Credentials (for production)
        adminApp = initializeApp();
      } catch {
        throw new Error('Failed to initialize Firebase Admin SDK');
      }
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    throw error;
  }
} else {
  adminApp = getApps()[0];
}

const auth = getAuth(adminApp);
const db = getFirestore(adminApp);

export async function POST(request: NextRequest) {
  try {
    // Check if Stripe is configured
    if (!isStripeConfigured() || !stripe) {
      return NextResponse.json(
        { error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.' },
        { status: 503 }
      );
    }

    // Rate limiting (before auth to prevent brute force)
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.checkout);
    const rateLimitResult = await rateLimitCheck(request);
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

    const { listingId } = validation.data;

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

    // Validate listing is active
    if (listingData.status !== 'active') {
      return NextResponse.json(
        { error: 'Listing is not available for purchase' },
        { status: 400 }
      );
    }

    // Validate listing type and get purchase amount
    let purchaseAmount: number;
    
    if (listingData.type === 'fixed') {
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
      const { containsProhibitedKeywords } = require('@/lib/compliance/validation');
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
    
    // Determine effective plan (admin override takes precedence)
    let sellerPlanId = sellerData?.adminPlanOverride || sellerData?.subscriptionPlan || 'free';
    
    // If subscription is past_due or canceled, revert to free (unless admin override)
    if (!sellerData?.adminPlanOverride) {
      const subscriptionStatus = sellerData?.subscriptionStatus;
      if (subscriptionStatus === 'past_due' || subscriptionStatus === 'canceled' || subscriptionStatus === 'unpaid') {
        sellerPlanId = 'free';
      }
    }

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

    // Calculate fees based on seller's effective plan (server-side, never trust client)
    const { getPlanConfig, getPlanTakeRate } = require('@/lib/pricing/plans');
    const planConfig = getPlanConfig(sellerPlanId);
    const feePercent = sellerData?.adminFeeOverride ?? planConfig.takeRate; // Admin fee override takes precedence
    
    const amount = Math.round(purchaseAmount * 100); // Convert to cents
    const platformFee = Math.round(amount * feePercent); // Server-side calculation using effective plan
    const sellerAmount = amount - platformFee;

    // Create Stripe Checkout Session with ESCROW (no destination charge)
    // Funds are held in platform account until admin confirms delivery
    const baseUrl = getAppUrl();
    
    // P0: Collect address for animal listings (TX-only enforcement)
    const animalCategories = ['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock'];
    const requiresAddress = animalCategories.includes(listingData.category);
    
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
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
      cancel_url: `${baseUrl}/listing/${listingId}`,
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
        sellerPlanSnapshot: sellerPlanId, // Store plan at checkout for order creation
        platformFeePercent: feePercent.toString(), // Store fee percent for order snapshot
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
    
    const session = await stripe.checkout.sessions.create(sessionConfig);

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
