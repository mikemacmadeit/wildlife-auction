/**
 * GET /api/admin/reconcile
 * 
 * Admin-only endpoint to reconcile Stripe data with Firestore orders
 * Identifies mismatches and discrepancies
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, dev bundling can attempt to resolve a missing internal Next module
// (`next/dist/server/web/exports/next-response`) and crash compilation.
// Route handlers work fine with standard Web `Request` / `Response`.
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';

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

interface ReconciliationIssue {
  type: string;
  severity: 'error' | 'warning';
  orderId?: string;
  listingId?: string;
  stripeId?: string;
  description: string;
  firestoreData?: any;
  stripeData?: any;
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

export async function GET(request: Request) {
  try {
    const { auth, db } = await initializeFirebaseAdmin();

    if (!isStripeConfigured() || !stripe) {
      return json({ error: 'Stripe is not configured' }, { status: 503 });
    }

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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const listingId = searchParams.get('listingId');
    const buyerEmail = searchParams.get('buyerEmail');
    const sellerEmail = searchParams.get('sellerEmail');
    const paymentIntentId = searchParams.get('paymentIntentId');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    console.log(`[reconcile] Starting reconciliation check by admin ${adminId}`);

    const issues: ReconciliationIssue[] = [];

    // 1. Fetch recent Firestore orders
    let ordersQuery = db.collection('orders').orderBy('createdAt', 'desc').limit(limit);
    
    if (orderId) {
      ordersQuery = db.collection('orders').where('__name__', '==', orderId).limit(1) as any;
    } else if (paymentIntentId) {
      ordersQuery = db.collection('orders').where('stripePaymentIntentId', '==', paymentIntentId).limit(1) as any;
    }

    const ordersSnapshot = await ordersQuery.get();
    // Firestore Admin SDK returns loosely-typed document data; cast to `any` for reconciliation tooling.
    const orders: any[] = ordersSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));

    console.log(`[reconcile] Found ${orders.length} orders in Firestore`);

    // 2. For each order, check Stripe objects
    for (const order of orders) {
      const orderId = order.id;
      const paymentIntentId = order.stripePaymentIntentId;
      const checkoutSessionId = order.stripeCheckoutSessionId;
      const transferId = order.stripeTransferId;
      const refundId = order.stripeRefundId;

      // Check PaymentIntent exists in Stripe
      if (paymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          
          // Check amount matches
          const stripeAmount = paymentIntent.amount / 100;
          if (Math.abs(stripeAmount - order.amount) > 0.01) {
            issues.push({
              type: 'amount_mismatch',
              severity: 'error',
              orderId,
              listingId: order.listingId,
              stripeId: paymentIntentId,
              description: `Amount mismatch: Firestore $${order.amount} vs Stripe $${stripeAmount}`,
              firestoreData: { amount: order.amount },
              stripeData: { amount: stripeAmount },
            });
          }

          // Check status matches
          if (paymentIntent.status === 'succeeded' && order.status === 'pending') {
            issues.push({
              type: 'status_mismatch',
              severity: 'error',
              orderId,
              listingId: order.listingId,
              stripeId: paymentIntentId,
              description: `PaymentIntent succeeded but order status is ${order.status}`,
              firestoreData: { status: order.status },
              stripeData: { status: paymentIntent.status },
            });
          }
        } catch (error: any) {
          if (error.code === 'resource_missing') {
            issues.push({
              type: 'payment_intent_missing',
              severity: 'error',
              orderId,
              listingId: order.listingId,
              stripeId: paymentIntentId,
              description: `PaymentIntent ${paymentIntentId} not found in Stripe`,
              firestoreData: { paymentIntentId },
            });
          } else {
            console.error(`[reconcile] Error checking PaymentIntent ${paymentIntentId}:`, error);
          }
        }
      }

      // Check Transfer exists if order is completed
      if (order.status === 'completed' && transferId) {
        try {
          const transfer = await stripe.transfers.retrieve(transferId);
          
          // Check amount matches
          const stripeAmount = transfer.amount / 100;
          if (Math.abs(stripeAmount - order.sellerAmount) > 0.01) {
            issues.push({
              type: 'transfer_amount_mismatch',
              severity: 'error',
              orderId,
              listingId: order.listingId,
              stripeId: transferId,
              description: `Transfer amount mismatch: Firestore $${order.sellerAmount} vs Stripe $${stripeAmount}`,
              firestoreData: { sellerAmount: order.sellerAmount },
              stripeData: { amount: stripeAmount },
            });
          }
        } catch (error: any) {
          if (error.code === 'resource_missing') {
            issues.push({
              type: 'transfer_missing',
              severity: 'error',
              orderId,
              listingId: order.listingId,
              stripeId: transferId,
              description: `Transfer ${transferId} not found in Stripe but order is completed`,
              firestoreData: { transferId, status: order.status },
            });
          }
        }
      } else if (order.status === 'completed' && !transferId) {
        issues.push({
          type: 'completed_without_transfer',
          severity: 'error',
          orderId,
          listingId: order.listingId,
          description: `Order marked completed but no transfer ID found`,
          firestoreData: { status: order.status, stripeTransferId: order.stripeTransferId },
        });
      }

      // Check Refund exists if order is refunded
      if (order.status === 'refunded' && refundId) {
        try {
          const refund = await stripe.refunds.retrieve(refundId);
          
          // Check amount matches
          const stripeAmount = refund.amount / 100;
          const expectedRefund = order.refundAmount || order.amount;
          if (Math.abs(stripeAmount - expectedRefund) > 0.01) {
            issues.push({
              type: 'refund_amount_mismatch',
              severity: 'error',
              orderId,
              listingId: order.listingId,
              stripeId: refundId,
              description: `Refund amount mismatch: Firestore $${expectedRefund} vs Stripe $${stripeAmount}`,
              firestoreData: { refundAmount: expectedRefund },
              stripeData: { amount: stripeAmount },
            });
          }
        } catch (error: any) {
          if (error.code === 'resource_missing') {
            issues.push({
              type: 'refund_missing',
              severity: 'error',
              orderId,
              listingId: order.listingId,
              stripeId: refundId,
              description: `Refund ${refundId} not found in Stripe but order is refunded`,
              firestoreData: { refundId, status: order.status },
            });
          }
        }
      }

      // Check Checkout Session exists
      if (checkoutSessionId) {
        try {
          const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
          if (session.payment_status !== 'paid' && order.status === 'paid') {
            issues.push({
              type: 'checkout_session_status_mismatch',
              severity: 'warning',
              orderId,
              listingId: order.listingId,
              stripeId: checkoutSessionId,
              description: `Checkout session payment_status is ${session.payment_status} but order is paid`,
              firestoreData: { status: order.status },
              stripeData: { payment_status: session.payment_status },
            });
          }
        } catch (error: any) {
          if (error.code === 'resource_missing') {
            issues.push({
              type: 'checkout_session_missing',
              severity: 'warning',
              orderId,
              listingId: order.listingId,
              stripeId: checkoutSessionId,
              description: `Checkout session ${checkoutSessionId} not found in Stripe`,
              firestoreData: { checkoutSessionId },
            });
          }
        }
      }
    }

    // 3. Check for Stripe payments without Firestore orders (recent only)
    try {
      const recentPaymentIntents = await stripe.paymentIntents.list({
        limit: 50,
        created: {
          gte: Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000), // Last 7 days
        },
      });

      for (const pi of recentPaymentIntents.data) {
        if (pi.status === 'succeeded' && pi.metadata?.orderId) {
          // Check if order exists
          const orderDoc = await db.collection('orders').doc(pi.metadata.orderId).get();
          if (!orderDoc.exists) {
            issues.push({
              type: 'stripe_paid_no_order',
              severity: 'error',
              orderId: pi.metadata.orderId,
              stripeId: pi.id,
              description: `PaymentIntent ${pi.id} succeeded but order ${pi.metadata.orderId} not found in Firestore`,
              stripeData: {
                paymentIntentId: pi.id,
                amount: pi.amount / 100,
                metadata: pi.metadata,
              },
            });
          }
        }
      }
    } catch (error: any) {
      console.error(`[reconcile] Error checking Stripe PaymentIntents:`, error);
    }

    // 4. Check for chargebacks without order holds
    try {
      const chargebacksSnapshot = await db.collection('chargebacks')
        .where('status', 'in', ['warning_needs_response', 'warning_closed', 'needs_response', 'under_review'])
        .limit(50)
        .get();

      for (const chargebackDoc of chargebacksSnapshot.docs) {
        const chargeback = chargebackDoc.data();
        const paymentIntentId = chargeback.paymentIntent;

        if (paymentIntentId) {
          const orderQuery = await db.collection('orders')
            .where('stripePaymentIntentId', '==', paymentIntentId)
            .limit(1)
            .get();

          if (!orderQuery.empty) {
            const order = orderQuery.docs[0].data();
            if (!order.adminHold && order.payoutHoldReason !== 'dispute_open') {
              issues.push({
                type: 'chargeback_no_hold',
                severity: 'error',
                orderId: orderQuery.docs[0].id,
                listingId: order.listingId,
                stripeId: chargeback.disputeId,
                description: `Chargeback ${chargeback.disputeId} exists but order is not on hold`,
                firestoreData: {
                  adminHold: order.adminHold,
                  payoutHoldReason: order.payoutHoldReason,
                },
                stripeData: {
                  disputeId: chargeback.disputeId,
                  status: chargeback.status,
                },
              });
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`[reconcile] Error checking chargebacks:`, error);
    }

    // Group issues by type
    const issuesByType: Record<string, ReconciliationIssue[]> = {};
    issues.forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = [];
      }
      issuesByType[issue.type].push(issue);
    });

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    console.log(`[reconcile] Reconciliation complete: ${errorCount} errors, ${warningCount} warnings`);

    return json({
      success: true,
      summary: {
        totalIssues: issues.length,
        errorCount,
        warningCount,
        ordersChecked: orders.length,
      },
      issues,
      issuesByType,
      checkedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error during reconciliation:', error);
    return json(
      {
        error: 'Failed to reconcile',
        message: error.message || error.toString(),
      },
      { status: 500 }
    );
  }
}
