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
 * Get all milestones for an order (transport-aware)
 */
export function getOrderMilestones(order: Order): OrderMilestone[] {
  const txStatus = getEffectiveTransactionStatus(order);
  const transportOption = order.transportOption || 'SELLER_TRANSPORT';
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
      label: 'Choose delivery date',
      isComplete: deliveryScheduled,
      isCurrent: txStatus === 'DELIVERY_PROPOSED' && !deliveryScheduled,
      isBlocked: false,
      ownerRole: 'buyer',
      helpText: 'Pick one of the seller’s proposed delivery times.',
    });

    milestones.push({
      key: 'out_for_delivery',
      label: 'Out for delivery',
      isComplete: outForDelivery,
      isCurrent: txStatus === 'DELIVERY_SCHEDULED' && !outForDelivery,
      isBlocked: false,
      ownerRole: 'seller',
      completedAt: isValidNonEpochDate(order.inTransitAt) ? order.inTransitAt : undefined,
    });

    milestones.push({
      key: 'delivered',
      label: 'Delivered',
      isComplete: delivered,
      isCurrent: txStatus === 'OUT_FOR_DELIVERY' && !delivered,
      isBlocked: false,
      ownerRole: 'seller',
      completedAt: isValidNonEpochDate(order.deliveredAt) ? order.deliveredAt : undefined,
    });

    milestones.push({
      key: 'confirm_receipt',
      label: 'Confirm receipt',
      isComplete: completed,
      isCurrent: txStatus === 'DELIVERED_PENDING_CONFIRMATION' && !completed,
      isBlocked: false,
      ownerRole: 'buyer',
      dueAt: isValidNonEpochDate(order.disputeDeadlineAt) ? order.disputeDeadlineAt : undefined,
      helpText: 'Confirm you received the order to complete the transaction.',
      completedAt: isValidNonEpochDate(order.buyerConfirmedAt ?? order.acceptedAt) ? (order.buyerConfirmedAt ?? order.acceptedAt) : undefined,
    });
  }

  // Completion milestone
  if (txStatus === 'COMPLETED') {
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
    if (txStatus === 'DELIVERED_PENDING_CONFIRMATION') {
      return {
        title: 'Confirm receipt',
        description: 'Confirm you received the order to complete the transaction.',
        ctaLabel: ORDER_COPY.actions.confirmReceipt,
        ctaAction: `/dashboard/orders/${order.id}#confirm-receipt`,
        severity: 'info',
        dueAt: isValidNonEpochDate(order.disputeDeadlineAt) ? order.disputeDeadlineAt : undefined,
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
        title: 'Waiting for delivery',
        description: 'Your order is on its way. You will be able to confirm receipt once it arrives.',
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
        description: 'Seller will propose a delivery date using your address. You’ll confirm the date, then confirm receipt when it arrives.',
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
        description: 'Propose delivery times. Buyer will choose one that works.',
        ctaLabel: ORDER_COPY.actions.scheduleDelivery,
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
        title: 'Mark delivered',
        description: 'Mark the order as delivered once it arrives.',
        ctaLabel: ORDER_COPY.actions.markDelivered,
        ctaAction: `/seller/orders/${order.id}#mark-delivered`,
        severity: 'info',
        ownerRole: 'seller',
      };
    }
    if (txStatus === 'DELIVERED_PENDING_CONFIRMATION') {
      return {
        title: 'Waiting on buyer',
        description: 'Waiting for buyer to confirm receipt.',
        ctaLabel: 'View Details',
        ctaAction: `/seller/orders/${order.id}`,
        severity: 'info',
        ownerRole: 'buyer',
      };
    }
  }

  if (role === 'admin') {
    // Admin actions focus on escalation and intervention (ignore epoch)
    const slaDeadline = isValidNonEpochDate(order.fulfillmentSlaDeadlineAt) ? order.fulfillmentSlaDeadlineAt : null;
    const now = Date.now();
    const isSlaUrgent = slaDeadline !== null && (slaDeadline.getTime() - now) < 24 * 60 * 60 * 1000;
    const isSlaOverdue = slaDeadline !== null && slaDeadline.getTime() < now;

    let blockingRole: 'buyer' | 'seller' | 'system' = 'system';
    if (txStatus === 'FULFILLMENT_REQUIRED') blockingRole = 'seller';
    else if (txStatus === 'DELIVERY_PROPOSED') blockingRole = 'buyer';
    else if (txStatus === 'DELIVERED_PENDING_CONFIRMATION') blockingRole = 'buyer';

    const severity: NextActionSeverity = isSlaOverdue ? 'danger' : isSlaUrgent ? 'warning' : 'info';

    return {
      title: `Action needed: ${blockingRole === 'buyer' ? 'Buyer' : 'Seller'}`,
      description: `Order is waiting on ${blockingRole}. ${isSlaOverdue ? 'SLA deadline has passed.' : isSlaUrgent ? 'SLA deadline approaching.' : ''}`,
      ctaLabel: `Remind ${blockingRole === 'buyer' ? 'Buyer' : 'Seller'}`,
      ctaAction: `/dashboard/admin/ops?orderId=${order.id}`,
      severity,
      dueAt: slaDeadline ?? undefined,
      ownerRole: blockingRole,
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
