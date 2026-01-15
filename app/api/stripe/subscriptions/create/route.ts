/**
 * POST /api/stripe/subscriptions/create
 * 
 * Create a Stripe subscription for Pro or Elite plan
 */

// IMPORTANT:
// Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, dev bundling can attempt to resolve a missing internal Next module
// (`next/dist/server/web/exports/next-response`) and crash compilation.
// Route handlers work fine with standard Web `Request` / `Response`.
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { stripe, isStripeConfigured, getAppUrl } from '@/lib/stripe/config';
import Stripe from 'stripe';
import { validateRequest } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { PLAN_CONFIG } from '@/lib/pricing/plans';
import { logInfo, logError } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';

// Initialize Firebase Admin
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
      adminApp = initializeApp();
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

const createSubscriptionSchema = z.object({
  planId: z.enum(['pro', 'elite']),
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

export async function POST(request: Request) {
  try {
    if (!isStripeConfigured() || !stripe) {
      return json({ error: 'Stripe is not configured' }, { status: 503 });
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
    const userEmail = decodedToken.email;

    if (!userEmail) {
      return json({ error: 'User email required' }, { status: 400 });
    }

    // Validate request body
    const body = await request.json();
    const validation = validateRequest(createSubscriptionSchema, body);
    if (!validation.success) {
      return json({ error: validation.error, details: validation.details?.errors }, { status: 400 });
    }

    const { planId } = validation.data;
    const planConfig = PLAN_CONFIG[planId];

    if (!planConfig) {
      return json({ error: 'Invalid plan ID' }, { status: 400 });
    }

    // Get or create Stripe Customer
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    let customerId = userData?.stripeCustomerId;

    if (!customerId) {
      // Create Stripe Customer
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          userId: userId,
        },
      });
      customerId = customer.id;

      // Save customer ID to user doc
      await userRef.set({ stripeCustomerId: customerId }, { merge: true });
    }

    // Get Stripe Price ID for this plan (must be created in Stripe Dashboard)
    // Store in environment variables: STRIPE_PRICE_ID_PRO, STRIPE_PRICE_ID_ELITE
    const priceId = process.env[`STRIPE_PRICE_ID_${planId.toUpperCase()}`];
    
    if (!priceId) {
      logError('Stripe price ID not configured for plan', undefined, {
        planId,
        route: '/api/stripe/subscriptions/create',
      });
      return json(
        { error: `Subscription price for ${planConfig.displayName} plan is not configured. Please contact support.` },
        { status: 500 }
      );
    }

    // Create Stripe Subscription
    const subscriptionResponse = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId || undefined }],
      metadata: {
        userId: userId,
        planId: planId,
      },
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });
    // Stripe typings can vary by version; treat as `any` to avoid build-time type mismatches.
    const subscription = subscriptionResponse as any;

    // Update user with subscription info
    await userRef.set({
      stripeSubscriptionId: subscription.id,
      subscriptionPlan: planId,
      subscriptionStatus: subscription.status,
      subscriptionCurrentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : undefined,
      subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      updatedAt: Timestamp.now(),
    }, { merge: true });

    // Return subscription and client secret for payment
    // Stripe invoice typings vary; treat as `any` for portability across versions.
    const invoice = subscription.latest_invoice as any;
    const paymentIntent = invoice?.payment_intent as any;

    // If subscription is incomplete, Stripe provides a hosted invoice payment page.
    // This is the simplest "Stripe-hosted checkout" UX without adding Stripe.js Elements.
    const hostedInvoiceUrl = (invoice as any)?.hosted_invoice_url || null;

    return json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent?.client_secret,
      status: subscription.status,
      hostedInvoiceUrl,
    });
  } catch (error: any) {
    logError('Error creating subscription', error, {
      route: '/api/stripe/subscriptions/create',
    });
    captureException(error instanceof Error ? error : new Error(String(error)), {
      route: '/api/stripe/subscriptions/create',
    });
    return json({ error: 'Failed to create subscription', message: error.message }, { status: 500 });
  }
}
