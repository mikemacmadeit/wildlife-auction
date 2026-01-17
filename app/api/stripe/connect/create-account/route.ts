/**
 * POST /api/stripe/connect/create-account
 * 
 * Creates a Stripe Connect Express account for the authenticated user
 * Returns the Stripe account ID
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
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
    // Check if Stripe is configured
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
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
    }

    // Initialize Firebase Admin (inside handler to catch errors gracefully)
    try {
      // Initialize Admin SDK lazily inside handler (Netlify-safe) via shared helper.
      getAdminAuth();
      getAdminDb();
    } catch (error: any) {
      console.error('Failed to initialize Firebase Admin:', error);
      return json(
        {
          error: 'Server configuration error',
          message: 'Failed to initialize Firebase Admin SDK. Please check server logs.',
          details: error?.message || 'Unknown error',
        },
        { status: 500 }
      );
    }

    const auth = getAdminAuth();
    const db = getAdminDb();

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
    } catch (error: any) {
      console.error('Token verification error:', error?.code || error?.message || error);
      return json(
        { 
          error: 'Unauthorized - Invalid token',
          details: error?.code || error?.message || 'Token verification failed'
        },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;

    // Check if user already has a Stripe account
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData?.stripeAccountId) {
        return json({
          stripeAccountId: userData.stripeAccountId,
          message: 'Stripe account already exists',
        });
      }
    }

    // Create Stripe Connect Express account
    let account;
    try {
      account = await stripe.accounts.create({
        type: 'express',
        country: 'US', // Default to US, can be made configurable
        email: decodedToken.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
    } catch (stripeError: any) {
      console.error('Stripe API error:', {
        code: stripeError?.code,
        type: stripeError?.type,
        message: stripeError?.message,
        raw: stripeError,
      });

      // Founder-friendly: these specific Stripe errors mean the PLATFORM Stripe account
      // hasn't completed required activation/profile steps, so Connect operations are blocked.
      const msg = String(stripeError?.message || '');
      const lower = msg.toLowerCase();

      if (lower.includes('rejected') || lower.includes('cannot create new accounts')) {
        const requestLogUrl =
          (stripeError?.raw as any)?.request_log_url ||
          (stripeError?.raw as any)?.requestLogUrl ||
          undefined;
        const requestId =
          (stripeError as any)?.requestId ||
          (stripeError?.raw as any)?.requestId ||
          undefined;

        // Helpful diagnostics: confirm which platform account the server key belongs to.
        // This is safe to return (acct_... is not a secret) and helps detect "wrong Stripe account" instantly.
        let platformAccountId: string | undefined;
        let platformLivemode: boolean | undefined;
        try {
          const acct = (await stripe.accounts.retrieve()) as any;
          platformAccountId = acct?.id;
          platformLivemode = acct?.livemode;
        } catch {
          // ignore (best-effort)
        }

        return json(
          {
            error: 'Stripe platform account rejected',
            code: 'STRIPE_PLATFORM_REJECTED',
            message:
              'Your platform Stripe account is currently rejected, so Stripe will not allow creating new seller payout accounts. ' +
              'Resolve this in Stripe Dashboard (or contact Stripe support), then retry.',
            actionUrl: 'https://dashboard.stripe.com/support',
            stripe: {
              type: stripeError?.type,
              code: stripeError?.code,
              requestId,
              platformAccountId,
              platformLivemode,
              // Only include Stripe request logs in non-production (they can contain sensitive debugging context).
              requestLogUrl: process.env.NODE_ENV === 'production' ? undefined : requestLogUrl,
            },
          },
          { status: 403 }
        );
      }

      if (lower.includes('account must be activated')) {
        return json(
          {
            error: 'Stripe account activation required',
            code: 'STRIPE_PLATFORM_NOT_ACTIVATED',
            message:
              'Your platform Stripe account must be activated before Wildlife.Exchange can create seller payout accounts. ' +
              'Open Stripe Dashboard → Activate your account, then retry.',
            actionUrl: 'https://dashboard.stripe.com/account/onboarding',
            stripe: {
              type: stripeError?.type,
              code: stripeError?.code,
            },
          },
          { status: 400 }
        );
      }

      if (
        lower.includes('complete your platform profile') ||
        lower.includes('platform profile') ||
        lower.includes('answer the questionnaire') ||
        lower.includes('/connect/accounts/overview')
      ) {
        return json(
          {
            error: 'Stripe Connect platform profile required',
            code: 'STRIPE_PLATFORM_PROFILE_INCOMPLETE',
            message:
              'Stripe requires your platform to complete the Connect questionnaire/profile before creating seller payout accounts. ' +
              'Open Stripe Dashboard → Connect → Accounts, complete the platform profile, then retry.',
            actionUrl: 'https://dashboard.stripe.com/connect/accounts/overview',
            stripe: {
              type: stripeError?.type,
              code: stripeError?.code,
            },
          },
          { status: 400 }
        );
      }

      throw stripeError;
    }

    // Save Stripe account ID to user document
    const updateData: any = {
      stripeAccountId: account.id,
      stripeOnboardingStatus: 'pending',
      chargesEnabled: false,
      payoutsEnabled: false,
      stripeDetailsSubmitted: false,
      updatedAt: new Date(),
    };

    if (userDoc.exists) {
      await userRef.update(updateData);
    } else {
      // Create user document if it doesn't exist
      await userRef.set({
        userId,
        email: decodedToken.email || '',
        emailVerified: decodedToken.email_verified || false,
        ...updateData,
        createdAt: new Date(),
      });
    }

    return json({
      stripeAccountId: account.id,
      message: 'Stripe account created successfully',
    });
  } catch (error: any) {
    console.error('=== ERROR CREATING STRIPE ACCOUNT ===');
    console.error('Error type:', typeof error);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('Error type (Stripe):', error?.type);
    console.error('Full error:', JSON.stringify(error, null, 2));
    console.error('Error stack:', error?.stack);
    console.error('=====================================');
    
    return json(
      {
        error: 'Failed to create Stripe account',
        message: error?.message || error?.toString() || 'Unknown error',
        code: error?.code,
        type: error?.type,
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
