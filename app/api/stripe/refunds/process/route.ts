/**
 * POST /api/stripe/refunds/process
 * 
 * Admin-only endpoint to process refunds
 * Creates a Stripe refund and updates order status
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { validateRequest, processRefundSchema } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit/logger';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { logInfo, logError } from '@/lib/monitoring/logger';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(request: Request) {
  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    if (!isStripeConfigured() || !stripe) {
      return json(
        { error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.' },
        { status: 503 }
      );
    }

    // Rate limiting (admin operations - very restrictive)
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

    // Get Firebase Auth token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json(
        { error: 'Unauthorized - Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error: any) {
      logError('Token verification error', error, { route: '/api/stripe/refunds/process', code: error?.code });
      return json(
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
      return json({ error: 'User not found' }, { status: 404 });
    }

    const adminUserData = adminUserDoc.data();
    const isAdmin = adminUserData?.role === 'admin' || adminUserData?.role === 'super_admin';
    
    if (!isAdmin) {
      return json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    // Validate request body
    const validation = validateRequest(processRefundSchema, body);
    if (!validation.success) {
      return json({ error: validation.error, details: validation.details?.errors }, { status: 400 });
    }

    const { orderId, reason, notes, amount: refundAmount } = validation.data;

    // Get order from Firestore
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    
    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Validate order can be refunded
    if (orderData.status === 'refunded') {
      return json(
        { 
          error: 'Order already refunded',
          details: `Refund ${orderData.stripeRefundId} already exists for this order.`
        },
        { status: 400 }
      );
    }

    if (orderData.status === 'pending') {
      return json(
        { 
          error: 'Order cannot be refunded',
          details: 'Order payment is still pending. Cancel the order instead.'
        },
        { status: 400 }
      );
    }

    // Check if payment intent exists
    const paymentIntentId = orderData.stripePaymentIntentId;
    if (!paymentIntentId) {
      return json({ error: 'Payment intent not found' }, { status: 400 });
    }

    // Determine refund amount (full refund if not specified)
    const totalAmount = orderData.amount * 100; // Convert to cents
    const refundAmountCents = refundAmount 
      ? Math.round(refundAmount * 100) 
      : totalAmount; // Full refund

    // Validate refund amount
    if (refundAmountCents > totalAmount) {
      return json({ error: 'Refund amount cannot exceed order amount' }, { status: 400 });
    }

    if (refundAmountCents <= 0) {
      return json({ error: 'Refund amount must be greater than zero' }, { status: 400 });
    }

    // Transaction guard: prevent concurrent refunds (P3)
    const now = new Date();
    const guardWindowMs = 5 * 60 * 1000; // 5 minutes
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists) throw new Error('Order not found');
        const data = snap.data() as any;
        if (data.status === 'refunded') throw new Error('ORDER_ALREADY_REFUNDED');
        const at = data.refundInProgressAt?.toMillis?.() ?? data.refundInProgressAt;
        if (typeof at === 'number' && Date.now() - at < guardWindowMs) throw new Error('REFUND_IN_PROGRESS');
        tx.update(orderRef, { refundInProgressAt: now, updatedAt: now });
      });
    } catch (e: any) {
      if (e?.message === 'ORDER_ALREADY_REFUNDED') {
        return json({ error: 'Order already refunded' }, { status: 400 });
      }
      if (e?.message === 'REFUND_IN_PROGRESS') {
        return json(
          { error: 'Refund already in progress for this order', code: 'REFUND_IN_PROGRESS' },
          { status: 409 }
        );
      }
      throw e;
    }

    let refund: { id: string };
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: refundAmountCents,
          reason: 'requested_by_customer',
          metadata: {
            orderId: orderId,
            listingId: orderData.listingId,
            buyerId: orderData.buyerId,
            sellerId: orderData.sellerId,
            refundedBy: adminId,
            refundReason: reason || 'Admin refund',
          },
        },
        { idempotencyKey: `refund:${orderId}:${refundAmountCents}` }
      );
    } catch (stripeErr: any) {
      await orderRef.update({ refundInProgressAt: FieldValue.delete(), updatedAt: new Date() }).catch((e) => {
        logError('Refund: failed to clear refundInProgressAt after Stripe error', e instanceof Error ? e : new Error(String(e)), {
          route: '/api/stripe/refunds/process',
          orderId,
        });
      });
      throw stripeErr;
    }

    // Capture before state for audit
    const beforeState = {
      status: orderData.status,
      stripeRefundId: orderData.stripeRefundId,
      refundedBy: orderData.refundedBy,
    };

    // Update order in Firestore; clear refund-in-progress lock
    const updateData: any = {
      status: refundAmountCents === totalAmount ? 'refunded' : 'completed',
      stripeRefundId: refund.id,
      refundedBy: adminId,
      refundedAt: now,
      refundReason: reason || 'Admin refund',
      updatedAt: now,
      refundInProgressAt: FieldValue.delete(),
    };

    if (refundAmountCents < totalAmount) {
      updateData.refundAmount = refundAmountCents / 100;
    }

    const existingNotes = orderData.adminActionNotes || [];
    updateData.adminActionNotes = [
      ...existingNotes,
      {
        reason,
        notes: notes ?? null,
        actorUid: adminId,
        createdAt: Timestamp.now(),
        action: refundAmountCents === totalAmount ? 'refund_full' : 'refund_partial',
      },
    ];

    try {
      await orderRef.update(updateData);
    } catch (updateErr: any) {
      await orderRef.update({ refundInProgressAt: FieldValue.delete(), updatedAt: new Date() }).catch((e) => {
        logError('Refund: failed to clear refundInProgressAt after update error', e instanceof Error ? e : new Error(String(e)), {
          route: '/api/stripe/refunds/process',
          orderId,
        });
      });
      throw updateErr;
    }

    await createAuditLog(db, {
      actorUid: adminId,
      actorRole: 'admin',
      actionType: refundAmountCents === totalAmount ? 'refund_full' : 'refund_partial',
      orderId: orderId,
      listingId: orderData.listingId,
      beforeState,
      afterState: {
        status: updateData.status,
        stripeRefundId: refund.id,
        refundedBy: adminId,
        refundAmount: refundAmountCents < totalAmount ? refundAmountCents / 100 : null,
      },
      metadata: {
        refundId: refund.id,
        refundAmount: refundAmountCents / 100,
        isFullRefund: refundAmountCents === totalAmount,
        reason,
        notes: notes ?? null,
      },
      source: 'admin_ui',
    });

    logInfo('Refund processed', {
      route: '/api/stripe/refunds/process',
      orderId,
      refundId: refund.id,
      amountUsd: refundAmountCents / 100,
      isFullRefund: refundAmountCents === totalAmount,
    });

    return json({
      success: true,
      refundId: refund.id,
      amount: refundAmountCents / 100,
      isFullRefund: refundAmountCents === totalAmount,
      message: refundAmountCents === totalAmount 
        ? 'Full refund processed successfully' 
        : 'Partial refund processed successfully',
    });
  } catch (error: any) {
    logError('Error processing refund', error, { route: '/api/stripe/refunds/process' });
    return json(
      {
        error: 'Failed to process refund',
        message: error.message || error.toString() || 'Unknown error',
        code: error?.code,
        type: error?.type,
      },
      { status: 500 }
    );
  }
}
