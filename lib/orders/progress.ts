/**
 * Order Progress System - Single Source of UX Truth
 * 
 * Provides unified milestone tracking and next action determination
 * across buyer, seller, and admin views.
 * 
 * NON-NEGOTIABLES:
 * - Uses transactionStatus (via getEffectiveTransactionStatus) as source of truth
 * - Transport-aware (SELLER_TRANSPORT vs BUYER_TRANSPORT)
 * - NO escrow/hold/release language
 */

import type { Order, TransactionStatus } from '@/lib/types';
import { isValidNonEpochDate } from '@/lib/utils';
import { getEffectiveTransactionStatus } from './status';
import { isRegulatedWhitetailDeal, hasComplianceConfirmations } from '@/lib/compliance/whitetail';
import { ORDER_COPY, getStatusLabel } from './copy';

/**
 * Balance due for final payment (deposit flow).
 * When the buyer paid a deposit, balance due = order total − deposit.
 * Otherwise uses stored finalPaymentAmount (legacy or precomputed).
 */
export function getOrderBalanceDue(order: Order): number {
  const total = typeof order.amount === 'number' ? order.amount : 0;
  const deposit = typeof (order as any).depositAmount === 'number' ? (order as any).depositAmount : 0;
  if (deposit > 0 && total >= deposit) {
    return Math.round((total - deposit) * 100) / 100;
  }
  const stored = typeof (order as any).finalPaymentAmount === 'number' ? (order as any).finalPaymentAmount : 0;
  return stored;
}

export type MilestoneOwnerRole = 'buyer' | 'seller' | 'system' | 'admin';

export interface OrderMilestone {
  key: string;
  label: string;
  isComplete: boolean;
  isCurrent: boolean;
  isBlocked: boolean;
  ownerRole: MilestoneOwnerRole;
  dueAt?: Date;
  helpText?: string;
  completedAt?: Date;
}

export type NextActionSeverity = 'info' | 'warning' | 'danger';

export interface NextRequiredAction {
  title: string;
  description: string;
  ctaLabel: string;
  ctaAction: string; // route or action identifier
  severity: NextActionSeverity;
  dueAt?: Date;
  blockedReason?: string;
  ownerRole: MilestoneOwnerRole;
}

export type UXBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface UXBadge {
  label: string;
  variant: UXBadgeVariant;
}

/**
 * Get all milestones for an order (transport-aware).
 * Role affects labels for the "out for delivery" step: when scheduled but not yet started,
 * seller sees "Start delivery" and buyer sees "Out for delivery".
 */
