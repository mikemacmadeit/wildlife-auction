/**
 * Order Status Helper
 * 
 * Provides a single source of truth for order status by deriving transactionStatus
 * from either the new transactionStatus field or legacy status field.
 * 
 * This ensures backward compatibility while migrating to transactionStatus as the primary status.
 */

import type { Order, TransactionStatus, OrderStatus } from '@/lib/types';
import { isRegulatedWhitetailDeal, hasComplianceConfirmations } from '@/lib/compliance/whitetail';

/**
 * Get the effective transaction status for an order.
 * 
 * Returns order.transactionStatus if present, otherwise derives it from legacy order.status.
 * This allows gradual migration from legacy status to transactionStatus.
 */
export function getEffectiveTransactionStatus(order: Order): TransactionStatus {
  // If transactionStatus is already set, use it (new orders)
  // BUT: if it's AWAITING_TRANSFER_COMPLIANCE, check if both confirmations are now present
  if (order.transactionStatus) {
    if (order.transactionStatus === 'AWAITING_TRANSFER_COMPLIANCE') {
      const confirmations = hasComplianceConfirmations(order);
      if (confirmations.bothConfirmed) {
        return 'FULFILLMENT_REQUIRED';
      }
    }
    return order.transactionStatus;
  }

  // Derive from legacy status for backward compatibility
  const legacyStatus = order.status as OrderStatus;

  // Map legacy statuses to transactionStatus
  switch (legacyStatus) {
    case 'pending':
    case 'awaiting_bank_transfer':
    case 'awaiting_wire':
      return 'PENDING_PAYMENT';

    case 'paid':
    case 'paid_held':
      // If payment is confirmed, check if compliance gate is required
      if (order.paidAt) {
        // Check if this is a regulated whitetail deal requiring compliance confirmation
        if (isRegulatedWhitetailDeal(order)) {
          // Check if both confirmations are present
          const confirmations = hasComplianceConfirmations(order);
          if (confirmations.bothConfirmed) {
            return 'FULFILLMENT_REQUIRED';
          }
          return 'AWAITING_TRANSFER_COMPLIANCE';
        }
        return 'FULFILLMENT_REQUIRED';
      }
      return 'PENDING_PAYMENT';

    case 'in_transit':
      // Check transport option to determine correct status
      if (order.transportOption === 'BUYER_TRANSPORT') {
        // For buyer transport, in_transit might mean seller marked preparing
        // Check if pickup info is set
        if (order.pickup?.location && order.pickup?.windows) {
          return order.pickup?.selectedWindow ? 'PICKUP_SCHEDULED' : 'READY_FOR_PICKUP';
        }
        return 'READY_FOR_PICKUP';
      } else {
        // For seller transport, in_transit means out for delivery
        return 'OUT_FOR_DELIVERY';
      }

    case 'delivered':
      return 'DELIVERED_PENDING_CONFIRMATION';

    case 'buyer_confirmed':
    case 'accepted':
    case 'ready_to_release':
    case 'completed':
      return 'COMPLETED';

    case 'disputed':
      return 'DISPUTE_OPENED';

    case 'refunded':
      return 'REFUNDED';

    case 'cancelled':
      return 'CANCELLED';

    default:
      // Fallback: if we have paidAt, assume fulfillment required
      // Otherwise, assume pending payment
      return order.paidAt ? 'FULFILLMENT_REQUIRED' : 'PENDING_PAYMENT';
  }
}

/**
 * Check if an order is in a terminal state (cannot transition further).
 */
export function isTerminalStatus(status: TransactionStatus): boolean {
  return ['COMPLETED', 'REFUNDED', 'CANCELLED'].includes(status);
}

/**
 * Check if an order is in a fulfillment state (post-payment, pre-completion).
 */
export function isFulfillmentStatus(status: TransactionStatus): boolean {
  return [
    'FULFILLMENT_REQUIRED',
    'READY_FOR_PICKUP',
    'PICKUP_SCHEDULED',
    'PICKED_UP',
    'DELIVERY_SCHEDULED',
    'OUT_FOR_DELIVERY',
    'DELIVERED_PENDING_CONFIRMATION',
  ].includes(status);
}

/**
 * Check if an order requires seller action.
 */
export function requiresSellerAction(order: Order): boolean {
  const status = getEffectiveTransactionStatus(order);
  const transportOption = order.transportOption || 'SELLER_TRANSPORT';

  // Compliance gate: seller must confirm compliance for regulated deals
  if (status === 'AWAITING_TRANSFER_COMPLIANCE' && isRegulatedWhitetailDeal(order)) {
    const confirmations = hasComplianceConfirmations(order);
    return !confirmations.sellerConfirmed; // Seller needs to confirm
  }

  if (status === 'FULFILLMENT_REQUIRED') {
    return true; // Seller must start fulfillment
  }

  if (transportOption === 'SELLER_TRANSPORT') {
    return status === 'DELIVERY_SCHEDULED';
  } else {
    // BUYER_TRANSPORT
    return status === 'READY_FOR_PICKUP';
  }
}

/**
 * Check if an order requires buyer action.
 */
export function requiresBuyerAction(order: Order): boolean {
  const status = getEffectiveTransactionStatus(order);
  const transportOption = order.transportOption || 'SELLER_TRANSPORT';

  // Compliance gate: buyer must confirm compliance for regulated deals
  if (status === 'AWAITING_TRANSFER_COMPLIANCE' && isRegulatedWhitetailDeal(order)) {
    const confirmations = hasComplianceConfirmations(order);
    return !confirmations.buyerConfirmed; // Buyer needs to confirm
  }

  if (transportOption === 'BUYER_TRANSPORT') {
    return status === 'READY_FOR_PICKUP' || status === 'PICKUP_SCHEDULED';
  } else {
    // SELLER_TRANSPORT
    return status === 'DELIVERED_PENDING_CONFIRMATION';
  }
}
