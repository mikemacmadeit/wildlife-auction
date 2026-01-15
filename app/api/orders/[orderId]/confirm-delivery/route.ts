/**
 * POST /api/orders/[orderId]/confirm-delivery
 * 
 * Admin-only endpoint to confirm delivery and start protection window
 * Sets deliveryConfirmedAt, protectionStartAt, and protectionEndsAt
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
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

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    const { auth, db } = await initializeFirebaseAdmin();

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
    }

    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const adminId = decodedToken.uid;

    // Verify admin role
    const adminUserRef = db.collection('users').doc(adminId);
    const adminUserDoc = await adminUserRef.get();
    
    if (!adminUserDoc.exists) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    const adminUserData = adminUserDoc.data();
    const isAdmin = adminUserData?.role === 'admin' || adminUserData?.role === 'super_admin';
    
    if (!isAdmin) {
      return json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const orderId = params.orderId;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Validate order status
    if (orderData.status !== 'paid' && orderData.status !== 'in_transit' && orderData.status !== 'delivered') {
      return json(
        { 
          error: 'Invalid order status',
          details: `Cannot confirm delivery for order with status '${orderData.status}'`
        },
        { status: 400 }
      );
    }

    // Check if already confirmed
    if (orderData.deliveryConfirmedAt) {
      return json({ error: 'Delivery already confirmed' }, { status: 400 });
    }

    const now = new Date();
    const protectedDays = orderData.protectedTransactionDaysSnapshot;
    
    // Calculate protection window if protected transaction is enabled
    let protectionStartAt = null;
    let protectionEndsAt = null;
    
    if (protectedDays && (protectedDays === 7 || protectedDays === 14)) {
      protectionStartAt = now;
      protectionEndsAt = new Date(now.getTime() + protectedDays * 24 * 60 * 60 * 1000);
    }

    // Update order
    const updateData: any = {
      deliveryConfirmedAt: now,
      deliveredAt: now, // Also set deliveredAt for consistency
      status: 'delivered',
      updatedAt: now,
      lastUpdatedByRole: 'admin',
    };

    if (protectionStartAt) {
      updateData.protectionStartAt = protectionStartAt;
      updateData.protectionEndsAt = protectionEndsAt;
      updateData.payoutHoldReason = 'protection_window';
    }

    // Reset dispute status if it was set before delivery confirmation
    if (orderData.protectedDisputeStatus && orderData.protectedDisputeStatus !== 'none') {
      // Keep existing dispute if any, but this shouldn't happen before delivery
      // For safety, we'll leave it as is
    } else {
      updateData.protectedDisputeStatus = 'none';
    }

    // Capture before state for audit
    const beforeState = {
      deliveryConfirmedAt: orderData.deliveryConfirmedAt,
      status: orderData.status,
      protectionStartAt: orderData.protectionStartAt,
      protectionEndsAt: orderData.protectionEndsAt,
      payoutHoldReason: orderData.payoutHoldReason,
    };

    await orderRef.update(updateData);

    // Create audit log
    await createAuditLog(db, {
      actorUid: adminId,
      actorRole: 'admin',
      actionType: 'delivery_confirmed',
      orderId: orderId,
      listingId: orderData.listingId,
      beforeState,
      afterState: {
        deliveryConfirmedAt: updateData.deliveryConfirmedAt,
        status: updateData.status,
        protectionStartAt: updateData.protectionStartAt,
        protectionEndsAt: updateData.protectionEndsAt,
        payoutHoldReason: updateData.payoutHoldReason,
      },
      metadata: {
        protectedDays: protectedDays || undefined,
      },
      source: 'admin_ui',
    });

    // Send delivery confirmation email to buyer
    try {
      const buyerDoc = await db.collection('users').doc(orderData.buyerId).get();
      const buyerEmail = buyerDoc.data()?.email;
      const buyerName = buyerDoc.data()?.displayName || buyerDoc.data()?.profile?.fullName || 'Customer';
      
      // Get listing title
      const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = listingDoc.data()?.title || 'Unknown Listing';
      
      if (buyerEmail) {
        const { sendDeliveryConfirmationEmail } = await import('@/lib/email/sender');
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}` 
          : 'http://localhost:3000';
        
        await sendDeliveryConfirmationEmail(buyerEmail, {
          buyerName,
          orderId,
          listingTitle,
          deliveryDate: now,
          orderUrl: `${baseUrl}/dashboard/orders/${orderId}`,
        });
      }
    } catch (emailError) {
      // Don't fail the confirmation if email fails
      console.error('Error sending delivery confirmation email:', emailError);
    }

    return json({
      success: true,
      orderId,
      deliveryConfirmedAt: now,
      protectionStartAt,
      protectionEndsAt,
      message: 'Delivery confirmed. Protection window started.',
    });
  } catch (error: any) {
    console.error('Error confirming delivery:', error);
    return json({ error: 'Failed to confirm delivery', message: error.message }, { status: 500 });
  }
}
