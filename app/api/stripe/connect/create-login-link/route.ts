/**
 * POST /api/stripe/connect/create-login-link
 *
 * Creates a Stripe Connect Express dashboard login link for the authenticated user's connected account.
 * Sellers use this to manage payout settings (bank account) inside Stripe.
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// Route handlers work fine with Web `Request` / `Response`.
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

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
      return json(
        { error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.' },
        { status: 503 }
      );
    }

    // Rate limiting (Stripe operations)
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.stripe);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    let auth;
    let db;
    try {
      auth = getAdminAuth();
      db = getAdminDb();
    } catch (e: any) {
      return json(
        {
          error: 'Server configuration error',
          code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
          message: e?.message || 'Failed to initialize Firebase Admin SDK',
        },
        { status: 503 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized - Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch {
      return json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    const userId = decodedToken.uid;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return json({ error: 'User not found' }, { status: 404 });

    const userData = userDoc.data();
    const stripeAccountId = userData?.stripeAccountId;
    if (!stripeAccountId) {
      return json(
        {
          error: 'Stripe account not found. Please enable payouts first.',
          code: 'STRIPE_ACCOUNT_MISSING',
        },
        { status: 400 }
      );
    }

    // Stripe Express dashboard login link (seller manages payout method/bank here).
    const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
    return json({ url: loginLink.url });
  } catch (error: any) {
    console.error('Error creating Stripe login link:', error);
    return json(
      {
        error: 'Failed to create Stripe login link',
        message: error?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

