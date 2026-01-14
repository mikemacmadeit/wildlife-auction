/**
 * POST /api/stripe/billing-portal/create
 * 
 * Create a Stripe Billing Portal session for managing subscription
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { stripe, isStripeConfigured, getAppUrl } from '@/lib/stripe/config';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
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

export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured() || !stripe) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 503 }
      );
    }

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(rateLimitResult.body, { 
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    // Auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;

    // Get or create Stripe Customer
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    let customerId = userData?.stripeCustomerId;

    if (!customerId) {
      // Create Stripe Customer if doesn't exist
      if (!userEmail) {
        return NextResponse.json({ error: 'User email required' }, { status: 400 });
      }

      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          userId: userId,
        },
      });
      customerId = customer.id;

      // Save customer ID to user doc
      await userRef.set({ stripeCustomerId: customerId }, { merge: true });
    }

    // Create Billing Portal session
    const baseUrl = getAppUrl();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/seller/settings`,
    });

    // Create audit log
    await createAuditLog(db, {
      actorUid: userId,
      actorRole: 'seller',
      actionType: 'billing_portal_accessed',
      beforeState: {},
      afterState: {},
      metadata: {
        customerId,
        portalSessionId: portalSession.id,
      },
      source: 'admin_ui',
    });

    logInfo('Billing portal session created', {
      route: '/api/stripe/billing-portal/create',
      userId,
      customerId,
      portalSessionId: portalSession.id,
    });

    return NextResponse.json({
      url: portalSession.url,
    });
  } catch (error: any) {
    logError('Error creating billing portal session', error, {
      route: '/api/stripe/billing-portal/create',
    });
    captureException(error instanceof Error ? error : new Error(String(error)), {
      route: '/api/stripe/billing-portal/create',
    });
    return NextResponse.json(
      { error: 'Failed to create billing portal session', message: error.message },
      { status: 500 }
    );
  }
}
