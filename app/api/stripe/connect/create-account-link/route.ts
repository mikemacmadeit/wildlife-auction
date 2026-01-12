/**
 * POST /api/stripe/connect/create-account-link
 * 
 * Creates an onboarding link for the authenticated user's Stripe Connect account
 * Returns the onboarding URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { stripe, getAppUrl } from '@/lib/stripe/config';

// Initialize Firebase Admin (if not already initialized)
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
      try {
        // Try Application Default Credentials (for production)
        adminApp = initializeApp();
      } catch {
        throw new Error('Failed to initialize Firebase Admin SDK');
      }
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
    // Get Firebase Auth token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid token' },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;

    // Get user's Stripe account ID
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    const stripeAccountId = userData?.stripeAccountId;

    if (!stripeAccountId) {
      return NextResponse.json(
        { error: 'Stripe account not found. Please create an account first.' },
        { status: 400 }
      );
    }

    // Create account link for onboarding
    const baseUrl = getAppUrl();
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseUrl}/seller/payouts?onboarding=restart`,
      return_url: `${baseUrl}/seller/payouts?onboarding=complete`,
      type: 'account_onboarding',
    });

    return NextResponse.json({
      url: accountLink.url,
      message: 'Onboarding link created successfully',
    });
  } catch (error: any) {
    console.error('Error creating account link:', error);
    return NextResponse.json(
      {
        error: 'Failed to create onboarding link',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
