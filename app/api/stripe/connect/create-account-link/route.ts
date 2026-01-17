/**
 * POST /api/stripe/connect/create-account-link
 * 
 * Creates an onboarding link for the authenticated user's Stripe Connect account
 * Returns the onboarding URL
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { getSiteUrl } from '@/lib/site-url';
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
    // Check if Stripe is configured
    if (!isStripeConfigured() || !stripe) {
      return json(
        { error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.' },
        { status: 503 }
      );
    }

    // From here on, Stripe is guaranteed to be present.
    const stripeClient = stripe;

    // Lazily initialize Admin SDK inside handler (Netlify-safe)
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

    // Get Firebase Auth token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json(
        { error: 'Unauthorized - Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    const userId = decodedToken.uid;

    // Get user's Stripe account ID
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const stripeAccountId = userData?.stripeAccountId;

    if (!stripeAccountId) {
      return json(
        {
          error: 'Stripe account not found. Please create an account first.',
          code: 'STRIPE_ACCOUNT_MISSING',
          message:
            'No stripeAccountId is set for this user yet. Create the Connect account first (create-account), then retry creating an onboarding link.',
        },
        { status: 400 }
      );
    }

    // Create account link for onboarding
    const baseUrl = getSiteUrl();
    // Defensive: if this resolves to localhost in production, Stripe may reject it (and it won't work for real sellers).
    if (baseUrl.includes('localhost') && process.env.NODE_ENV === 'production') {
      return json(
        {
          error: 'App URL not configured',
          code: 'APP_URL_NOT_CONFIGURED',
          message:
            'Set APP_URL (or NEXT_PUBLIC_APP_URL) to your production URL (e.g., https://wildlife.exchange) so Stripe can redirect sellers after onboarding.',
        },
        { status: 500 }
      );
    }
    const accountLink = await stripeClient.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseUrl}/seller/payouts?onboarding=restart`,
      return_url: `${baseUrl}/seller/payouts?onboarding=complete`,
      type: 'account_onboarding',
    });

    return json({
      url: accountLink.url,
      message: 'Onboarding link created successfully',
    });
  } catch (error: any) {
    console.error('Error creating account link:', error);

    // Provide structured Stripe errors when possible
    const msg = String(error?.message || '');
    if (error?.type && msg) {
      const requestLogUrl =
        (error?.raw as any)?.request_log_url || (error?.raw as any)?.requestLogUrl || undefined;
      const requestId = (error as any)?.requestId || (error?.raw as any)?.requestId || undefined;

      // Helpful diagnostics (safe): identify which platform account this server key belongs to.
      let platformAccountId: string | undefined;
      let platformLivemode: boolean | undefined;
      try {
        // `stripe` can be null at type-level; best-effort only.
        const stripeClient2 = stripe;
        if (stripeClient2) {
          const acct = (await stripeClient2.accounts.retrieve()) as any;
          platformAccountId = acct?.id;
          platformLivemode = acct?.livemode;
        }
      } catch {
        // ignore
      }

      return json(
        {
          error: 'Failed to create onboarding link',
          message: msg,
          stripe: {
            type: error?.type,
            code: error?.code,
            requestId,
            platformAccountId,
            platformLivemode,
            requestLogUrl: process.env.NODE_ENV === 'production' ? undefined : requestLogUrl,
          },
        },
        { status: 400 }
      );
    }
    return json(
      {
        error: 'Failed to create onboarding link',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
