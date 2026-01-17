/**
 * GET /api/stripe/debug/platform
 *
 * Dev-only: returns Stripe platform account status for the currently configured STRIPE_SECRET_KEY.
 * This helps diagnose "platform rejected / cannot create accounts" errors.
 */
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { getAdminAuth } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET(request: Request) {
  // Never expose this in production.
  if (process.env.NODE_ENV === 'production') {
    return json({ error: 'Not found' }, { status: 404 });
  }

  if (!isStripeConfigured() || !stripe) {
    return json({ error: 'Stripe is not configured (missing STRIPE_SECRET_KEY)' }, { status: 503 });
  }

  // In local dev, allow unauthenticated access from localhost to simplify debugging.
  // In all other cases, require a Firebase ID token.
  const host = String(request.headers.get('host') || '');
  const isLocalhost = host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
  if (!isLocalhost) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized - Missing Bearer token' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    try {
      const auth = getAdminAuth();
      await auth.verifyIdToken(token);
    } catch (e: any) {
      return json({ error: 'Unauthorized - Invalid token', details: e?.code || e?.message }, { status: 401 });
    }
  }

  try {
    // `stripe.accounts.retrieve()` with no ID returns the platform account for the API key.
    const acct = (await stripe.accounts.retrieve()) as any;
    return json({
      accountId: acct.id,
      livemode: acct.livemode,
      country: acct.country,
      email: (acct as any).email,
      chargesEnabled: (acct as any).charges_enabled,
      payoutsEnabled: (acct as any).payouts_enabled,
      detailsSubmitted: (acct as any).details_submitted,
      requirements: {
        disabledReason: (acct as any).requirements?.disabled_reason,
        currentlyDue: (acct as any).requirements?.currently_due || [],
        eventuallyDue: (acct as any).requirements?.eventually_due || [],
        pastDue: (acct as any).requirements?.past_due || [],
        pendingVerification: (acct as any).requirements?.pending_verification || [],
      },
      capabilities: (acct as any).capabilities || {},
    });
  } catch (e: any) {
    return json(
      {
        error: 'Failed to retrieve platform account',
        stripe: {
          type: e?.type,
          code: e?.code,
          requestId: e?.requestId,
          message: e?.message,
          requestLogUrl: (e?.raw as any)?.request_log_url,
        },
      },
      { status: 500 }
    );
  }
}

