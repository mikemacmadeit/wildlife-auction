import type { Order } from '@/lib/types';

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
  | { kind: 'view_details'; label: string };

export function deriveOrderUIState(order: Order): {
  statusKey: PurchasesStatusKey;
  currentStepLabel: string;
  waitingOn?: string;
  needsAction: boolean;
  primaryAction: PurchasesPrimaryAction;
} {
  // Disputes override everything else
  if (order.status === 'disputed' || (order.disputeStatus && order.disputeStatus !== 'none' && order.disputeStatus !== 'cancelled')) {
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

  // Delivery + escrow flow
  if (order.status === 'delivered') {
    return {
      statusKey: 'delivered',
      currentStepLabel: 'Delivered',
      waitingOn: 'Waiting on you to confirm receipt',
      needsAction: true,
      primaryAction: { kind: 'confirm_receipt', label: 'Confirm receipt' },
    };
  }

  if (order.status === 'in_transit') {
    return {
      statusKey: 'in_transit',
      currentStepLabel: 'In transit',
      waitingOn: 'Waiting on delivery',
      needsAction: false,
      primaryAction: { kind: 'view_details', label: 'View details' },
    };
  }

  if (order.status === 'buyer_confirmed' || order.status === 'ready_to_release') {
    return {
      statusKey: 'held',
      currentStepLabel: 'Buyer confirmed',
      waitingOn: 'Waiting on admin release',
      needsAction: false,
      primaryAction: { kind: 'view_details', label: 'View details' },
    };
  }

  if (order.status === 'completed') {
    return {
      statusKey: 'completed',
      currentStepLabel: order.stripeTransferId ? 'Payment released' : 'Completed',
      needsAction: false,
      primaryAction: { kind: 'view_details', label: 'View details' },
    };
  }

  if (order.status === 'paid_held' || order.status === 'paid') {
    return {
      statusKey: 'held',
      // Badge already communicates "Held (escrow)" — avoid redundant "Paid (held)" copy here.
      currentStepLabel: 'Waiting on seller delivery',
      needsAction: false,
      primaryAction: { kind: 'view_details', label: 'View details' },
    };
  }

  // Default / processing states: pending / awaiting bank rails / awaiting wire
  return {
    statusKey: 'processing',
    currentStepLabel: 'Payment processing',
    waitingOn: 'Waiting on payment confirmation',
    needsAction: false,
    primaryAction: { kind: 'view_details', label: 'View details' },
  };
}

