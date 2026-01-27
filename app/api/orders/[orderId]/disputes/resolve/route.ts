/**
 * POST /api/orders/[orderId]/disputes/resolve
 * 
 * Admin resolves a dispute (release, refund, or partial refund)
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
// DEPRECATED: getPayoutSafetyBlockReason removed - sellers paid immediately via destination charge
import { validateRequest, resolveDisputeSchema } from '@/lib/validation/api-schemas';
import { createAuditLog } from '@/lib/audit/logger';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';

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
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

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

    // Parse and validate request body
    const body = await request.json();
    const validation = validateRequest(resolveDisputeSchema, body);
    if (!validation.success) {
      return json({ error: validation.error, details: validation.details?.errors }, { status: 400 });
    }

    const { resolution, refundAmount, refundReason, markFraudulent, adminNotes } = validation.data;
    const orderId = params.orderId;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Check if dispute exists
    if (!orderData.protectedDisputeStatus || 
        orderData.protectedDisputeStatus === 'none' ||
        orderData.protectedDisputeStatus === 'cancelled' ||
        orderData.protectedDisputeStatus.startsWith('resolved_')) {
      return json({ error: 'Dispute is not in a resolvable state' }, { status: 400 });
    }

    // Validate partial refund
    if (resolution === 'partial_refund' && (!refundAmount || refundAmount >= orderData.amount)) {
      return json({ error: 'Partial refund amount must be less than order amount' }, { status: 400 });
    }

    // Capture before state for audit
    const beforeState = {
      protectedDisputeStatus: orderData.protectedDisputeStatus,
      status: orderData.status,
      stripeTransferId: orderData.stripeTransferId,
      stripeRefundId: orderData.stripeRefundId,
      payoutHoldReason: orderData.payoutHoldReason,
    };

    const now = new Date();
    let updateData: any = {
      updatedAt: now,
      lastUpdatedByRole: 'admin',
    };

    // Handle resolution
    if (resolution === 'release') {
      // Seller is already paid immediately via destination charge - no payout action needed.
      // This resolution type closes the dispute and marks order as completed.
      // Note: Seller was paid at payment time via Stripe Connect destination charge.
      
      updateData.protectedDisputeStatus = 'resolved_release';
      updateData.status = 'completed';
      updateData.transactionStatus = 'COMPLETED';
      updateData.completedAt = now;
      // DEPRECATED: These fields kept for backward compatibility (seller already paid)
      updateData.payoutHoldReason = 'none';
    } else if (resolution === 'refund') {
      // Full refund
      if (!orderData.stripePaymentIntentId) {
        return json({ error: 'Payment intent not found' }, { status: 400 });
      }

      const refund = await stripe.refunds.create(
        {
          payment_intent: orderData.stripePaymentIntentId,
          metadata: {
            orderId: orderId,
            resolution: 'dispute_refund',
            resolvedBy: adminId,
          },
        },
        { idempotencyKey: `dispute-resolve:refund:${orderId}` }
      );

      updateData.protectedDisputeStatus = 'resolved_refund';
      updateData.status = 'refunded';
      updateData.transactionStatus = 'REFUNDED';
      updateData.stripeRefundId = refund.id;
      updateData.refundedBy = adminId;
      updateData.refundedAt = now;
      updateData.refundReason = 'Dispute resolved - full refund';
      updateData.payoutHoldReason = 'none';
    } else if (resolution === 'partial_refund') {
      // Partial refund
      if (!orderData.stripePaymentIntentId) {
        return json({ error: 'Payment intent not found' }, { status: 400 });
      }

      const refundAmountValue = refundAmount ?? 0;
      const refundAmountCents = Math.round(refundAmountValue * 100);
      const refund = await stripe.refunds.create(
        {
          payment_intent: orderData.stripePaymentIntentId,
          amount: refundAmountCents,
          metadata: {
            orderId: orderId,
            resolution: 'dispute_partial_refund',
            resolvedBy: adminId,
          },
        },
        { idempotencyKey: `dispute-resolve:partial:${orderId}:${refundAmountCents}` }
      );

      updateData.protectedDisputeStatus = 'resolved_partial_refund';
      updateData.status = 'completed';
      updateData.stripeRefundId = refund.id;
      updateData.refundedBy = adminId;
      updateData.refundedAt = now;
      updateData.refundReason = `Dispute resolved - partial refund of $${refundAmountValue}`;
      updateData.refundAmount = refundAmountValue;
      updateData.isFullRefund = false;
      updateData.transactionStatus = 'COMPLETED'; // Partial refund resolved - order complete
      
      // NOTE: Seller already received full payment immediately via destination charge.
      // For partial refunds, we only create the refund - no transfer needed.
      // The seller keeps (sellerAmount - refundAmount) automatically.
      
      updateData.payoutHoldReason = 'none'; // Deprecated field - kept for backward compatibility
    }

    // Store admin action notes
    const existingNotes = orderData.adminActionNotes || [];
    updateData.adminActionNotes = [
      ...existingNotes,
      {
        reason: refundReason || `Dispute resolved: ${resolution}`,
        notes: adminNotes,
        actorUid: adminId,
        createdAt: Timestamp.now(),
        action: 'dispute_resolved',
      },
    ];

    if (adminNotes) {
      updateData.protectedDisputeNotes = (orderData.protectedDisputeNotes || '') + '\n\n[Admin]: ' + adminNotes;
    }

    await orderRef.update(updateData);

    // Create audit log
    await createAuditLog(db, {
      actorUid: adminId,
      actorRole: 'admin',
      actionType: 'dispute_resolved',
      orderId: orderId,
      listingId: orderData.listingId,
      beforeState,
      afterState: {
        protectedDisputeStatus: updateData.protectedDisputeStatus,
        status: updateData.status,
        stripeTransferId: updateData.stripeTransferId,
        stripeRefundId: updateData.stripeRefundId,
        payoutHoldReason: updateData.payoutHoldReason,
      },
      metadata: {
        resolution,
        refundAmount: resolution === 'partial_refund' ? refundAmount : undefined,
        refundReason: refundReason || undefined,
        markFraudulent,
        adminNotes,
      },
      source: 'admin_ui',
    });

    // Timeline (server-authored, idempotent).
    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `DISPUTE_RESOLVED:${orderId}`,
          type: 'DISPUTE_RESOLVED',
          label: 'Dispute resolved',
          actor: 'admin',
          visibility: 'buyer',
          timestamp: Timestamp.now(),
          meta: { resolution },
        },
      });
    } catch {
      // best-effort
    }

    // Handle buyer fraud tracking
    if (markFraudulent) {
      const buyerRef = db.collection('users').doc(orderData.buyerId);
      const buyerDoc = await buyerRef.get();
      const buyerData = buyerDoc.exists ? buyerDoc.data() : {};
      
      const currentFraudCount = buyerData?.buyerConfirmedFraudCount || 0;
      const currentRiskScore = buyerData?.buyerRiskScore || 0;
      
      const newFraudCount = currentFraudCount + 1;
      const newRiskScore = Math.min(100, currentRiskScore + 20); // Increase risk score
      const protectionEligible = newFraudCount < 2; // Block after 2 confirmed fraud
      
      await buyerRef.update({
        buyerConfirmedFraudCount: newFraudCount,
        buyerRiskScore: newRiskScore,
        buyerProtectionEligible: protectionEligible,
        updatedAt: Timestamp.now(),
      });
    }

    return json({
      success: true,
      orderId,
      resolution,
      message: `Dispute resolved: ${resolution}`,
    });
  } catch (error: any) {
    console.error('Error resolving dispute:', error);
    return json({ error: 'Failed to resolve dispute', message: error.message }, { status: 500 });
  }
}
