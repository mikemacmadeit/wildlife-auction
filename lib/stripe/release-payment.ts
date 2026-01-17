/**
 * Shared Payment Release Logic
 * Used by both manual release endpoint and auto-release scheduled function
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { stripe, isStripeConfigured } from './config';
import { createAuditLog } from '@/lib/audit/logger';
import { MARKETPLACE_FEE_PERCENT } from '@/lib/pricing/plans';
import { emitEventForUser } from '@/lib/notifications';

export interface ReleasePaymentResult {
  success: boolean;
  transferId?: string;
  amount?: number;
  error?: string;
  message?: string;
}

/**
 * Phase 2.5 / 3A (B2): Shared payout safety gate.
 *
 * This is intentionally narrower than full payout *eligibility* (status, buyer confirmation, etc.).
 * It exists to prevent drift between different "money-moving" code paths:
 * - manual payout release (`/api/stripe/transfers/release` -> releasePaymentForOrder)
 * - dispute resolution payouts (`/api/orders/[orderId]/disputes/resolve`)
 *
 * Non-negotiable: never release funds while a Stripe chargeback is open / unresolved.
 */
export function getPayoutSafetyBlockReason(orderData: any): string | null {
  const chargebackStatus = orderData?.chargebackStatus as string | undefined;
  const payoutHoldReason = orderData?.payoutHoldReason as string | undefined;
  if (payoutHoldReason === 'chargeback') return 'Order payout is held due to chargeback.';
  if (chargebackStatus && ['open', 'active', 'funds_withdrawn', 'needs_response', 'warning_needs_response'].includes(chargebackStatus)) {
    return 'Order has an active chargeback. Do not release funds until chargeback is resolved.';
  }
  if (orderData?.adminHold === true) return 'Order is on admin hold. Remove hold before releasing.';
  if (orderData?.stripeTransferId) return 'Payment already released (stripeTransferId exists).';
  return null;
}

/**
 * Release payment for an order
 * Validates eligibility and creates Stripe transfer
 */
