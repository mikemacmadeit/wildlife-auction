/**
 * POST /api/stripe/transfers/release
 * 
 * Admin-only endpoint to release escrow funds to seller
 * Creates a Stripe transfer to the seller's connected account
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { validateRequest, releasePaymentSchema } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { releasePaymentForOrder } from '@/lib/stripe/release-payment';

// Initialize Firebase Admin (if not already initialized)
let adminApp: App | undefined;
let auth: ReturnType<typeof getAuth>;
let db: ReturnType<typeof getFirestore>;

async function initializeFirebaseAdmin() {
  if (!adminApp) {
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
  }
  auth = getAuth(adminApp);
  db = getFirestore(adminApp);
  return { auth, db };
}

export async function POST(request: NextRequest) {
  try {
    const { auth, db } = await initializeFirebaseAdmin();

    if (!isStripeConfigured() || !stripe) {
      return NextResponse.json(
        { error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.' },
        { status: 503 }
      );
    }

    // Rate limiting (admin operations - very restrictive)
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
    const rateLimitResult = await rateLimitCheck(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(rateLimitResult.body, { 
        status: rateLimitResult.status,
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
    }

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
    } catch (error: any) {
      console.error('Token verification error:', error?.code || error?.message || error);
      return NextResponse.json(
        {
          error: 'Unauthorized - Invalid token',
          details: error?.code || error?.message || 'Token verification failed'
        },
        { status: 401 }
      );
    }

    const adminId = decodedToken.uid;

    // Verify admin role
    const adminUserRef = db.collection('users').doc(adminId);
    const adminUserDoc = await adminUserRef.get();
    
    if (!adminUserDoc.exists) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const adminUserData = adminUserDoc.data();
    const isAdmin = adminUserData?.role === 'admin' || adminUserData?.role === 'super_admin';
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Validate request body
    const validation = validateRequest(releasePaymentSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error, details: validation.details?.errors },
        { status: 400 }
      );
    }

    const { orderId } = validation.data;

    // Use shared release function
    const result = await releasePaymentForOrder(db, orderId, adminId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to release payment' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      transferId: result.transferId,
      amount: result.amount,
      message: result.message || 'Payment released successfully',
    });
  } catch (error: any) {
    console.error('Error releasing payment:', error);
    return NextResponse.json(
      {
        error: 'Failed to release payment',
        message: error.message || error.toString() || 'Unknown error',
        code: error?.code,
        type: error?.type,
      },
      { status: 500 }
    );
  }
}
