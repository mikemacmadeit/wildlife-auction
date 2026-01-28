import type { Order } from '@/lib/types';
import { getOrderIssueState } from './getOrderIssueState';
import { getEffectiveTransactionStatus } from './status';

export type OrderTrustState =
  | 'awaiting_payment'
  | 'payment_received'
  | 'preparing_delivery'
  | 'in_transit'
  | 'delivered'
  | 'protection_window'
  | 'issue_open'
  | 'ready_for_payout'
  | 'completed'
  | 'refunded';

/**
 * Derive a single user-facing trust state for an order.
 *
 * NON-NEGOTIABLE:
 * - Purely derived (NO DB writes)
 * - Uses transactionStatus as primary source (with legacy status fallback)
 *
 * Mapping inputs:
 * - transactionStatus (primary)
 * - status (legacy fallback)
 * - deliveredAt, deliveryConfirmedAt, buyerConfirmedAt
 * - protectedDisputeStatus / disputeStatus
 * - adminHold
 * - transportOption
 */
export function getOrderTrustState(order: Order): OrderTrustState {
  // Use effective transaction status as source of truth
  const txStatus = getEffectiveTransactionStatus(order);

  // Terminal states first
  if (txStatus === 'REFUNDED') return 'refunded';
  if (txStatus === 'COMPLETED') return 'completed';
  if (txStatus === 'CANCELLED') return 'completed'; // Treat cancelled as completed

  // Issue/hold states override normal progress (but not terminal).
  const issue = getOrderIssueState(order);
  if (issue !== 'none') return 'issue_open';
  if (order.adminHold === true) return 'issue_open';
  if (txStatus === 'DISPUTE_OPENED') return 'issue_open';
  if (txStatus === 'SELLER_NONCOMPLIANT') return 'issue_open';

  // Awaiting payment
  if (txStatus === 'PENDING_PAYMENT') {
    return 'awaiting_payment';
  }

  // Fulfillment states (seller delivery only; legacy pickup statuses mapped for backward compat)
  if (txStatus === 'READY_FOR_PICKUP' || txStatus === 'PICKUP_PROPOSED' || txStatus === 'PICKUP_SCHEDULED') {
    return 'in_transit';
  }
  if (txStatus === 'PICKED_UP') {
    return 'completed';
  }
  if (txStatus === 'DELIVERY_PROPOSED' || txStatus === 'DELIVERY_SCHEDULED' || txStatus === 'OUT_FOR_DELIVERY') {
    return 'in_transit';
  }
  if (txStatus === 'DELIVERED_PENDING_CONFIRMATION') {
    if (order.payoutHoldReason === 'protection_window' && order.protectionEndsAt) {
      const protectionEnds = new Date(order.protectionEndsAt);
      if (protectionEnds.getTime() > Date.now()) {
        return 'protection_window';
      }
    }
    return 'delivered';
  }

  // FULFILLMENT_REQUIRED - payment received, awaiting fulfillment start
  if (txStatus === 'FULFILLMENT_REQUIRED') {
    // If seller marked preparing, show that
    if ((order as any).sellerPreparingAt) return 'preparing_delivery';
    return 'payment_received';
  }

  // Legacy status fallback (for orders without transactionStatus)
  const legacyStatus = order.status;
  if (legacyStatus === 'paid' || legacyStatus === 'paid_held') {
    if ((order as any).sellerPreparingAt) return 'preparing_delivery';
    return 'payment_received';
  }

  // Fallback
  return 'payment_received';
}