export async function releasePaymentForOrder(
  db: ReturnType<typeof getFirestore>,
  orderId: string,
  releasedBy?: string // Admin UID for manual releases, 'system' for auto-releases
): Promise<ReleasePaymentResult> {
  console.log(`[releasePaymentForOrder] Starting release for order ${orderId}, releasedBy: ${releasedBy || 'system'}`);

  if (!isStripeConfigured() || !stripe) {
    return {
      success: false,
      error: 'Stripe is not configured',
    };
  }

  // Get order from Firestore
  const orderRef = db.collection('orders').doc(orderId);
  const orderDoc = await orderRef.get();

  if (!orderDoc.exists) {
    console.error(`[releasePaymentForOrder] Order not found: ${orderId}`);
    return {
      success: false,
      error: 'Order not found',
    };
  }

  const orderData = orderDoc.data()!;

  // Validate order status and release eligibility
  const currentStatus = orderData.status as string;
  const now = new Date();
  const disputeDeadline = orderData.disputeDeadlineAt?.toDate();
  const isDisputed = currentStatus === 'disputed';
  const hasAdminHold = orderData.adminHold === true;
  const isAccepted = currentStatus === 'accepted' || currentStatus === 'buyer_confirmed';
  const isReadyToRelease = currentStatus === 'ready_to_release';
  const isAutoRelease = releasedBy === 'system';
  const chargebackStatus = orderData.chargebackStatus as string | undefined;

  // Check protected transaction dispute status
  // Back-compat / correctness: the codebase historically used both `disputeStatus` and `protectedDisputeStatus`.
  // Dispute open routes set `protectedDisputeStatus`, so we must gate on both to avoid accidental payout release.
  const protectedDisputeStatus = orderData.protectedDisputeStatus || orderData.disputeStatus;
  const hasOpenProtectedDispute = protectedDisputeStatus &&
    ['open', 'needs_evidence', 'under_review'].includes(protectedDisputeStatus);

  // Check if payout is held due to protection window
  const payoutHoldReason = orderData.payoutHoldReason;
  const protectionEndsAt = orderData.protectionEndsAt?.toDate();
  const isInProtectionWindow = payoutHoldReason === 'protection_window' &&
    protectionEndsAt && protectionEndsAt.getTime() > now.getTime();

  // Check if already disputed - never allow release
  if (isDisputed || hasOpenProtectedDispute) {
    console.warn(`[releasePaymentForOrder] Order ${orderId} has open dispute, cannot release`);
    return {
      success: false,
      error: 'Order has an open dispute. Admin must resolve dispute before release.',
    };
  }

  // Block release if there is an active chargeback
  // Phase 2D: never release funds while Stripe dispute/chargeback is open.
  // We normalize to `order.chargebackStatus = 'open' | 'won' | 'lost'` in webhooks, but keep back-compat.
  if (chargebackStatus && ['open', 'active', 'funds_withdrawn', 'needs_response', 'warning_needs_response'].includes(chargebackStatus)) {
    return {
      success: false,
      error: 'Order has an active chargeback. Do not release funds until chargeback is resolved.',
    };
  }

  // Defensive gate: also block if an explicit payout hold reason is set for chargebacks.
  if (payoutHoldReason === 'chargeback') {
    return {
      success: false,
      error: 'Order payout is held due to chargeback. Do not release funds until chargeback is resolved.',
    };
  }

  // Check if admin hold is active
  if (hasAdminHold) {
    console.warn(`[releasePaymentForOrder] Order ${orderId} is on admin hold, cannot release`);
    return {
      success: false,
      error: 'Order is on admin hold. Remove hold before releasing.',
    };
  }

  // Check if still in protection window
  if (isInProtectionWindow) {
    console.warn(`[releasePaymentForOrder] Order ${orderId} is still in protection window, cannot release`);
    return {
      success: false,
      error: `Order is still in protection window. Protection ends on ${protectionEndsAt.toISOString()}.`,
    };
  }

  // P0: Check TPWD transfer approval for whitetail_breeder orders
  const listingId = orderData.listingId;
  if (listingId) {
    const listingRef = db.collection('listings').doc(listingId);
    const listingDoc = await listingRef.get();
    
    if (listingDoc.exists) {
      const listingData = listingDoc.data()!;
      
      if (listingData.category === 'whitetail_breeder') {
        // Check if transfer permit is required and approved
        const transferPermitRequired = orderData.transferPermitRequired !== false; // Default to true for whitetail
        const transferPermitStatus = orderData.transferPermitStatus || 'none';
        
        if (transferPermitRequired && transferPermitStatus !== 'approved') {
          // Check if verified TPWD_TRANSFER_APPROVAL document exists
          const documentsRef = db.collection('orders').doc(orderId).collection('documents');
          const transferDocsQuery = await documentsRef
            .where('type', '==', 'TPWD_TRANSFER_APPROVAL')
            .where('status', '==', 'verified')
            .limit(1)
            .get();
          
          if (transferDocsQuery.empty) {
            console.warn(`[releasePaymentForOrder] Order ${orderId} requires TPWD transfer approval but no verified document found`);
            return {
              success: false,
              error: 'TPWD Transfer Approval document must be uploaded and verified before payout can be released for whitetail breeder orders.',
            };
          }
          
          // Update order transfer permit status if document is verified
          if (transferPermitStatus !== 'approved') {
            await orderRef.update({
              transferPermitStatus: 'approved',
              updatedAt: Timestamp.now(),
            });
          }
        }
      }
    }
  }

  // Determine release eligibility.
  //
  // Core product rule: payouts are MANUAL (admin-triggered) after buyer confirms receipt.
  // Auto-release is optional and gated by environment in the scheduled function.
  let isEligible = false;

  const hasBuyerConfirmation =
    !!orderData.buyerConfirmedAt ||
    !!orderData.buyerAcceptedAt ||
    !!orderData.acceptedAt ||
    currentStatus === 'ready_to_release' ||
    currentStatus === 'buyer_confirmed' ||
    currentStatus === 'accepted';

  const hasDeliveryMarked = !!orderData.deliveredAt || !!orderData.deliveryConfirmedAt;

  if (!isAutoRelease) {
    // Manual release requires buyer confirmation + delivery marked.
    if ((isReadyToRelease || isAccepted) && hasBuyerConfirmation && hasDeliveryMarked) {
      isEligible = true;
    }
  } else {
    // Auto-release path (only called when enabled by scheduled job):
    // - allow if ready_to_release / buyer_confirmed / accepted
    // - OR if deadline/protection window elapsed AND delivery is marked
    if ((isReadyToRelease || isAccepted) && hasDeliveryMarked) {
      isEligible = true;
    } else if (hasDeliveryMarked) {
      if (disputeDeadline && disputeDeadline.getTime() < now.getTime()) {
        const eligibleStatuses = ['paid', 'paid_held', 'in_transit', 'delivered'];
        if (eligibleStatuses.includes(currentStatus)) {
          isEligible = true;
        }
      }
      if (!isEligible && protectionEndsAt && protectionEndsAt.getTime() < now.getTime()) {
        if (['paid', 'paid_held', 'in_transit', 'delivered', 'accepted', 'buyer_confirmed'].includes(currentStatus)) {
          isEligible = true;
        }
      }
    }
  }

  if (!isEligible) {
    console.warn(`[releasePaymentForOrder] Order ${orderId} is not eligible for release. Status: ${currentStatus}`);
    return {
      success: false,
      error: `Order status is '${currentStatus}'. Release requires: (1) status is 'accepted' or 'ready_to_release', OR (2) status is paid/in_transit/delivered AND (dispute deadline has passed OR protection window has ended) with no dispute.`,
    };
  }

  // Check if transfer already exists
  if (orderData.stripeTransferId) {
    console.warn(`[releasePaymentForOrder] Order ${orderId} already has transfer: ${orderData.stripeTransferId}`);
    return {
      success: false,
      error: `Payment already released. Transfer ${orderData.stripeTransferId} already exists for this order.`,
    };
  }

  // Validate required fields
  const sellerId = orderData.sellerId as string | undefined;
  if (!sellerId) {
    return { success: false, error: 'Order missing sellerId' };
  }

  // Re-derive seller Stripe account ID from the seller user doc (DO NOT trust order.sellerStripeAccountId).
  const sellerSnap = await db.collection('users').doc(sellerId).get();
  const derivedSellerStripeAccountId = sellerSnap.exists ? (sellerSnap.data() as any)?.stripeAccountId : null;
  if (!derivedSellerStripeAccountId || typeof derivedSellerStripeAccountId !== 'string') {
    console.error(`[releasePaymentForOrder] Seller ${sellerId} missing stripeAccountId`);
    return { success: false, error: 'Seller Stripe account not found (seller not payout-ready)' };
  }

  // Verify payment intent is succeeded (defense-in-depth)
  const paymentIntentId = orderData.stripePaymentIntentId as string | undefined;
  if (paymentIntentId && stripe) {
    try {
      const pi: any = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi?.status !== 'succeeded') {
        return { success: false, error: `Payment is not settled yet (payment_intent status: ${pi?.status || 'unknown'})` };
      }
    } catch (e: any) {
      return { success: false, error: `Unable to verify payment intent status: ${e?.message || 'unknown error'}` };
    }
  }

  // Recompute seller payout amount from order snapshots (DO NOT trust order.sellerAmount).
  const orderAmountUsd = Number(orderData.amount);
  if (!Number.isFinite(orderAmountUsd) || orderAmountUsd <= 0) {
    return { success: false, error: 'Invalid order amount' };
  }
  const amountCents = Math.round(orderAmountUsd * 100);
  const feePercent = typeof orderData.platformFeePercent === 'number' ? orderData.platformFeePercent : MARKETPLACE_FEE_PERCENT;
  const computedPlatformFeeCents = Math.round(amountCents * feePercent);
  const computedSellerCents = amountCents - computedPlatformFeeCents;
  if (computedSellerCents <= 0) {
    return { success: false, error: 'Computed seller payout is invalid' };
  }

  const transferAmount = computedSellerCents;
  const sellerAmount = computedSellerCents / 100;

  try {
    // Create Stripe transfer to seller's connected account
    console.log(
      `[releasePaymentForOrder] Creating Stripe transfer for order ${orderId}: $${sellerAmount} to ${derivedSellerStripeAccountId}`
    );
    const transfer = await stripe.transfers.create(
      {
        amount: transferAmount,
        currency: 'usd',
        destination: derivedSellerStripeAccountId,
        metadata: {
          orderId: orderId,
          listingId: orderData.listingId,
          buyerId: orderData.buyerId,
          sellerId: orderData.sellerId,
          releasedBy: releasedBy || 'system',
          releaseType: releasedBy && releasedBy !== 'system' ? 'manual' : 'auto',
        },
      },
      { idempotencyKey: `transfer:${orderId}` }
    );

    // Capture before state for audit
    const beforeState = {
      status: orderData.status,
      stripeTransferId: orderData.stripeTransferId,
      adminHold: orderData.adminHold,
      disputeStatus: orderData.disputeStatus,
    };

    // Update order in Firestore
    await orderRef.update({
      status: 'completed',
      stripeTransferId: transfer.id,
      completedAt: new Date(),
      updatedAt: new Date(),
      releasedBy: releasedBy || 'system',
      releasedAt: new Date(),
    });

    // Create audit log
    await createAuditLog(db, {
      actorUid: releasedBy || 'system',
      actorRole: releasedBy ? 'admin' : 'system',
      actionType: releasedBy ? 'payout_released_manual' : 'payout_released_auto',
      orderId: orderId,
      listingId: orderData.listingId,
      beforeState,
      afterState: {
        status: 'completed',
        stripeTransferId: transfer.id,
        releasedBy: releasedBy || 'system',
        releasedAt: new Date(),
      },
      metadata: {
        transferId: transfer.id,
        amount: sellerAmount,
        sellerStripeAccountId: derivedSellerStripeAccountId,
      },
      source: releasedBy ? 'admin_ui' : 'cron',
    });

    // Update seller stats (increment completed sales count)
    const sellerRef = db.collection('users').doc(orderData.sellerId);
    const sellerDoc = await sellerRef.get();

    if (sellerDoc.exists) {
      const sellerData = sellerDoc.data();
      const currentCompleted = sellerData?.completedSalesCount || 0;
      const currentVerified = sellerData?.verifiedTransactionsCount || 0;

      await sellerRef.update({
        completedSalesCount: currentCompleted + 1,
        verifiedTransactionsCount: currentVerified + 1,
        updatedAt: Timestamp.now(),
      });
    }

    console.log(
      `[releasePaymentForOrder] Payment released successfully for order ${orderId}: Transfer ${transfer.id} of $${sellerAmount} to ${derivedSellerStripeAccountId}`
    );

    // Emit canonical notification event for seller (in-app/email/push handled by scheduled processors)
    try {
      // Get listing title
      const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = listingDoc.data()?.title || 'Unknown Listing';

      await emitEventForUser({
        type: 'Payout.Released',
        actorId: releasedBy || 'system',
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.sellerId,
        payload: {
          type: 'Payout.Released',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          amount: sellerAmount,
          transferId: transfer.id,
          payoutDate: new Date().toISOString(),
        },
        optionalHash: `transfer:${transfer.id}`,
      });
    } catch (emailError) {
      // Don't fail the release if email fails
      console.error(`[releasePaymentForOrder] Error emitting payout_released notification event:`, emailError);
    }

    return {
      success: true,
      transferId: transfer.id,
      amount: sellerAmount,
      message: 'Payment released successfully',
    };
  } catch (error: any) {
    console.error(`[releasePaymentForOrder] Error creating Stripe transfer for order ${orderId}:`, error);
    return {
      success: false,
      error: error.message || error.toString() || 'Unknown error',
    };
  }
}
