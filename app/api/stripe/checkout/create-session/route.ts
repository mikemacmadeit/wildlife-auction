/**
 * POST /api/stripe/checkout/create-session
 * 
 * Creates a Stripe Checkout session for purchasing a listing
 * Uses destination charges with application fee (marketplace model)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { stripe, calculatePlatformFee, getAppUrl } from '@/lib/stripe/config';

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

    // Parse request body
    const body = await request.json();
    const { listingId } = body;

    if (!listingId) {
      return NextResponse.json(
        { error: 'listingId is required' },
        { status: 400 }
      );
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

    // Validate listing is active
    if (listingData.status !== 'active') {
      return NextResponse.json(
        { error: 'Listing is not available for purchase' },
        { status: 400 }
      );
    }

    // Validate listing type (only fixed price for now)
    if (listingData.type !== 'fixed') {
      return NextResponse.json(
        { error: 'Only fixed price listings can be purchased via checkout' },
        { status: 400 }
      );
    }

    // Validate listing has a price
    if (!listingData.price || listingData.price <= 0) {
      return NextResponse.json(
        { error: 'Listing does not have a valid price' },
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
    const sellerPayoutsEnabled = sellerData.payoutsEnabled;

    // Validate seller has Stripe account and payouts enabled
    if (!sellerStripeAccountId) {
      return NextResponse.json(
        { error: 'Seller has not set up payment processing. Please contact the seller.' },
        { status: 400 }
      );
    }

    if (!sellerPayoutsEnabled) {
      return NextResponse.json(
        { error: 'Seller payment processing is not ready. Please contact the seller.' },
        { status: 400 }
      );
    }

    // Calculate fees
    const amount = Math.round(listingData.price * 100); // Convert to cents
    const platformFee = calculatePlatformFee(amount);

    // Create Stripe Checkout Session with destination charge
    const baseUrl = getAppUrl();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: listingData.title,
              description: (listingData.description || '').substring(0, 500), // Stripe limit
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
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: sellerStripeAccountId,
        },
      },
      metadata: {
        listingId: listingId,
        buyerId: buyerId,
        sellerId: listingData.sellerId,
        listingTitle: listingData.title,
      },
      customer_email: decodedToken.email || undefined,
    });

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
