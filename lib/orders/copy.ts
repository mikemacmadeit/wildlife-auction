/**
 * Centralized User-Facing Copy
 * 
 * Single source of truth for all order-related user-facing strings.
 * NO escrow/hold/release language allowed.
 */

export const ORDER_COPY = {
  // Payment status
  payment: {
    sellerPaidImmediately: 'Seller paid immediately',
    paymentReceived: 'Payment received',
    awaitingPayment: 'Awaiting payment',
  },

  // Fulfillment status labels
  fulfillment: {
    actionNeeded: 'Action needed',
    waitingOnSeller: 'Waiting on seller',
    waitingOnBuyer: 'Waiting on buyer',
    fulfillmentInProgress: 'Fulfillment in progress',
    fulfillmentRequired: 'Fulfillment required',
    deliveryScheduled: 'Delivery scheduled',
    outForDelivery: 'Out for delivery',
    delivered: 'Delivered',
    deliveredPendingConfirmation: 'Delivered — confirm receipt',
    readyForPickup: 'Ready for pickup',
    pickupScheduled: 'Pickup scheduled',
    pickupConfirmed: 'Pickup confirmed',
    completed: 'Completed',
    disputeOpen: 'Dispute',
    transactionComplete: 'Transaction complete',
  },

  // Compliance
  compliance: {
    awaitingTransferCompliance: 'TPWD transfer compliance required',
    complianceRequired: 'Compliance confirmation required',
    buyerConfirmationPending: 'Waiting on buyer compliance confirmation',
    sellerConfirmationPending: 'Waiting on seller compliance confirmation',
    bothConfirmed: 'Compliance confirmed — fulfillment unlocked',
  },

  // Next actions
  actions: {
    scheduleDelivery: 'Schedule Delivery',
    markOutForDelivery: 'Mark Out for Delivery',
    markDelivered: 'Mark Delivered',
    setPickupInfo: 'Set Pickup Info',
    confirmReceipt: 'Confirm Receipt',
    selectPickupWindow: 'Select Pickup Window',
    confirmPickup: 'Confirm Pickup',
    confirmCompliance: 'Confirm Compliance',
    openDispute: 'Open Dispute',
    viewDetails: 'View Details',
  },

  // Descriptions
  descriptions: {
    trackFulfillmentProgress: 'Track fulfillment progress, compliance milestones, and delivery—exactly who we\'re waiting on.',
    sellerReceivesFundsImmediately: 'Seller receives funds immediately upon successful payment via Stripe Connect destination charges. No payout release needed.',
    waitingForSellerToStart: 'Waiting for seller to start fulfillment',
    waitingForDelivery: 'Waiting for delivery',
    waitingForBuyerConfirmation: 'Waiting for buyer confirmation',
    waitingForPickup: 'Waiting for pickup',
    transactionComplete: 'Transaction complete. Seller was paid immediately upon successful payment.',
  },

  // SLA / Urgency
  sla: {
    slaApproaching: 'SLA approaching',
    slaOverdue: 'SLA overdue',
    noSla: 'No SLA',
    hoursRemaining: (hours: number) => `${hours}h remaining`,
    overdue: 'Overdue',
  },

  // Badge variants (for UI components)
  badgeVariants: {
    default: 'default',
    secondary: 'secondary',
    destructive: 'destructive',
    outline: 'outline',
  } as const,
} as const;

/**
 * Get user-friendly status label for a transaction status
 */
export function getStatusLabel(txStatus: string): string {
  const statusMap: Record<string, string> = {
    PENDING_PAYMENT: ORDER_COPY.payment.awaitingPayment,
    PAID: ORDER_COPY.payment.paymentReceived,
    AWAITING_TRANSFER_COMPLIANCE: ORDER_COPY.compliance.awaitingTransferCompliance,
    FULFILLMENT_REQUIRED: ORDER_COPY.fulfillment.fulfillmentRequired,
    READY_FOR_PICKUP: ORDER_COPY.fulfillment.readyForPickup,
    PICKUP_SCHEDULED: ORDER_COPY.fulfillment.pickupScheduled,
    PICKED_UP: ORDER_COPY.fulfillment.pickupConfirmed,
    DELIVERY_SCHEDULED: ORDER_COPY.fulfillment.deliveryScheduled,
    OUT_FOR_DELIVERY: ORDER_COPY.fulfillment.outForDelivery,
    DELIVERED_PENDING_CONFIRMATION: ORDER_COPY.fulfillment.deliveredPendingConfirmation,
    COMPLETED: ORDER_COPY.fulfillment.completed,
    DISPUTE_OPENED: ORDER_COPY.fulfillment.disputeOpen,
    REFUNDED: 'Refunded',
    CANCELLED: 'Cancelled',
    SELLER_NONCOMPLIANT: 'Seller non-compliant',
  };

  return statusMap[txStatus] || txStatus.replaceAll('_', ' ');
}
