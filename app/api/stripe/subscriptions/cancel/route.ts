/**
 * POST /api/stripe/subscriptions/cancel
 * 
 * Cancel a Stripe subscription (at period end or immediately)
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { validateRequest } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { logInfo, logError } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';
import { createAuditLog } from '@/lib/audit/logger';

// Initialize Firebase Admin
let adminApp: App;
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
      adminApp = initializeApp();
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    throw error;
  }
} else {
  adminApp = getApps()[0];
}

const auth = getAuth(adminApp);
const db = getFirestore(adminApp);

const cancelSubscriptionSchema = z.object({
  immediately: z.boolean().optional().default(false), // If true, cancel immediately; if false, cancel at period end
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

    // Validate request body
    const body = await request.json();
    const validation = validateRequest(cancelSubscriptionSchema, body);
    if (!validation.success) {
      return json({ error: validation.error, details: validation.details?.errors }, { status: 400 });
    }

    const { immediately } = validation.data;

    // Get user's subscription
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data()!;
    const subscriptionId = userData?.stripeSubscriptionId;

    if (!subscriptionId) {
      return json({ error: 'No active subscription found' }, { status: 400 });
    }

    // Cancel subscription in Stripe
    const subscription = immediately
      ? await stripe.subscriptions.cancel(subscriptionId)
      : await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });

    // Update user doc
    const updateData: any = {
      subscriptionStatus: subscription.status,
      subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      updatedAt: Timestamp.now(),
    };

    // If canceled immediately, revert to Standard tier
    if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
      updateData.subscriptionTier = 'standard';
      updateData.subscriptionPlan = 'free'; // legacy
      updateData.subscriptionStatus = 'canceled';
    }

    await userRef.update(updateData);

    // Create audit log
    await createAuditLog(db, {
      actorUid: userId,
      actorRole: 'seller',
      actionType: 'subscription_canceled',
      beforeState: {
        subscriptionPlan: userData?.subscriptionPlan || 'free',
        subscriptionStatus: userData?.subscriptionStatus,
      },
      afterState: {
        subscriptionPlan: updateData.subscriptionPlan || userData?.subscriptionPlan,
        subscriptionStatus: updateData.subscriptionStatus,
      },
      metadata: {
        subscriptionId,
        immediately,
      },
      source: 'admin_ui',
    });

    return json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      canceledAtPeriodEnd: subscription.cancel_at_period_end || false,
      message: immediately
        ? 'Subscription canceled immediately'
        : 'Subscription will cancel at period end',
    });
  } catch (error: any) {
    logError('Error canceling subscription', error, {
      route: '/api/stripe/subscriptions/cancel',
    });
    captureException(error instanceof Error ? error : new Error(String(error)), {
      route: '/api/stripe/subscriptions/cancel',
    });
    return json({ error: 'Failed to cancel subscription', message: error.message }, { status: 500 });
  }
}
