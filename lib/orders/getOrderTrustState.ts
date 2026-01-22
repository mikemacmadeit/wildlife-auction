import type { Order } from '@/lib/types';
import { getOrderIssueState } from './getOrderIssueState';

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
 * - Uses existing order fields only (no new states stored)
 *
 * Mapping inputs (per Phase 2A spec):
 * - status
 * - deliveredAt
 * - deliveryConfirmedAt
 * - buyerConfirmedAt
 * - protectedDisputeStatus / disputeStatus
 * - adminHold
 * - payoutHoldReason
 */
export function getOrderTrustState(order: Order): OrderTrustState {
  const status = order.status;

  // Terminal states first
  if (status === 'refunded') return 'refunded';
  if (status === 'completed') return 'completed';

  // Issue/hold states override normal progress (but not terminal).
  const issue = getOrderIssueState(order);
  if (issue !== 'none') return 'issue_open';
  if (order.adminHold === true) return 'issue_open';

  // Awaiting payment rails
  if (status === 'pending' || status === 'awaiting_bank_transfer' || status === 'awaiting_wire') {
    return 'awaiting_payment';
  }

  // Payment received (funds held)
  if (status === 'paid' || status === 'paid_held') {
    // If the seller explicitly marked they are preparing, reflect that.
    if ((order as any).sellerPreparingAt) return 'preparing_delivery';
    return 'payment_received';
  }

  // Delivery progression (note: `in_transit` may be set via seller action; see Phase 2C)
  if (status === 'in_transit' || (order as any).inTransitAt) return 'in_transit';

  // Treat buyer confirmation as a delivery marker as well (prevents "stuck" states if seller doesn't mark delivered).
  const hasDeliveredMarker =
    !!order.deliveredAt ||
    !!order.deliveryConfirmedAt ||
    !!order.buyerConfirmedAt ||
    status === 'delivered' ||
    status === 'buyer_confirmed' ||
    status === 'accepted' ||
    status === 'ready_to_release';
  if (!hasDeliveredMarker) {
    // Payment is received (or legacy accepted/buyer_confirmed) but seller hasn't marked delivery yet.
    return 'preparing_delivery';
  }

  // Delivered, but protection window may be active (we intentionally use payoutHoldReason as the gate here).
  if (order.payoutHoldReason === 'protection_window') return 'protection_window';

  // Buyer confirmed + delivery marked -> ready for payout review/release (manual release still required).
  const buyerConfirmed = !!order.buyerConfirmedAt || status === 'buyer_confirmed' || status === 'accepted' || status === 'ready_to_release';
  const delivered = !!order.deliveredAt || !!order.deliveryConfirmedAt || !!order.buyerConfirmedAt || status === 'delivered';
  if ((status === 'ready_to_release' || status === 'buyer_confirmed' || status === 'accepted') && buyerConfirmed && delivered) {
    return 'ready_for_payout';
  }

  // Default delivered (no active protection hold)
  if (hasDeliveredMarker) return 'delivered';

  // Fallback
  return 'payment_received';
}

