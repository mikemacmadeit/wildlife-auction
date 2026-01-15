/**
 * POST /api/orders/[orderId]/disputes/cancel
 * 
 * Buyer cancels their dispute
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
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
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

    const buyerId = decodedToken.uid;
    const orderId = params.orderId;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Verify buyer owns this order
    if (orderData.buyerId !== buyerId) {
      return json({ error: 'Unauthorized - You can only cancel disputes on your own orders' }, { status: 403 });
    }

    // Check if dispute exists and is cancellable
    if (!orderData.protectedDisputeStatus || 
        orderData.protectedDisputeStatus === 'none' ||
        orderData.protectedDisputeStatus === 'cancelled' ||
        orderData.protectedDisputeStatus === 'resolved_refund' ||
        orderData.protectedDisputeStatus === 'resolved_partial_refund' ||
        orderData.protectedDisputeStatus === 'resolved_release') {
      return json({ error: 'Dispute cannot be cancelled' }, { status: 400 });
    }

    // Determine new payout hold reason
    let payoutHoldReason = 'none';
    if (orderData.protectedTransactionDaysSnapshot && orderData.protectionEndsAt) {
      const protectionEnds = orderData.protectionEndsAt.toDate();
      if (protectionEnds.getTime() > Date.now()) {
        payoutHoldReason = 'protection_window';
      }
    }

    // Capture before state for audit
    const beforeState = {
      protectedDisputeStatus: orderData.protectedDisputeStatus,
      payoutHoldReason: orderData.payoutHoldReason,
    };

    // Update order
    await orderRef.update({
      protectedDisputeStatus: 'cancelled',
      payoutHoldReason: payoutHoldReason,
      updatedAt: new Date(),
      lastUpdatedByRole: 'buyer',
    });

    // Create audit log
    await createAuditLog(db, {
      actorUid: buyerId,
      actorRole: 'buyer',
      actionType: 'dispute_cancelled',
      orderId: orderId,
      listingId: orderData.listingId,
      beforeState,
      afterState: {
        protectedDisputeStatus: 'cancelled',
        payoutHoldReason: payoutHoldReason,
      },
      source: 'buyer_ui',
    });

    return json({
      success: true,
      orderId,
      message: 'Dispute cancelled successfully.',
    });
  } catch (error: any) {
    console.error('Error cancelling dispute:', error);
    return json({ error: 'Failed to cancel dispute', message: error.message }, { status: 500 });
  }
}
