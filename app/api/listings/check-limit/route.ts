/**
 * POST /api/listings/check-limit
 * 
 * Exposure Plans model: listing limits are NOT enforced.
 * This endpoint is kept for backward compatibility with older clients.
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
import { PLAN_CONFIG, MARKETPLACE_FEE_PERCENT } from '@/lib/pricing/plans';
import { getEffectiveSubscriptionTier, mapTierToLegacyPlanId } from '@/lib/pricing/subscriptions';
import { logInfo, logWarn, logError } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';

// Lazy Firebase Admin init (avoid slow/hanging ADC attempts during cold starts if env isn't configured)
let adminApp: App | null = null;
function normalizePrivateKey(v: string | undefined): string | undefined {
  if (!v) return undefined;
  let s = v.trim();
  // Netlify UI sometimes results in quoted values; strip one pair of matching quotes.
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.replace(/\\n/g, '\n');
}
function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

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
