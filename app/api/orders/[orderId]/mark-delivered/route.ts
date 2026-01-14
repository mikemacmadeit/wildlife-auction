/**
 * POST /api/orders/[orderId]/mark-delivered
 * 
 * Seller marks order as delivered
 * Transitions: paid/in_transit → delivered
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { OrderStatus } from '@/lib/types';
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

const markDeliveredSchema = z.object({
  deliveryProofUrls: z.array(z.string().url()).optional(),
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

    const sellerId = decodedToken.uid;
    const orderId = params.orderId;

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      body = {}; // Optional body
    }

    const validation = markDeliveredSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { deliveryProofUrls } = validation.data;

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

    // Verify seller owns this order
    if (orderData.sellerId !== sellerId) {
      return NextResponse.json(
        { error: 'Unauthorized - You can only mark your own orders as delivered' },
        { status: 403 }
      );
    }

    // Validate status transition
    const currentStatus = orderData.status as OrderStatus;
    const allowedStatuses: OrderStatus[] = ['paid', 'in_transit'];
    
    if (!allowedStatuses.includes(currentStatus)) {
      return NextResponse.json(
        { 
          error: 'Invalid status transition',
          details: `Cannot mark delivered for order with status '${currentStatus}'. Order must be in one of: ${allowedStatuses.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Check if already delivered or beyond
    if (['delivered', 'accepted', 'completed', 'disputed'].includes(currentStatus)) {
      return NextResponse.json(
        { error: `Order is already ${currentStatus}` },
        { status: 400 }
      );
    }

    // Update order to delivered
    const now = new Date();
    const updateData: any = {
      status: 'delivered' as OrderStatus,
      deliveredAt: now,
      updatedAt: now,
      lastUpdatedByRole: 'seller',
    };

    if (deliveryProofUrls && deliveryProofUrls.length > 0) {
      updateData.deliveryProofUrls = deliveryProofUrls;
    }

    await orderRef.update(updateData);

    return NextResponse.json({
      success: true,
      orderId,
      status: 'delivered',
      deliveredAt: now,
      message: 'Order marked as delivered. Buyer can now accept or dispute.',
    });
  } catch (error: any) {
    console.error('Error marking order as delivered:', error);
    return NextResponse.json(
      { error: 'Failed to mark order as delivered', message: error.message },
      { status: 500 }
    );
  }
}