export function getOrderMilestones(order: Order, role?: 'buyer' | 'seller'): OrderMilestone[] {
  const txStatus = getEffectiveTransactionStatus(order);
  const transportOption = order.transportOption || 'SELLER_TRANSPORT';
  const viewerRole: 'buyer' | 'seller' = role === 'seller' ? 'seller' : 'buyer';
  const milestones: OrderMilestone[] = [];

  // Payment milestone (always first, system-owned)
  milestones.push({
    key: 'payment',
    label: 'Payment received',
    isComplete: !!order.paidAt,
    isCurrent: txStatus === 'PENDING_PAYMENT' || txStatus === 'PAID',
    isBlocked: false,
    ownerRole: 'system',
    completedAt: isValidNonEpochDate(order.paidAt) ? order.paidAt : undefined,
  });

  // Compliance gate (if regulated whitetail)
  if (isRegulatedWhitetailDeal(order)) {
    const confirmations = hasComplianceConfirmations(order);
    const complianceComplete = confirmations.bothConfirmed;
    const complianceCurrent = txStatus === 'AWAITING_TRANSFER_COMPLIANCE';

    milestones.push({
      key: 'compliance',
      label: 'TPWD transfer compliance',
      isComplete: complianceComplete,
      isCurrent: complianceCurrent && !complianceComplete,
      isBlocked: false,
      ownerRole: confirmations.buyerConfirmed && !confirmations.sellerConfirmed
        ? 'seller'
        : !confirmations.buyerConfirmed && confirmations.sellerConfirmed
          ? 'buyer'
          : 'buyer', // Default to buyer if neither confirmed
      helpText: 'Both buyer and seller must confirm TPWD transfer permit compliance before fulfillment can begin.',
      completedAt: (() => {
        const u = order.complianceTransfer?.unlockedAt;
        return isValidNonEpochDate(u) ? u! : undefined;
      })(),
    });
  }

  // Fulfillment milestones — seller delivery only (buyer pickup removed)
  const effectiveTransport = 'SELLER_TRANSPORT' as const;
  if (effectiveTransport === 'SELLER_TRANSPORT') {
    const hasBuyerAddress = !!(order.delivery as any)?.buyerAddress?.line1;
    const deliveryProposed = ['DELIVERY_PROPOSED', 'DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 'DELIVERED_PENDING_CONFIRMATION', 'COMPLETED'].includes(txStatus);
    const deliveryScheduled = ['DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 'DELIVERED_PENDING_CONFIRMATION', 'COMPLETED'].includes(txStatus);
    const outForDelivery = ['OUT_FOR_DELIVERY', 'DELIVERED_PENDING_CONFIRMATION', 'COMPLETED'].includes(txStatus);
    const delivered = ['DELIVERED_PENDING_CONFIRMATION', 'COMPLETED'].includes(txStatus);
    const completed = txStatus === 'COMPLETED';

    milestones.push({
      key: 'set_delivery_address',
      label: 'Set delivery address',
      isComplete: hasBuyerAddress,
      isCurrent: txStatus === 'FULFILLMENT_REQUIRED' && !hasBuyerAddress,
      isBlocked: txStatus === 'AWAITING_TRANSFER_COMPLIANCE',
      ownerRole: 'buyer',
      helpText: 'Buyer sets address or drops a pin. Seller uses it to propose a delivery date.',
      completedAt: hasBuyerAddress && isValidNonEpochDate((order.delivery as any)?.buyerAddressSetAt)
        ? (order.delivery as any).buyerAddressSetAt
        : undefined,
    });

    milestones.push({
      key: 'schedule_delivery',
      label: 'Propose delivery date',
      isComplete: deliveryProposed,
      isCurrent: txStatus === 'FULFILLMENT_REQUIRED' && hasBuyerAddress && !deliveryProposed,
      isBlocked: txStatus === 'AWAITING_TRANSFER_COMPLIANCE' || (txStatus === 'FULFILLMENT_REQUIRED' && !hasBuyerAddress),
      ownerRole: 'seller',
      helpText: 'Propose delivery times. Buyer will choose one that works.',
    });

    milestones.push({
      key: 'agree_delivery',
      label: 'Accept delivery date',
      isComplete: deliveryScheduled,
      isCurrent: txStatus === 'DELIVERY_PROPOSED' && !deliveryScheduled,
      isBlocked: false,
      ownerRole: 'buyer',
      helpText: 'Pick one of the seller’s proposed delivery times.',
    });

    const balanceDue = getOrderBalanceDue(order);
    const hasFinalPaymentDue = balanceDue > 0;
    const inspectionFinalComplete = !!order.finalPaymentConfirmedAt || !hasFinalPaymentDue;
    // Out for delivery + Inspection and Final payment: current (orange) until buyer pays; Out for delivery turns green only when delivery is actually done.
    const combinedPhaseCurrent =
      txStatus === 'DELIVERY_SCHEDULED' || (txStatus === 'OUT_FOR_DELIVERY' && hasFinalPaymentDue && !inspectionFinalComplete);
    const combinedPhaseComplete = inspectionFinalComplete; // Inspection/Final payment complete when buyer pays
    // Out for delivery is complete only when we're past that phase (delivery done or transaction complete)
    const outForDeliveryComplete = delivered || completed;

    // When DELIVERY_SCHEDULED: seller sees "Start delivery". Once OUT_FOR_DELIVERY, seller sees "Out for delivery" (waiting on buyer to pay).
    const outStepLabel =
      combinedPhaseComplete ? 'Out for delivery' : combinedPhaseCurrent && viewerRole === 'seller' && txStatus === 'DELIVERY_SCHEDULED' ? 'Start delivery' : 'Out for delivery';

    // For buyer: step is "complete" when they've paid (inspection/final payment done). For seller: when delivery is done.
    const outForDeliveryStepComplete = viewerRole === 'buyer' ? inspectionFinalComplete : outForDeliveryComplete;
    const outForDeliveryCompletedAt = viewerRole === 'buyer'
      ? (inspectionFinalComplete && isValidNonEpochDate(order.finalPaymentConfirmedAt) ? order.finalPaymentConfirmedAt : undefined)
      : (outForDeliveryComplete && isValidNonEpochDate(order.deliveredAt) ? order.deliveredAt : undefined);

    milestones.push({
      key: 'out_for_delivery',
      label: outStepLabel,
      isComplete: outForDeliveryStepComplete,
      isCurrent: combinedPhaseCurrent,
      isBlocked: false,
      ownerRole: 'seller',
      completedAt: outForDeliveryCompletedAt,
    });

    // Inspection and Final payment: only used internally (e.g. stalled-step label). Not shown as a separate milestone for buyer or seller — merged into Out for delivery.

    // Delivery: seller has checklist, buyer has PIN. Label "Delivery" until complete, then "Delivered".
    const deliveredCurrent =
      (txStatus === 'DELIVERED_PENDING_CONFIRMATION' || (txStatus === 'OUT_FOR_DELIVERY' && inspectionFinalComplete)) && !completed;
    milestones.push({
      key: 'delivered',
      label: completed ? 'Delivered' : 'Delivery',
      isComplete: completed,
      isCurrent: deliveredCurrent,
      isBlocked: false,
      ownerRole: 'seller',
      helpText: 'Seller completes delivery checklist at handoff (PIN, signature, photo). Buyer uses PIN when seller arrives.',
      completedAt: isValidNonEpochDate(order.deliveredAt) ? order.deliveredAt : undefined,
    });

    // Transaction complete: always show after Delivery/Delivered (pending until checklist is done).
    milestones.push({
      key: 'completed',
      label: 'Transaction complete',
      isComplete: completed,
      isCurrent: false,
      isBlocked: false,
      ownerRole: 'system',
      completedAt: isValidNonEpochDate(order.completedAt) ? order.completedAt : undefined,
    });
  }

  // Completion milestone for non–seller-delivery flows (e.g. pickup) when already completed
  if (txStatus === 'COMPLETED' && milestones[milestones.length - 1]?.key !== 'completed') {
    milestones.push({
      key: 'completed',
      label: 'Transaction complete',
      isComplete: true,
      isCurrent: false,
      isBlocked: false,
      ownerRole: 'system',
      completedAt: isValidNonEpochDate(order.completedAt) ? order.completedAt : undefined,
    });
  }

  return milestones;
}

/**
 * Get the next required action for a specific role
 */
export function getNextRequiredAction(order: Order, role: 'buyer' | 'seller' | 'admin'): NextRequiredAction | null {
  const txStatus = getEffectiveTransactionStatus(order);
  const isRegulated = isRegulatedWhitetailDeal(order);

  // Terminal states
  if (txStatus === 'COMPLETED' || txStatus === 'REFUNDED' || txStatus === 'CANCELLED') {
    return null;
  }

  // Dispute handling
  if (txStatus === 'DISPUTE_OPENED') {
    if (role === 'admin') {
      return {
        title: 'Review dispute',
        description: 'A dispute has been opened. Review evidence and resolve.',
        ctaLabel: 'View Dispute',
        ctaAction: `/dashboard/admin/ops?orderId=${order.id}`,
        severity: 'danger',
        ownerRole: 'admin',
      };
    }
    return {
      title: 'Dispute under review',
      description: 'This order has an open dispute. Admin will review and respond.',
      ctaLabel: 'View Details',
      ctaAction: `/dashboard/orders/${order.id}`,
      severity: 'warning',
      ownerRole: 'admin',
    };
  }

  // Compliance gate
  if (txStatus === 'AWAITING_TRANSFER_COMPLIANCE' && isRegulated) {
    const confirmations = hasComplianceConfirmations(order);
    
    if (role === 'buyer' && !confirmations.buyerConfirmed) {
      return {
        title: 'Confirm TPWD transfer compliance',
        description: 'You must confirm TPWD transfer permit compliance before pickup can be scheduled.',
        ctaLabel: ORDER_COPY.actions.confirmCompliance,
        ctaAction: `/dashboard/orders/${order.id}#compliance`,
        severity: 'warning',
        ownerRole: 'buyer',
        blockedReason: 'Compliance confirmation required',
      };
    }
    
    if (role === 'seller' && !confirmations.sellerConfirmed) {
      return {
        title: 'Confirm TPWD transfer compliance',
        description: 'You must confirm TPWD transfer permit compliance before delivery can be scheduled.',
        ctaLabel: ORDER_COPY.actions.confirmCompliance,
        ctaAction: `/seller/orders/${order.id}#compliance`,
        severity: 'warning',
        ownerRole: 'seller',
        blockedReason: 'Compliance confirmation required',
      };
    }
    
    if (role === 'admin') {
      const waitingOn = !confirmations.buyerConfirmed && !confirmations.sellerConfirmed
        ? 'both parties'
        : !confirmations.buyerConfirmed
          ? 'buyer'
          : 'seller';
      return {
        title: `Waiting on ${waitingOn} for compliance confirmation`,
        description: 'Regulated whitetail order requires TPWD transfer permit confirmation from both parties.',
        ctaLabel: 'Send Reminder',
        ctaAction: `/dashboard/admin/ops?orderId=${order.id}`,
        severity: 'warning',
        ownerRole: waitingOn === 'both parties' ? 'buyer' : (waitingOn === 'buyer' ? 'buyer' : 'seller'),
      };
    }
  }

  // Role-specific actions (seller delivery only)
  if (role === 'buyer') {
    const balanceDue = getOrderBalanceDue(order);
    const hasFinalPaymentDue = balanceDue > 0 && !(order as any).finalPaymentConfirmedAt;
    if (
      (txStatus === 'DELIVERY_SCHEDULED' || txStatus === 'OUT_FOR_DELIVERY') &&
      hasFinalPaymentDue
    ) {
      return {
        title: 'Inspection and Final payment',
        description: 'Complete your final payment (balance due).',
        ctaLabel: 'Pay now',
        ctaAction: `/dashboard/orders/${order.id}#pay-final`,
        severity: 'warning',
        ownerRole: 'buyer',
      };
    }
    if (txStatus === 'DELIVERED_PENDING_CONFIRMATION') {
      return {
        title: 'Complete delivery',
        description: 'Use your delivery PIN when the seller arrives with the checklist. They’ll have you enter it, sign, and take a photo to complete the transaction.',
        ctaLabel: 'View order',
        ctaAction: `/dashboard/orders/${order.id}`,
        severity: 'info',
        ownerRole: 'buyer',
      };
    }
    if (txStatus === 'DELIVERY_PROPOSED') {
      return {
        title: ORDER_COPY.chooseDeliveryDate.title,
        description: ORDER_COPY.chooseDeliveryDate.description,
        ctaLabel: ORDER_COPY.actions.chooseDeliveryDate,
        ctaAction: `/dashboard/orders/${order.id}#choose-delivery-date`,
        severity: 'warning',
        ownerRole: 'buyer',
      };
    }
    if (['DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY'].includes(txStatus)) {
      return {
        title: 'Out for delivery',
        description: 'Your order is on its way. At handoff you’ll complete the delivery checklist.',
        ctaLabel: 'View Details',
        ctaAction: `/dashboard/orders/${order.id}`,
        severity: 'info',
        ownerRole: 'seller',
      };
    }
    if (txStatus === 'FULFILLMENT_REQUIRED') {
      const hasBuyerAddress = !!(order.delivery as any)?.buyerAddress?.line1;
      if (!hasBuyerAddress) {
        return {
          title: 'Set delivery address',
          description: 'Add your delivery address or drop a pin. The seller will use it to propose a delivery date.',
          ctaLabel: 'Set address',
          ctaAction: `/dashboard/orders/${order.id}#set-delivery-address`,
          severity: 'warning',
          ownerRole: 'buyer',
        };
      }
      return {
        title: 'Waiting on seller',
        description: 'Seller will propose a delivery date using your address. You’ll confirm the date, pay any balance due, then complete delivery with the checklist when they arrive.',
        ctaLabel: 'View order',
        ctaAction: `/dashboard/orders/${order.id}`,
        severity: 'info',
        ownerRole: 'seller',
      };
    }
  }

  if (role === 'seller') {
    if (txStatus === 'FULFILLMENT_REQUIRED') {
      const hasBuyerAddress = !!(order.delivery as any)?.buyerAddress?.line1;
      if (!hasBuyerAddress) {
        return {
          title: 'Waiting for buyer to set delivery address',
          description: 'The buyer sets their delivery address first. Once they do, you’ll see it and can propose a delivery date.',
          ctaLabel: 'View order',
          ctaAction: `/seller/orders/${order.id}`,
          severity: 'info',
          ownerRole: 'buyer',
        };
      }
      return {
        title: 'Propose delivery date',
        description: 'Offer one or more date and time windows for delivery. The buyer will pick one that works, then you coordinate the handoff.',
        ctaLabel: 'Propose delivery date',
        ctaAction: `/seller/orders/${order.id}#schedule-delivery`,
        severity: 'warning',
        dueAt: isValidNonEpochDate(order.fulfillmentSlaDeadlineAt) ? order.fulfillmentSlaDeadlineAt : undefined,
        ownerRole: 'seller',
      };
    }
    if (txStatus === 'DELIVERY_PROPOSED') {
      return {
        title: ORDER_COPY.chooseDeliveryDate.waitingForBuyer,
        description: ORDER_COPY.chooseDeliveryDate.waitingForBuyerDescription,
        ctaLabel: 'View order',
        ctaAction: `/seller/orders/${order.id}`,
        severity: 'info',
        ownerRole: 'buyer',
      };
    }
    if (txStatus === 'DELIVERY_SCHEDULED') {
      return {
        title: 'Mark out for delivery',
        description: 'Update status when the order is on its way.',
        ctaLabel: ORDER_COPY.actions.markOutForDelivery,
        ctaAction: `/seller/orders/${order.id}#mark-out`,
        severity: 'info',
        ownerRole: 'seller',
      };
    }
    if (txStatus === 'OUT_FOR_DELIVERY') {
      return {
        title: 'Complete delivery checklist',
        description: 'Open the checklist at handoff — recipient enters PIN, signs, you take a photo.',
        ctaLabel: 'Open checklist',
        ctaAction: `/seller/orders/${order.id}`,
        severity: 'info',
        ownerRole: 'seller',
      };
    }
    if (txStatus === 'DELIVERED_PENDING_CONFIRMATION') {
      return {
        title: 'Complete delivery checklist',
        description: 'At handoff, have the buyer enter their PIN, sign, and take a photo to complete the transaction.',
        ctaLabel: 'Open checklist',
        ctaAction: `/seller/orders/${order.id}`,
        severity: 'info',
        ownerRole: 'seller',
      };
    }
  }

  if (role === 'admin') {
    // Admin actions focus on escalation and intervention (ignore epoch)
    const isRegulated = isRegulatedWhitetailDeal(order);
    const slaDeadline = isValidNonEpochDate(order.fulfillmentSlaDeadlineAt) ? order.fulfillmentSlaDeadlineAt : null;
    const now = Date.now();
    const isSlaUrgent = slaDeadline !== null && (slaDeadline.getTime() - now) < 24 * 60 * 60 * 1000;
    const isSlaOverdue = slaDeadline !== null && slaDeadline.getTime() < now;
    const hasBuyerAddress = !!(order.delivery as any)?.buyerAddress?.line1;
    const transport = order.transportOption || 'SELLER_TRANSPORT';

    let blockingRole: 'buyer' | 'seller' | 'system' = 'system';
    let stalledStep = '';

    if (txStatus === 'AWAITING_TRANSFER_COMPLIANCE' && isRegulated) {
      const confirmations = hasComplianceConfirmations(order);
      if (!confirmations.buyerConfirmed) {
        blockingRole = 'buyer';
        stalledStep = 'Compliance confirmation';
      } else if (!confirmations.sellerConfirmed) {
        blockingRole = 'seller';
        stalledStep = 'Compliance confirmation';
      }
    } else if (txStatus === 'FULFILLMENT_REQUIRED') {
      if (transport === 'SELLER_TRANSPORT') {
        if (!hasBuyerAddress) {
          blockingRole = 'buyer';
          stalledStep = 'Set delivery address';
        } else {
          blockingRole = 'seller';
          stalledStep = 'Propose delivery date';
        }
      } else {
        blockingRole = 'seller';
        stalledStep = 'Set pickup info';
      }
    } else if (txStatus === 'DELIVERY_PROPOSED') {
      blockingRole = 'buyer';
      stalledStep = 'Accept delivery date';
    } else if (txStatus === 'DELIVERY_SCHEDULED') {
      blockingRole = 'seller';
      stalledStep = 'Mark out for delivery';
    } else if (txStatus === 'OUT_FOR_DELIVERY') {
      blockingRole = 'seller';
      stalledStep = 'Mark delivered';
    } else if (txStatus === 'DELIVERED_PENDING_CONFIRMATION') {
      blockingRole = 'seller';
      stalledStep = 'Complete delivery checklist';
    } else if (txStatus === 'READY_FOR_PICKUP' || txStatus === 'PICKUP_PROPOSED') {
      blockingRole = 'buyer';
      stalledStep = 'Select pickup window';
    } else if (txStatus === 'PICKUP_SCHEDULED') {
      blockingRole = 'buyer';
      stalledStep = 'Confirm pickup';
    }

    const severity: NextActionSeverity = isSlaOverdue ? 'danger' : isSlaUrgent ? 'warning' : 'info';

    return {
      title: `Waiting on ${blockingRole === 'buyer' ? 'Buyer' : blockingRole === 'seller' ? 'Seller' : 'System'}`,
      description: stalledStep
        ? `${blockingRole === 'buyer' ? 'Buyer' : blockingRole === 'seller' ? 'Seller' : 'System'} needs to: ${stalledStep}. ${isSlaOverdue ? 'SLA passed.' : isSlaUrgent ? 'SLA approaching.' : ''}`
        : `Order is waiting on ${blockingRole}.`,
      ctaLabel: `Remind ${blockingRole === 'buyer' ? 'Buyer' : 'Seller'}`,
      ctaAction: `/dashboard/admin/ops?orderId=${order.id}`,
      severity,
      dueAt: slaDeadline ?? undefined,
      ownerRole: blockingRole === 'system' ? 'seller' : blockingRole,
    };
  }

  return null;
}

/**
 * Get consistent UX badge for an order (NO payout hold language)
 */
export function getUXBadge(order: Order, role: 'buyer' | 'seller' | 'admin'): UXBadge {
  const txStatus = getEffectiveTransactionStatus(order);
  const transportOption = order.transportOption || 'SELLER_TRANSPORT';
  const nextAction = getNextRequiredAction(order, role);

  // Dispute badge
  if (txStatus === 'DISPUTE_OPENED') {
    return {
      label: ORDER_COPY.fulfillment.disputeOpen,
      variant: 'destructive',
    };
  }

  // Completed
  if (txStatus === 'COMPLETED') {
    return {
      label: ORDER_COPY.fulfillment.completed,
      variant: 'default',
    };
  }

  // Terminal states
  if (txStatus === 'REFUNDED' || txStatus === 'CANCELLED') {
    return {
      label: getStatusLabel(txStatus),
      variant: 'secondary',
    };
  }

  // Role-specific badges
  if (role === 'buyer') {
    if (nextAction && nextAction.ownerRole === 'buyer') {
      return {
        label: ORDER_COPY.fulfillment.actionNeeded,
        variant: 'secondary',
      };
    }
    if (nextAction && nextAction.ownerRole === 'seller') {
      return {
        label: ORDER_COPY.fulfillment.waitingOnSeller,
        variant: 'secondary',
      };
    }
  }

  if (role === 'seller') {
    if (nextAction && nextAction.ownerRole === 'seller') {
      return {
        label: ORDER_COPY.fulfillment.actionNeeded,
        variant: 'secondary',
      };
    }
    if (nextAction && nextAction.ownerRole === 'buyer') {
      return {
        label: ORDER_COPY.fulfillment.waitingOnBuyer,
        variant: 'secondary',
      };
    }
  }

  // Default: use status label
  return {
    label: getStatusLabel(txStatus),
    variant: 'secondary',
  };
}
