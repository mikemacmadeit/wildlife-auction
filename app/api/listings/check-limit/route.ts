/**
 * POST /api/listings/check-limit
 * 
 * Seller Tiers model: listing limits are NOT enforced.
 * This endpoint is kept for backward compatibility with older clients.
 */

// IMPORTANT:
// Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, dev bundling can attempt to resolve a missing internal Next module
// (`next/dist/server/web/exports/next-response`) and crash compilation.
// Route handlers work fine with standard Web `Request` / `Response`.
import { validateRequest } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { PLAN_CONFIG, MARKETPLACE_FEE_PERCENT } from '@/lib/pricing/plans';
import { getEffectiveSubscriptionTier, mapTierToLegacyPlanId } from '@/lib/pricing/subscriptions';
import { logInfo, logWarn, logError } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

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

    const auth = getAdminAuth();
    const db = getAdminDb();

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

    // Get user (tier snapshot)
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data()!;

    const tier = getEffectiveSubscriptionTier(userData as any);
    const planConfig = PLAN_CONFIG[tier];

    return json({
      canCreate: true,
      action,
      // Backward compatibility fields
      planId: mapTierToLegacyPlanId(tier),
      planDisplayName: planConfig.displayName,
      // New canonical field
      subscriptionTier: tier,
      activeListingsCount: null,
      listingLimit: null,
      remainingSlots: null,
      isUnlimited: true,
      feePercent: MARKETPLACE_FEE_PERCENT,
      message: undefined,
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

    logError('Error checking listing limit (legacy endpoint)', error, {
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
