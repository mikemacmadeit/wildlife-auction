/**
 * POST /api/listings/check-limit
 * 
 * Server-side listing limit enforcement
 * Checks if user can create/publish/reactivate a listing
 */

// IMPORTANT:
// Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, dev bundling can attempt to resolve a missing internal Next module
// (`next/dist/server/web/exports/next-response`) and crash compilation.
// Route handlers work fine with standard Web `Request` / `Response`.
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { validateRequest } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { canCreateListing, getPlanListingLimit, getPlanConfig, hasUnlimitedListings } from '@/lib/pricing/plans';
import { logInfo, logWarn, logError } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';

// Lazy Firebase Admin init (avoid slow/hanging ADC attempts during cold starts if env isn't configured)
let adminApp: App | null = null;
function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  // In Netlify/production, we require explicit service-account env vars.
  // This avoids firebase-admin trying Application Default Credentials (slow/unstable in serverless).
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
  const missing = [
    !projectId ? 'FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)' : null,
    !clientEmail ? 'FIREBASE_CLIENT_EMAIL' : null,
    !privateKeyRaw ? 'FIREBASE_PRIVATE_KEY' : null,
  ].filter(Boolean) as string[];

  if (isProd && missing.length > 0) {
    const err: any = new Error(`Firebase Admin not configured (missing: ${missing.join(', ')})`);
    err.code = 'FIREBASE_ADMIN_NOT_CONFIGURED';
    err.missing = missing;
    throw err;
  }

  const serviceAccount = privateKeyRaw
    ? {
        projectId,
        clientEmail,
        privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
      }
    : undefined;

  adminApp = serviceAccount?.projectId && serviceAccount?.clientEmail && serviceAccount?.privateKey
    ? initializeApp({ credential: cert(serviceAccount as any) })
    : initializeApp();

  return adminApp;
}

const checkLimitSchema = z.object({
  action: z.enum(['create', 'publish', 'reactivate']),
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
    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    const app = getAdminApp();
    const auth = getAuth(app);
    const db = getFirestore(app);

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

    // Validate request body
    const body = await request.json();
    const validation = validateRequest(checkLimitSchema, body);
    if (!validation.success) {
      return json(
        { error: validation.error, details: validation.details?.errors },
        { status: 400 }
      );
    }

    const { action } = validation.data;

    // Get user's plan
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data()!;
    
    // Determine effective plan (admin override takes precedence)
    let planId = userData?.adminPlanOverride || userData?.subscriptionPlan || 'free';
    
    // If subscription is past_due or canceled, revert to free (unless admin override)
    if (!userData?.adminPlanOverride) {
      const subscriptionStatus = userData?.subscriptionStatus;
      if (subscriptionStatus === 'past_due' || subscriptionStatus === 'canceled' || subscriptionStatus === 'unpaid') {
        planId = 'free';
      }
    }

    const planConfig = getPlanConfig(planId);

    // Count active listings (status === 'active')
    //
    // IMPORTANT: Avoid composite-index requirements here. Firestore may require a composite
    // index for (sellerId + status). We keep this endpoint "always works" by querying only
    // by sellerId and filtering client-side.
    const listingsRef = db.collection('listings');
    const sellerListingsSnap = await listingsRef.where('sellerId', '==', userId).get();
    let activeListingsCount = 0;
    sellerListingsSnap.forEach((doc) => {
      const data = doc.data();
      if (data?.status === 'active') activeListingsCount++;
    });

    // Check if user can create more listings
    const canCreate = canCreateListing(planId, activeListingsCount);
    const limit = getPlanListingLimit(planId);
    const remainingSlots = hasUnlimitedListings(planId) ? null : Math.max(0, (limit || 0) - activeListingsCount);

    return json({
      canCreate,
      planId,
      planDisplayName: planConfig.displayName,
      activeListingsCount,
      listingLimit: limit,
      remainingSlots,
      isUnlimited: hasUnlimitedListings(planId),
      feePercent: userData?.adminFeeOverride ?? planConfig.takeRate,
      message: canCreate
        ? undefined
        : `You've reached your ${planConfig.displayName} plan limit of ${limit} active listings. Upgrade to create more listings.`,
    });
  } catch (error: any) {
    if (error?.code === 'FIREBASE_ADMIN_NOT_CONFIGURED') {
      logError('Firebase Admin not configured for check-limit', error, {
        route: '/api/listings/check-limit',
        missing: error?.missing,
      });
      return json(
        {
          error: 'Service temporarily unavailable',
          message: 'Server is missing Firebase Admin credentials. Please contact support.',
        },
        { status: 503 }
      );
    }

    logError('Error checking listing limit', error, {
      route: '/api/listings/check-limit',
    });
    captureException(error instanceof Error ? error : new Error(String(error)), {
      route: '/api/listings/check-limit',
    });
    return json(
      { error: 'Failed to check listing limit', message: error.message },
      { status: 500 }
    );
  }
}
