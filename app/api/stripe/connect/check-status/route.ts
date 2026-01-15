/**
 * POST /api/stripe/connect/check-status
 * 
 * Checks the status of the authenticated user's Stripe Connect account
 * and updates the user document with current status
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';

// Initialize Firebase Admin (if not already initialized)
let adminApp: App | null = null;
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;

function initializeFirebaseAdmin() {
  if (adminApp) {
    return { auth: auth!, db: db! };
  }

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
          adminApp = initializeApp();
        } catch (error) {
          console.error('Firebase Admin initialization error:', error);
          throw new Error('Failed to initialize Firebase Admin SDK - missing credentials');
        }
      }
    } catch (error) {
      console.error('Firebase Admin initialization error:', error);
      throw error;
    }
  } else {
    adminApp = getApps()[0];
  }

  auth = getAuth(adminApp);
  db = getFirestore(adminApp);
  return { auth, db };
}

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

    // Initialize Firebase Admin
    let firebaseAdmin;
    try {
      firebaseAdmin = initializeFirebaseAdmin();
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

    const { auth, db } = firebaseAdmin;

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
    const account = await stripe.accounts.retrieve(stripeAccountId);

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
