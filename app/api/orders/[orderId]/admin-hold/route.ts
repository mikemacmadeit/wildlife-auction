/**
 * POST /api/orders/[orderId]/admin-hold
 * 
 * Admin-only endpoint to place or remove admin hold on an order
 * Prevents auto-release even if deadline passed
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { validateRequest, adminHoldSchema } from '@/lib/validation/api-schemas';
import { createAuditLog } from '@/lib/audit/logger';

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
    const body = await request.json();
    const validation = validateRequest(adminHoldSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error, details: validation.details?.errors },
        { status: 400 }
      );
    }

    const { hold, reason, notes } = validation.data;
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

    // Check if already released
    if (orderData.stripeTransferId) {
      return NextResponse.json(
        { error: 'Cannot modify hold on order after funds have been released' },
        { status: 400 }
      );
    }

    // Capture before state for audit
    const beforeState = {
      adminHold: orderData.adminHold,
      adminHoldReason: orderData.adminHoldReason,
    };

    // Update admin hold
    const now = new Date();
    const updateData: any = {
      adminHold: hold,
      updatedAt: now,
      lastUpdatedByRole: 'admin',
      adminHoldReason: reason,
    };

    // Store admin action notes
    if (notes) {
      const existingNotes = orderData.adminActionNotes || [];
      updateData.adminActionNotes = [
        ...existingNotes,
        {
          reason,
          notes,
          actorUid: adminId,
          createdAt: Timestamp.now(),
          action: hold ? 'hold_placed' : 'hold_removed',
        },
      ];
    }

    await orderRef.update(updateData);

    // Create audit log
    await createAuditLog(db, {
      actorUid: adminId,
      actorRole: 'admin',
      actionType: hold ? 'admin_hold_placed' : 'admin_hold_removed',
      orderId: orderId,
      listingId: orderData.listingId,
      beforeState,
      afterState: {
        adminHold: hold,
        adminHoldReason: reason || undefined,
      },
      metadata: {
        reason,
        notes: notes || undefined,
      },
      source: 'admin_ui',
    });

    return NextResponse.json({
      success: true,
      orderId,
      adminHold: hold,
      message: hold ? 'Admin hold placed on order' : 'Admin hold removed from order',
    });
  } catch (error: any) {
    console.error('Error updating admin hold:', error);
    return NextResponse.json(
      { error: 'Failed to update admin hold', message: error.message },
      { status: 500 }
    );
  }
}
