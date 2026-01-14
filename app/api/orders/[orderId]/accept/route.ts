/**
 * POST /api/orders/[orderId]/accept
 * 
 * Buyer confirms receipt and accepts the order
 * Transitions: paid/in_transit/delivered → accepted
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { OrderStatus } from '@/lib/types';

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
        { error: 'Unauthorized - You can only accept your own orders' },
        { status: 403 }
      );
    }

    // Validate status transition
    const currentStatus = orderData.status as OrderStatus;
    const allowedStatuses: OrderStatus[] = ['paid', 'in_transit', 'delivered'];
    
    if (!allowedStatuses.includes(currentStatus)) {
      return NextResponse.json(
        { 
          error: 'Invalid status transition',
          details: `Cannot accept order with status '${currentStatus}'. Order must be in one of: ${allowedStatuses.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Check if already disputed
    if (currentStatus === 'disputed') {
      return NextResponse.json(
        { error: 'Cannot accept a disputed order. Please wait for admin resolution.' },
        { status: 400 }
      );
    }

    // Check if already accepted
    if (currentStatus === 'accepted') {
      return NextResponse.json(
        { error: 'Order already accepted' },
        { status: 400 }
      );
    }

    // Check if delivery was confirmed (required for protected transactions)
    if (!orderData.deliveryConfirmedAt) {
      return NextResponse.json(
        { 
          error: 'Delivery not confirmed',
          details: 'Delivery must be confirmed before buyer can accept. Please wait for delivery confirmation.'
        },
        { status: 400 }
      );
    }

    // Update order to accepted
    const now = new Date();
    const updateData: any = {
      status: 'accepted' as OrderStatus,
      acceptedAt: now,
      buyerAcceptedAt: now, // Protected transaction field
      updatedAt: now,
      lastUpdatedByRole: 'buyer',
    };

    // If protected transaction and no open dispute, mark as ready to release
    if (orderData.protectedTransactionDaysSnapshot && 
        (!orderData.protectedDisputeStatus || orderData.protectedDisputeStatus === 'none')) {
      updateData.status = 'ready_to_release';
      updateData.payoutHoldReason = 'none';
    }

    await orderRef.update(updateData);

    return NextResponse.json({
      success: true,
      orderId,
      status: updateData.status,
      acceptedAt: now,
      message: updateData.status === 'ready_to_release' 
        ? 'Order accepted. Funds will be released to seller.'
        : 'Order accepted successfully. Funds will be released to seller.',
    });
  } catch (error: any) {
    console.error('Error accepting order:', error);
    return NextResponse.json(
      { error: 'Failed to accept order', message: error.message },
      { status: 500 }
    );
  }
}
