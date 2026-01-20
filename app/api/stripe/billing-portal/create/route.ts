/**
 * POST /api/stripe/billing-portal/create
 * 
 * Create a Stripe Billing Portal session for managing subscription
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { stripe, isStripeConfigured, getAppUrl } from '@/lib/stripe/config';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { logInfo, logError } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';
import { createAuditLog } from '@/lib/audit/logger';

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
    const auth = getAdminAuth();
    const db = getAdminDb();

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

    // Get or create Stripe Customer
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    let customerId = userData?.stripeCustomerId;

    if (!customerId) {
      // Create Stripe Customer if doesn't exist
      if (!userEmail) {
        return json({ error: 'User email required' }, { status: 400 });
      }

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

    // Create Billing Portal session
    const baseUrl = getAppUrl();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/seller/settings`,
    });

    // Create audit log
    await createAuditLog(db, {
      actorUid: userId,
      actorRole: 'seller',
      actionType: 'billing_portal_accessed',
      beforeState: {},
      afterState: {},
      metadata: {
        customerId,
        portalSessionId: portalSession.id,
      },
      source: 'admin_ui',
    });

    logInfo('Billing portal session created', {
      route: '/api/stripe/billing-portal/create',
      userId,
      customerId,
      portalSessionId: portalSession.id,
    });

    return json({
      url: portalSession.url,
    });
  } catch (error: any) {
    logError('Error creating billing portal session', error, {
      route: '/api/stripe/billing-portal/create',
    });
    captureException(error instanceof Error ? error : new Error(String(error)), {
      route: '/api/stripe/billing-portal/create',
    });
    return json({ error: 'Failed to create billing portal session', message: error.message }, { status: 500 });
  }
}
