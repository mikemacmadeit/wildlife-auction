import type { Order } from '@/lib/types';
import { getEffectiveTransactionStatus } from './status';

export type PurchasesStatusKey =
  | 'processing'
  | 'held'
  | 'awaiting_permit'
  | 'in_transit'
  | 'delivered'
  | 'completed'
  | 'disputed';

export type PurchasesPrimaryAction =
  | { kind: 'confirm_receipt'; label: string }
  | { kind: 'open_dispute'; label: string }
  | { kind: 'complete_transfer'; label: string }
  | { kind: 'view_details'; label: string }
  | { kind: 'select_pickup_window'; label: string }
  | { kind: 'confirm_pickup'; label: string }
  | { kind: 'agree_delivery'; label: string };

export function deriveOrderUIState(order: Order): {
  statusKey: PurchasesStatusKey;
  currentStepLabel: string;
  waitingOn?: string;
  needsAction: boolean;
  primaryAction: PurchasesPrimaryAction;
} {
  // Use effective transaction status as source of truth (seller delivery only)
  const txStatus = getEffectiveTransactionStatus(order);

  // Disputes override everything else
  if (txStatus === 'DISPUTE_OPENED' || (order.disputeStatus && order.disputeStatus !== 'none' && order.disputeStatus !== 'cancelled')) {
    return {
      statusKey: 'disputed',
      currentStepLabel: 'Dispute open',
      waitingOn: 'Waiting on admin review',
      needsAction: false,
      primaryAction: { kind: 'view_details', label: 'View details' },
    };
  }

  // Permit-gated flow (TPWD transfer approvals, etc.)
  if (order.transferPermitRequired) {
    const s = order.transferPermitStatus || 'none';
    const isApproved = s === 'approved';
    if (!isApproved) {
      const needsAction = s === 'none' || s === 'rejected';
      return {
        statusKey: 'awaiting_permit',
        currentStepLabel: 'Awaiting transfer permit',
        waitingOn:
          s === 'uploaded'
            ? 'Waiting on admin review'
            : s === 'requested'
              ? 'Waiting on permit submission'
              : s === 'rejected'
                ? 'Permit rejected — action required'
                : 'Waiting on permit submission',
        needsAction,
        primaryAction: { kind: 'complete_transfer', label: 'Complete transfer steps' },
      };
    }
  }

  // Seller delivery workflow
  if (txStatus === 'DELIVERED_PENDING_CONFIRMATION') {
    return {
      statusKey: 'delivered',
      currentStepLabel: 'Delivered',
      waitingOn: 'Waiting on you to confirm receipt',
      needsAction: true,
      primaryAction: { kind: 'confirm_receipt', label: 'Confirm receipt' },
    };
  }
  if (txStatus === 'DELIVERY_PROPOSED') {
    return {
      statusKey: 'in_transit',
      currentStepLabel: 'Choose delivery date',
      waitingOn: 'Pick one of the seller’s proposed times',
      needsAction: true,
      primaryAction: { kind: 'agree_delivery', label: 'Choose date' },
    };
  }
  if (txStatus === 'OUT_FOR_DELIVERY' || txStatus === 'DELIVERY_SCHEDULED') {
    return {
      statusKey: 'in_transit',
      currentStepLabel: txStatus === 'OUT_FOR_DELIVERY' ? 'Out for delivery' : 'Delivery scheduled',
      waitingOn: 'Waiting on delivery',
      needsAction: false,
      primaryAction: { kind: 'view_details', label: 'View details' },
    };
  }
  if (txStatus === 'COMPLETED') {
    return {
      statusKey: 'completed',
      currentStepLabel: 'Transaction complete',
      waitingOn: undefined,
      needsAction: false,
      primaryAction: { kind: 'view_details', label: 'View details' },
    };
  }

  // AWAITING_TRANSFER_COMPLIANCE - compliance gate for regulated whitetail deals
  if (txStatus === 'AWAITING_TRANSFER_COMPLIANCE') {
    const { isRegulatedWhitetailDeal, hasComplianceConfirmations } = require('@/lib/compliance/whitetail');
    if (isRegulatedWhitetailDeal(order)) {
      const confirmations = hasComplianceConfirmations(order);
      return {
        statusKey: 'awaiting_permit',
        currentStepLabel: 'Awaiting TPWD transfer permit confirmation',
        waitingOn: confirmations.buyerConfirmed && confirmations.sellerConfirmed
          ? 'Both parties confirmed - fulfillment unlocking'
          : confirmations.buyerConfirmed
            ? 'Waiting on seller to confirm compliance'
            : confirmations.sellerConfirmed
              ? 'Waiting on you to confirm compliance'
              : 'Waiting on both parties to confirm compliance',
        needsAction: !confirmations.buyerConfirmed, // Buyer needs to confirm
        primaryAction: { kind: 'view_details', label: 'Confirm compliance' },
      };
    }
  }

  // FULFILLMENT_REQUIRED - seller must start fulfillment
  if (txStatus === 'FULFILLMENT_REQUIRED') {
    return {
      statusKey: 'held', // Maps to "Fulfillment in progress" badge
      currentStepLabel: 'Payment received',
      waitingOn: 'Waiting on seller to begin preparing',
      needsAction: false,
      primaryAction: { kind: 'view_details', label: 'View details' },
    };
  }

  // PENDING_PAYMENT
  if (txStatus === 'PENDING_PAYMENT') {
    return {
      statusKey: 'processing',
      currentStepLabel: 'Payment processing',
      waitingOn: 'Waiting on payment confirmation',
      needsAction: false,
      primaryAction: { kind: 'view_details', label: 'View details' },
    };
  }

  // Default fallback
  return {
    statusKey: 'processing',
    currentStepLabel: 'Processing',
    waitingOn: undefined,
    needsAction: false,
    primaryAction: { kind: 'view_details', label: 'View details' },
  };
}

