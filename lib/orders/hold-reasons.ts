/**
 * Order Hold Reasons and Next Actions
 * 
 * Helper functions to derive hold reasons and next actions from order state
 */

import { Order, PayoutHoldReason, DisputeStatus } from '@/lib/types';

export interface HoldInfo {
  reason: string;
  nextAction: string;
  earliestReleaseDate: Date | null;
  canRelease: boolean;
}

/**
 * Derive hold reason and next action from order state
 */
export function getHoldInfo(order: Order): HoldInfo {
  const now = new Date();
  let reason = 'none';
  let nextAction = 'No action needed';
  let earliestReleaseDate: Date | null = null;
  let canRelease = false;

  // Check admin hold (highest priority)
  if (order.adminHold) {
    reason = 'Admin hold';
    nextAction = 'Admin must remove hold before release';
    canRelease = false;
    return { reason, nextAction, earliestReleaseDate, canRelease };
  }

  // Check chargeback
  if (order.chargebackStatus && ['active', 'funds_withdrawn'].includes(order.chargebackStatus)) {
    reason = `Chargeback ${order.chargebackStatus}`;
    nextAction = 'Resolve chargeback before release';
    canRelease = false;
    return { reason, nextAction, earliestReleaseDate, canRelease };
  }

  // Check dispute status
  const disputeStatus = order.disputeStatus || order.protectedDisputeStatus || 'none';
  if (disputeStatus && !['none', 'cancelled', 'resolved_release'].includes(disputeStatus)) {
    reason = `Dispute: ${disputeStatus}`;
    nextAction = 'Resolve dispute before release';
    canRelease = false;
    return { reason, nextAction, earliestReleaseDate, canRelease };
  }

  // Check protection window
  if (order.payoutHoldReason === 'protection_window' && order.protectionEndsAt) {
    const protectionEndsAt = new Date(order.protectionEndsAt);
    if (protectionEndsAt > now) {
      reason = 'Protection window active';
      nextAction = `Wait for protection window to end (${protectionEndsAt.toLocaleDateString()})`;
      earliestReleaseDate = protectionEndsAt;
      canRelease = false;
      return { reason, nextAction, earliestReleaseDate, canRelease };
    } else {
      // Protection window has passed, check if delivery confirmed
      if (!order.deliveryConfirmedAt) {
        reason = 'Waiting for delivery confirmation';
        nextAction = 'Buyer must confirm delivery';
        canRelease = false;
        return { reason, nextAction, earliestReleaseDate, canRelease };
      }
    }
  }

  // Check delivery confirmation
  if (!order.deliveryConfirmedAt) {
    reason = 'Waiting for delivery confirmation';
    nextAction = 'Buyer must confirm delivery';
    canRelease = false;
    return { reason, nextAction, earliestReleaseDate, canRelease };
  }

  // Check dispute deadline (standard escrow)
  if (order.disputeDeadlineAt) {
    const disputeDeadline = new Date(order.disputeDeadlineAt);
    if (disputeDeadline > now) {
      reason = 'Dispute window active';
      nextAction = `Wait for dispute deadline (${disputeDeadline.toLocaleDateString()})`;
      earliestReleaseDate = disputeDeadline;
      canRelease = false;
      return { reason, nextAction, earliestReleaseDate, canRelease };
    }
  }

  // All checks passed - order is ready to release
  if (order.status === 'ready_to_release' || order.status === 'accepted') {
    reason = 'Ready to release';
    nextAction = 'Order is eligible for automatic or manual release';
    canRelease = true;
    return { reason, nextAction, earliestReleaseDate, canRelease };
  }

  // Default: order may be eligible but status not updated yet
  reason = 'Pending status update';
  nextAction = 'Order may be eligible for release - check status';
  canRelease = false;
  return { reason, nextAction, earliestReleaseDate, canRelease };
}

/**
 * Generate plain text explanation for seller payout
 */
export function generatePayoutExplanation(order: Order): string {
  const holdInfo = getHoldInfo(order);
  const orderId = order.id || 'Unknown';
  const amount = order.sellerAmount || order.amount - (order.platformFee || 0);
  
  let explanation = `Order ${orderId} - Payout Status\n`;
  explanation += `Amount: $${amount.toFixed(2)}\n\n`;
  
  explanation += `Hold Reason: ${holdInfo.reason}\n`;
  explanation += `Next Action: ${holdInfo.nextAction}\n`;
  
  if (holdInfo.earliestReleaseDate) {
    explanation += `Earliest Release Date: ${holdInfo.earliestReleaseDate.toLocaleString()}\n`;
  }
  
  if (order.deliveryConfirmedAt) {
    explanation += `Delivery Confirmed: ${new Date(order.deliveryConfirmedAt).toLocaleString()}\n`;
  }
  
  if (order.protectionEndsAt) {
    explanation += `Protection Window Ends: ${new Date(order.protectionEndsAt).toLocaleString()}\n`;
  }
  
  if (order.disputeDeadlineAt) {
    explanation += `Dispute Deadline: ${new Date(order.disputeDeadlineAt).toLocaleString()}\n`;
  }
  
  if (order.adminHold) {
    explanation += `Admin Hold: Yes\n`;
  }
  
  if (order.disputeStatus && order.disputeStatus !== 'none') {
    explanation += `Dispute Status: ${order.disputeStatus}\n`;
  }
  
  if (order.chargebackStatus) {
    explanation += `Chargeback Status: ${order.chargebackStatus}\n`;
  }
  
  explanation += `\nCurrent Status: ${order.status}\n`;
  explanation += `Can Release: ${holdInfo.canRelease ? 'Yes' : 'No'}\n`;
  
  return explanation;
}
