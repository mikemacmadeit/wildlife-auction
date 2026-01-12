/**
 * POST /api/stripe/webhook
 * 
 * Handles Stripe webhook events
 * - account.updated: Updates user's Stripe Connect status
 * - checkout.session.completed: Creates order and marks listing as sold
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { stripe } from '@/lib/stripe/config';

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

const adminDb = getFirestore(adminApp);

/**
 * Get raw body for webhook signature verification
 */
async function getRawBody(request: NextRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  if (!reader) {
    throw new Error('No request body');
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(request);
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error: any) {
      console.error('Webhook signature verification failed:', error.message);
      return NextResponse.json(
        { error: `Webhook signature verification failed: ${error.message}` },
        { status: 400 }
      );
    }

    // Handle different event types
    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        await handleAccountUpdated(account);
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * Handle account.updated event
 * Updates user's Stripe Connect status based on account capabilities
 */
async function handleAccountUpdated(account: Stripe.Account) {
  try {
    // Find user by stripeAccountId
    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef.where('stripeAccountId', '==', account.id).get();

    if (snapshot.empty) {
      console.warn(`No user found with stripeAccountId: ${account.id}`);
      return;
    }

    const userDoc = snapshot.docs[0];
    const updateData: any = {
      chargesEnabled: account.capabilities?.card_payments === 'active',
      payoutsEnabled: account.capabilities?.transfers === 'active',
      stripeDetailsSubmitted: account.details_submitted || false,
      updatedAt: new Date(),
    };

    // Determine onboarding status
    if (account.details_submitted && account.capabilities?.transfers === 'active') {
      updateData.stripeOnboardingStatus = 'complete';
    } else if (account.details_submitted) {
      updateData.stripeOnboardingStatus = 'pending';
    } else {
      updateData.stripeOnboardingStatus = 'pending';
    }

    await userDoc.ref.update(updateData);
    console.log(`Updated Stripe account status for user: ${userDoc.id}`);
  } catch (error) {
    console.error('Error handling account.updated:', error);
    throw error;
  }
}

/**
 * Handle checkout.session.completed event
 * Creates order and marks listing as sold
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  try {
    const checkoutSessionId = session.id;
    const listingId = session.metadata?.listingId;
    const buyerId = session.metadata?.buyerId;
    const sellerId = session.metadata?.sellerId;

    if (!listingId || !buyerId || !sellerId) {
      console.error('Missing required metadata in checkout session:', {
        listingId,
        buyerId,
        sellerId,
      });
      return;
    }

    // Check if order already exists (idempotency) using Admin SDK
    const ordersRef = adminDb.collection('orders');
    const existingOrderQuery = await ordersRef
      .where('stripeCheckoutSessionId', '==', checkoutSessionId)
      .get();

    if (!existingOrderQuery.empty) {
      console.log(`Order already exists for checkout session: ${checkoutSessionId}`);
      return;
    }

    // Get payment intent to get transfer details
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;

    if (!paymentIntentId) {
      console.error('No payment intent ID in checkout session');
      return;
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const amount = paymentIntent.amount; // Total amount in cents
    const applicationFeeAmount = paymentIntent.application_fee_amount || 0;
    const sellerAmount = amount - applicationFeeAmount;

    // Get listing to verify it exists using Admin SDK
    const listingRef = adminDb.collection('listings').doc(listingId);
    const listingDoc = await listingRef.get();
    
    if (!listingDoc.exists) {
      console.error(`Listing not found: ${listingId}`);
      return;
    }

    // Create order in Firestore using Admin SDK
    const orderRef = adminDb.collection('orders').doc();
    const orderData = {
      listingId,
      buyerId,
      sellerId,
      amount: amount / 100, // Convert cents to dollars
      platformFee: applicationFeeAmount / 100,
      sellerAmount: sellerAmount / 100,
      status: 'paid',
      stripeCheckoutSessionId: checkoutSessionId,
      stripePaymentIntentId: paymentIntentId,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(),
    };
    await orderRef.set(orderData);

    // Mark listing as sold using Admin SDK
    await listingRef.update({
      status: 'sold',
      updatedAt: new Date(),
    });

    console.log(`Order created and listing marked as sold: ${orderRef.id}`);
  } catch (error) {
    console.error('Error handling checkout.session.completed:', error);
    throw error;
  }
}
