/**
 * Shared Payment Release Logic
 * Used by both manual release endpoint and auto-release scheduled function
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { stripe, isStripeConfigured } from './config';
import { createAuditLog } from '@/lib/audit/logger';

export interface ReleasePaymentResult {
  success: boolean;
  transferId?: string;
  amount?: number;
  error?: string;
  message?: string;
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
  const isAccepted = currentStatus === 'accepted';
  const isReadyToRelease = currentStatus === 'ready_to_release';

  // Check protected transaction dispute status
  const protectedDisputeStatus = orderData.disputeStatus;
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

  // Determine release eligibility
  let isEligible = false;

  // Always allow if accepted or ready_to_release
  if (isAccepted || isReadyToRelease) {
    isEligible = true;
  }
  // Allow if deadline passed and status allows it
  else if (disputeDeadline && disputeDeadline.getTime() < now.getTime()) {
    const eligibleStatuses = ['paid', 'in_transit', 'delivered'];
    if (eligibleStatuses.includes(currentStatus)) {
      isEligible = true;
    }
  }

  // Allow if protection window has passed
  if (!isEligible && protectionEndsAt && protectionEndsAt.getTime() < now.getTime()) {
    if (['paid', 'in_transit', 'delivered', 'accepted'].includes(currentStatus)) {
      isEligible = true;
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
  const sellerStripeAccountId = orderData.sellerStripeAccountId;
  const sellerAmount = orderData.sellerAmount;

  if (!sellerStripeAccountId) {
    console.error(`[releasePaymentForOrder] Order ${orderId} missing sellerStripeAccountId`);
    return {
      success: false,
      error: 'Seller Stripe account not found',
    };
  }

  if (!sellerAmount || sellerAmount <= 0) {
    console.error(`[releasePaymentForOrder] Order ${orderId} has invalid sellerAmount: ${sellerAmount}`);
    return {
      success: false,
      error: 'Invalid seller amount',
    };
  }

  // Convert seller amount to cents
  const transferAmount = Math.round(sellerAmount * 100);

  try {
    // Create Stripe transfer to seller's connected account
    console.log(`[releasePaymentForOrder] Creating Stripe transfer for order ${orderId}: $${sellerAmount} to ${sellerStripeAccountId}`);
    const transfer = await stripe.transfers.create({
      amount: transferAmount,
      currency: 'usd',
      destination: sellerStripeAccountId,
      metadata: {
        orderId: orderId,
        listingId: orderData.listingId,
        buyerId: orderData.buyerId,
        sellerId: orderData.sellerId,
        releasedBy: releasedBy || 'system',
        releaseType: releasedBy ? 'manual' : 'auto',
      },
    });

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
        sellerStripeAccountId: sellerStripeAccountId,
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

    console.log(`[releasePaymentForOrder] Payment released successfully for order ${orderId}: Transfer ${transfer.id} of $${sellerAmount} to ${sellerStripeAccountId}`);

    // Send payout notification email to seller
    try {
      const sellerDoc = await db.collection('users').doc(orderData.sellerId).get();
      const sellerEmail = sellerDoc.data()?.email;
      const sellerName = sellerDoc.data()?.displayName || sellerDoc.data()?.profile?.fullName || 'Seller';

      // Get listing title
      const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = listingDoc.data()?.title || 'Unknown Listing';

      if (sellerEmail) {
        const { sendPayoutNotificationEmail } = await import('@/lib/email/sender');
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';

        await sendPayoutNotificationEmail(sellerEmail, {
          sellerName,
          orderId,
          listingTitle,
          amount: sellerAmount,
          transferId: transfer.id,
          payoutDate: new Date(),
        });
        console.log(`[releasePaymentForOrder] Payout notification email sent to ${sellerEmail}`);
      }
    } catch (emailError) {
      // Don't fail the release if email fails
      console.error(`[releasePaymentForOrder] Error sending payout notification email:`, emailError);
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
