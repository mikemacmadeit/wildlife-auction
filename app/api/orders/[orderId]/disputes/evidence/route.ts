/**
 * POST /api/orders/[orderId]/disputes/evidence
 * 
 * Buyer adds evidence to an existing dispute
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { DisputeEvidence } from '@/lib/types';
import { z } from 'zod';

// Initialize Firebase Admin
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
          adminApp = initializeApp();
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

const evidenceSchema = z.object({
  type: z.enum(['photo', 'video', 'vet_report', 'delivery_doc', 'tag_microchip']),
  url: z.string().url(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const { auth, db } = await initializeFirebaseAdmin();

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
    }

    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const buyerId = decodedToken.uid;
    const orderId = params.orderId;

    // Parse and validate request body
    const body = await request.json();
    const validation = evidenceSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { type, url } = validation.data;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    const orderData = orderDoc.data()!;

    // Verify buyer owns this order
    if (orderData.buyerId !== buyerId) {
      return NextResponse.json(
        { error: 'Unauthorized - You can only add evidence to your own orders' },
        { status: 403 }
      );
    }

    // Check if dispute exists
    if (!orderData.protectedDisputeStatus || orderData.protectedDisputeStatus === 'none') {
      return NextResponse.json(
        { error: 'No open dispute for this order' },
        { status: 400 }
      );
    }

    // Get existing evidence
    const existingEvidence: DisputeEvidence[] = orderData.protectedDisputeEvidence || [];
    
    // Add new evidence
    const newEvidence: DisputeEvidence = {
      type,
      url,
      uploadedAt: new Date(),
    };

    const updatedEvidence = [...existingEvidence, newEvidence];

    // Check if vet report is now provided (for needs_evidence status)
    const hasVetReport = updatedEvidence.some(e => e.type === 'vet_report');
    const needsVetReport = (orderData.protectedDisputeReason === 'death' || 
                           orderData.protectedDisputeReason === 'serious_illness');
    
    const newStatus = (orderData.protectedDisputeStatus === 'needs_evidence' && hasVetReport && needsVetReport)
      ? 'open'
      : orderData.protectedDisputeStatus;

    // Update order
    await orderRef.update({
      protectedDisputeEvidence: updatedEvidence,
      protectedDisputeStatus: newStatus,
      updatedAt: new Date(),
      lastUpdatedByRole: 'buyer',
    });

    return NextResponse.json({
      success: true,
      orderId,
      evidenceCount: updatedEvidence.length,
      disputeStatus: newStatus,
      message: 'Evidence added successfully.',
    });
  } catch (error: any) {
    console.error('Error adding evidence:', error);
    return NextResponse.json(
      { error: 'Failed to add evidence', message: error.message },
      { status: 500 }
    );
  }
}
