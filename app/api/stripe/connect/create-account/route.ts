/**
 * POST /api/stripe/connect/create-account
 * 
 * Creates a Stripe Connect Express account for the authenticated user
 * Returns the Stripe account ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { stripe } from '@/lib/stripe/config';

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
      // Try Application Default Credentials or serviceAccountKey.json
      try {
        adminApp = initializeApp({
          credential: cert(require('../../../../serviceAccountKey.json')),
        });
      } catch {
        adminApp = initializeApp();
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

    // Check if user already has a Stripe account
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData?.stripeAccountId) {
        return NextResponse.json({
          stripeAccountId: userData.stripeAccountId,
          message: 'Stripe account already exists',
        });
      }
    }

    // Create Stripe Connect Express account
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US', // Default to US, can be made configurable
      email: decodedToken.email || undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // Save Stripe account ID to user document
    const updateData: any = {
      stripeAccountId: account.id,
      stripeOnboardingStatus: 'pending',
      chargesEnabled: false,
      payoutsEnabled: false,
      stripeDetailsSubmitted: false,
      updatedAt: new Date(),
    };

    if (userDoc.exists()) {
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

    return NextResponse.json({
      stripeAccountId: account.id,
      message: 'Stripe account created successfully',
    });
  } catch (error: any) {
    console.error('Error creating Stripe account:', error);
    return NextResponse.json(
      {
        error: 'Failed to create Stripe account',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
