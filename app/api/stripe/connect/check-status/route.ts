/**
 * POST /api/stripe/connect/check-status
 *
 * Checks the status of the authenticated user's Stripe Connect account
 * and updates the user document with current status
 */
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

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

    // Lazily initialize Admin SDK inside handler (Netlify-safe).
    let auth: ReturnType<typeof getAdminAuth>;
    let db: ReturnType<typeof getAdminDb>;
    try {
      auth = getAdminAuth();
      db = getAdminDb();
    } catch (error: any) {
      console.error('Failed to initialize Firebase Admin:', error);
      return json(
        {
          error: 'Server configuration error',
          code: error?.code || 'FIREBASE_ADMIN_INIT_FAILED',
          message: error?.message || 'Failed to initialize Firebase Admin SDK. Please check server logs.',
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

    // Get user's Stripe account ID
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const stripeAccountId = userData?.stripeAccountId;

    if (!stripeAccountId) {
      return json({ error: 'Stripe account not found. Please create an account first.' }, { status: 400 });
    }

    // Retrieve account from Stripe to get current status
    let account: any;
    try {
      account = await stripe.accounts.retrieve(stripeAccountId);
    } catch (e: any) {
      // Common production misconfig: STRIPE_SECRET_KEY revoked/invalid.
      // Stripe throws StripePermissionError with code=account_invalid in this case.
      const stripeCode = e?.code;
      const stripeType = e?.type;
      const msg = e?.message || 'Stripe request failed';
      const isKeyInvalid =
        stripeCode === 'account_invalid' ||
        stripeType === 'StripePermissionError' ||
        String(msg).toLowerCase().includes('application access may have been revoked');

      if (isKeyInvalid) {
        return json(
          {
            error: 'Stripe configuration error',
            message:
              'The platform STRIPE_SECRET_KEY is invalid or has been revoked. Update the key in your hosting environment (Netlify) and redeploy.',
            code: 'STRIPE_KEY_INVALID',
            stripe: {
              code: stripeCode,
              type: stripeType,
              message: msg,
            },
          },
          { status: 503 }
        );
      }

      // For other Stripe errors, return a 502 instead of a generic 500.
      return json(
        {
          error: 'Failed to check account status',
          message: msg,
          code: stripeCode,
          type: stripeType,
        },
        { status: 502 }
      );
    }

    // Log full account status for debugging
    console.log('=== Stripe Account Status ===');
    console.log('Account ID:', stripeAccountId);
    console.log('Details Submitted:', account.details_submitted);
    console.log('Charges Enabled:', account.charges_enabled);
    console.log('Payouts Enabled:', account.payouts_enabled);
    console.log('Requirements Currently Due:', account.requirements?.currently_due);
    console.log('Requirements Errors:', account.requirements?.errors);
    console.log('Requirements Pending:', account.requirements?.pending_verification);
    console.log('Requirements Eventually Due:', account.requirements?.eventually_due);
    console.log('Capabilities:', account.capabilities);
    console.log('============================');

    // Determine onboarding status
    let onboardingStatus = 'pending';
    if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
      onboardingStatus = 'complete';
    } else if (account.details_submitted) {
      onboardingStatus = 'details_submitted';
    }

    // Check for requirements that are still due
    const requirementsDue = account.requirements?.currently_due || [];
    const requirementsErrors = account.requirements?.errors || [];
    const requirementsPending = account.requirements?.pending_verification || [];
    const hasPendingRequirements = requirementsDue.length > 0 || requirementsErrors.length > 0 || requirementsPending.length > 0;

    // Update user document with current status
    const updateData: any = {
      stripeOnboardingStatus: onboardingStatus,
      chargesEnabled: account.charges_enabled || false,
      payoutsEnabled: account.payouts_enabled || false,
      stripeDetailsSubmitted: account.details_submitted || false,
      updatedAt: new Date(),
    };

    await userRef.update(updateData);

    return json({
      success: true,
      status: {
        onboardingStatus,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        requirementsDue: requirementsDue,
        requirementsErrors: requirementsErrors,
        requirementsPending: requirementsPending,
        hasPendingRequirements,
        capabilities: account.capabilities,
      },
      message: 'Account status updated successfully',
      // Include debug info in development
      debug: process.env.NODE_ENV === 'development' ? {
        accountId: stripeAccountId,
        rawStatus: {
          details_submitted: account.details_submitted,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
        },
      } : undefined,
    });
  } catch (error: any) {
    console.error('Error checking Stripe account status:', error);
    return json(
      {
        error: 'Failed to check account status',
        message: error?.message || error?.toString() || 'Unknown error',
        code: error?.code,
        type: error?.type,
      },
      { status: 500 }
    );
  }
}
