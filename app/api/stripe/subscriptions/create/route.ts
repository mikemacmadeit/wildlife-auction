/**
 * POST /api/stripe/subscriptions/create
 * 
 * Create a Stripe subscription for Exposure Plans:
 * - Priority Seller ($99/mo)
 * - Premier Seller ($299/mo)
 */

// IMPORTANT:
// Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, dev bundling can attempt to resolve a missing internal Next module
// (`next/dist/server/web/exports/next-response`) and crash compilation.
// Route handlers work fine with standard Web `Request` / `Response`.
import { Timestamp } from 'firebase-admin/firestore';
import { stripe, isStripeConfigured, getAppUrl } from '@/lib/stripe/config';
import Stripe from 'stripe';
import { validateRequest } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { PLAN_CONFIG } from '@/lib/pricing/plans';
import { mapLegacyPlanToTier, mapTierToLegacyPlanId, type SubscriptionTier } from '@/lib/pricing/subscriptions';
import { logInfo, logError } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

const auth = getAdminAuth();
const db = getAdminDb();

const createSubscriptionSchema = z.object({
  // Back-compat: accept legacy plan ids too.
  planId: z.enum(['priority', 'premier', 'pro', 'elite']),
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

    const { planId: rawPlanId } = validation.data;
    const tier: SubscriptionTier = mapLegacyPlanToTier(rawPlanId);
    const planConfig = PLAN_CONFIG[tier];

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
    // Prefer new env vars, fall back to legacy ones to avoid breaking existing deploys.
    const preferredEnvKey = `STRIPE_PRICE_ID_${tier.toUpperCase()}`;
    const legacyEnvKey = tier === 'priority' ? 'STRIPE_PRICE_ID_PRO' : 'STRIPE_PRICE_ID_ELITE';
    const priceId = process.env[preferredEnvKey] || process.env[legacyEnvKey];
    
    if (!priceId) {
      logError('Stripe price ID not configured for plan', undefined, {
        planId: tier,
        route: '/api/stripe/subscriptions/create',
      });
      return json(
        {
          error: `Subscription price for ${planConfig.displayName} plan is not configured. Please contact support.`,
          code: 'PRICE_NOT_CONFIGURED',
          planId: tier,
        },
        { status: 503 }
      );
    }

    // Create Stripe Subscription
    const subscriptionResponse = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId || undefined }],
      metadata: {
        userId: userId,
        planId: tier,
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
      // Single source of truth
      subscriptionTier: tier,
      // Legacy field preserved for older code paths
      subscriptionPlan: mapTierToLegacyPlanId(tier),
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
