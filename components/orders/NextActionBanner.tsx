/**
 * NextActionBanner
 * 
 * Prominent banner that appears at the top of order detail pages and in list rows
 * when action is required. Clearly states who needs to act, why it matters, and
 * provides a single primary CTA.
 */

'use client';

import { useMemo } from 'react';
import { AlertTriangle, Clock, CheckCircle2, Truck, MapPin, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import { isValidNonEpochDate } from '@/lib/utils';
import type { Order } from '@/lib/types';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { requiresSellerAction, requiresBuyerAction } from '@/lib/orders/status';

export type NextActionRole = 'buyer' | 'seller';

export interface NextActionBannerProps {
  order: Order;
  role: NextActionRole;
  onAction?: () => void;
  className?: string;
  variant?: 'banner' | 'inline'; // banner = full-width banner, inline = compact for list rows
}

export function NextActionBanner({
  order,
  role,
  onAction,
  className,
  variant = 'banner',
}: NextActionBannerProps) {
  const txStatus = getEffectiveTransactionStatus(order);
  const transportOption = order.transportOption || 'SELLER_TRANSPORT';
  const needsSellerAction = requiresSellerAction(order);
  const needsBuyerAction = requiresBuyerAction(order);

  // Calculate SLA urgency (ignore epoch – treat as "no deadline")
  const slaDeadline = isValidNonEpochDate(order.fulfillmentSlaDeadlineAt) ? order.fulfillmentSlaDeadlineAt : null;
  const now = Date.now();
  const slaTimeRemaining = slaDeadline ? Math.max(0, slaDeadline.getTime() - now) : null;
  const slaHoursRemaining = slaTimeRemaining !== null ? Math.floor(slaTimeRemaining / (1000 * 60 * 60)) : null;
  const isSlaUrgent = slaHoursRemaining !== null && slaHoursRemaining < 24;
  const isSlaOverdue = slaTimeRemaining !== null && slaTimeRemaining <= 0;

  // Determine if this role needs to act
  const actionRequired = role === 'seller' ? needsSellerAction : needsBuyerAction;

  const hasBuyerAddress = !!(order.delivery as any)?.buyerAddress?.line1;

  // Build action details based on status and transport (must be before early return for hooks rules)
  const actionDetails = useMemo(() => {
    if (role === 'seller') {
      if (txStatus === 'FULFILLMENT_REQUIRED') {
        if (transportOption === 'SELLER_TRANSPORT') {
          if (!hasBuyerAddress) {
            return {
              title: 'Waiting for buyer to set delivery address',
              description: 'The buyer sets their address first. Once they do, you can propose a delivery date.',
              urgency: 'normal' as const,
              ctaLabel: 'View order',
              icon: <MapPin className="h-5 w-5" />,
            };
          }
          return {
            title: 'Action required: Propose delivery date',
            description: 'Propose delivery windows. Buyer will confirm a date that works.',
            urgency: (isSlaOverdue ? 'overdue' : isSlaUrgent ? 'urgent' : 'normal') as 'overdue' | 'urgent' | 'normal',
            ctaLabel: 'Propose Delivery',
            icon: <Truck className="h-5 w-5" />,
          };
        } else {
          return {
            title: 'Action required: Set pickup information',
            description: 'Set pickup location and available time windows for the buyer.',
            urgency: isSlaOverdue ? 'overdue' : isSlaUrgent ? 'urgent' : 'normal',
            ctaLabel: 'Set Pickup Info',
            icon: <MapPin className="h-5 w-5" />,
          };
        }
      }
      if (txStatus === 'PICKUP_PROPOSED') {
        return {
          title: 'Action required: Agree to pickup window',
          description: 'Buyer proposed a pickup window. Agree to confirm the time.',
          urgency: 'normal',
          ctaLabel: 'Agree to Window',
          icon: <CheckCircle2 className="h-5 w-5" />,
        };
      }
      if (txStatus === 'DELIVERY_SCHEDULED') {
        return {
          title: 'Action required: Mark out for delivery',
          description: 'Confirm the order is on the way to the buyer.',
          urgency: 'normal',
          ctaLabel: 'Mark Out for Delivery',
          icon: <Truck className="h-5 w-5" />,
        };
      }
    }

    if (role === 'buyer') {
      if (txStatus === 'FULFILLMENT_REQUIRED' && transportOption === 'SELLER_TRANSPORT' && !hasBuyerAddress) {
        return {
          title: 'Set delivery address',
          description: 'Add your delivery address or drop a pin. The seller will use it to propose a delivery date.',
          urgency: 'normal' as const,
          ctaLabel: 'Set address',
          icon: <MapPin className="h-5 w-5" />,
        };
      }
      if (txStatus === 'DELIVERY_PROPOSED') {
        return {
          title: 'Action required: Agree to delivery window',
          description: 'Seller proposed delivery windows. Agree to one that works for you.',
          urgency: 'normal',
          ctaLabel: 'Agree to Window',
          icon: <CheckCircle2 className="h-5 w-5" />,
        };
      }
      if (txStatus === 'READY_FOR_PICKUP') {
        return {
          title: 'Action required: Propose pickup window',
          description: 'Choose a time window. Seller must agree before you confirm pickup.',
          urgency: 'normal',
          ctaLabel: 'Propose Pickup Window',
          icon: <Clock className="h-5 w-5" />,
        };
      }
      if (txStatus === 'PICKUP_SCHEDULED') {
        return {
          title: 'Action required: Confirm pickup',
          description: 'Enter the pickup code to confirm you received the order.',
          urgency: 'normal',
          ctaLabel: 'Confirm Pickup',
          icon: <PackageCheck className="h-5 w-5" />,
        };
      }
      if (txStatus === 'DELIVERED_PENDING_CONFIRMATION') {
        return {
          title: 'Action required: Confirm receipt',
          description: 'Confirm you received the order to complete the transaction.',
          urgency: 'normal',
          ctaLabel: 'Confirm Receipt',
          icon: <CheckCircle2 className="h-5 w-5" />,
        };
      }
    }

    // SLA overdue but no specific action (shouldn't happen, but handle gracefully)
    if (isSlaOverdue) {
      return {
        title: 'Order overdue',
        description: 'This order is past its fulfillment deadline. Please take action or contact support.',
        urgency: 'overdue',
        ctaLabel: 'View Details',
        icon: <AlertTriangle className="h-5 w-5" />,
      };
    }

    return null;
  }, [txStatus, transportOption, role, isSlaOverdue, isSlaUrgent, hasBuyerAddress]);

  // If no action required for this role, don't show banner
  if (!actionRequired && !isSlaOverdue) {
    return null;
  }

  if (!actionDetails) {
    return null;
  }

  const { title, description, urgency, ctaLabel, icon } = actionDetails;

  // Urgency styling
  const urgencyStyles: Record<'overdue' | 'urgent' | 'normal', string> = {
    overdue: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100',
    urgent: 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-100',
    normal: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100',
  };

  const urgencyStyle = urgencyStyles[urgency as 'overdue' | 'urgent' | 'normal'] || urgencyStyles.normal;

  if (variant === 'inline') {
    // Compact version for list rows
    return (
      <div className={cn('flex items-center gap-2 text-sm p-2 rounded border', urgencyStyle, className)}>
        {icon}
        <span className="font-semibold flex-1">{title}</span>
        {slaHoursRemaining !== null && !isSlaOverdue && (
          <Badge variant="outline" className="text-xs">
            {slaHoursRemaining < 24
              ? `${slaHoursRemaining}h remaining`
              : `${Math.floor(slaHoursRemaining / 24)}d remaining`}
          </Badge>
        )}
        {isSlaOverdue && (
          <Badge variant="destructive" className="text-xs">
            Overdue
          </Badge>
        )}
        {onAction && (
          <Button size="sm" variant="default" onClick={onAction} className="ml-auto">
            {ctaLabel}
          </Button>
        )}
      </div>
    );
  }

  // Full banner version
  return (
    <div className={cn('rounded-lg border p-4 space-y-3', urgencyStyle, className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-semibold text-base">{title}</div>
          <div className="text-sm opacity-90">{description}</div>
          <div className="flex items-center gap-3 flex-wrap mt-2">
            {slaHoursRemaining !== null && !isSlaOverdue && (
              <div className="flex items-center gap-1.5 text-xs">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {slaHoursRemaining < 24
                    ? `${slaHoursRemaining} hours remaining`
                    : `${Math.floor(slaHoursRemaining / 24)} days remaining`}
                </span>
              </div>
            )}
            {isSlaOverdue && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Past deadline
              </Badge>
            )}
            {slaDeadline && isValidNonEpochDate(slaDeadline) && (
              <div className="text-xs opacity-75">
                Deadline: {formatDistanceToNowStrict(slaDeadline, { addSuffix: true })}
              </div>
            )}
          </div>
        </div>
        {onAction && (
          <Button variant="default" onClick={onAction} className="w-full shrink-0 sm:w-auto">
            {ctaLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
