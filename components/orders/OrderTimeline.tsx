/**
 * OrderTimeline Component
 * 
 * Reusable visual timeline component for displaying order status progression
 * Used by buyer, seller, and admin views
 */

'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Shield,
  Truck,
  DollarSign,
  Ban,
  CreditCard,
  Package,
  Calendar,
} from 'lucide-react';
import { Order, DisputeStatus, PayoutHoldReason } from '@/lib/types';
import { formatDate, formatDistanceToNow } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface TimelineStep {
  key: string;
  label: string;
  date?: Date;
  status: 'complete' | 'pending' | 'blocked' | 'warning';
  description?: string;
  severity?: 'info' | 'warning' | 'error';
  icon?: React.ReactNode;
}

interface OrderTimelineProps {
  order: Order;
  compact?: boolean;
  showAdminFields?: boolean;
}

/**
 * Build timeline steps from order data
 */
export function buildOrderTimeline(order: Order, showAdminFields: boolean = false): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const now = new Date();

  // 1. Payment Completed
  if (order.paidAt) {
    steps.push({
      key: 'payment',
      label: 'Payment Completed',
      date: order.paidAt,
      status: 'complete',
      description: `Payment of ${order.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} captured`,
      icon: <CheckCircle2 className="h-4 w-4" />,
    });
  } else {
    steps.push({
      key: 'payment',
      label: 'Payment Pending',
      status: 'pending',
      description: 'Waiting for payment',
      icon: <Clock className="h-4 w-4" />,
    });
  }

  // 2. Dispute Window Deadline
  if (order.disputeDeadlineAt) {
    const deadline = order.disputeDeadlineAt;
    const isPast = deadline.getTime() < now.getTime();
    steps.push({
      key: 'dispute_deadline',
      label: 'Dispute Window',
      date: deadline,
      status: isPast ? 'complete' : 'pending',
      description: isPast
        ? 'Dispute window has closed'
        : `Buyer can dispute until ${formatDate(deadline)}`,
      severity: isPast ? 'info' : 'warning',
      icon: <Calendar className="h-4 w-4" />,
    });
  }

  // 3. In Transit / Delivered (Seller actions)
  if (order.deliveredAt) {
    steps.push({
      key: 'delivered',
      label: 'Marked Delivered',
      date: order.deliveredAt,
      status: 'complete',
      description: 'Seller marked order as delivered',
      icon: <Truck className="h-4 w-4" />,
    });
  } else if (order.status === 'in_transit') {
    steps.push({
      key: 'in_transit',
      label: 'In Transit',
      status: 'pending',
      description: 'Order is in transit',
      icon: <Truck className="h-4 w-4" />,
    });
  }

  // 4. Delivery Confirmed (Admin action)
  if (order.deliveryConfirmedAt) {
    steps.push({
      key: 'delivery_confirmed',
      label: 'Delivery Confirmed',
      date: order.deliveryConfirmedAt,
      status: 'complete',
      description: showAdminFields ? 'Admin confirmed delivery' : 'Delivery confirmed',
      icon: <CheckCircle2 className="h-4 w-4" />,
    });
  }

  // 5. Protection Window (if enabled)
  if (order.protectedTransactionDaysSnapshot && order.protectionStartAt && order.protectionEndsAt) {
    const protectionEnds = order.protectionEndsAt;
    const isActive = protectionEnds.getTime() > now.getTime();
    const daysRemaining = Math.ceil((protectionEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    steps.push({
      key: 'protection_window',
      label: `Protection Window (${order.protectedTransactionDaysSnapshot} Days)`,
      date: protectionEnds,
      status: isActive ? 'blocked' : 'complete',
      description: isActive
        ? `Eligible for payout in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`
        : 'Protection window has ended',
      severity: isActive ? 'warning' : 'info',
      icon: <Shield className="h-4 w-4" />,
    });
  }

  // 6. Buyer Accepted Early
  if (order.buyerAcceptedAt || order.acceptedAt) {
    const acceptedAt = order.buyerAcceptedAt || order.acceptedAt;
    steps.push({
      key: 'buyer_accepted',
      label: 'Buyer Accepted',
      date: acceptedAt,
      status: 'complete',
      description: 'Buyer confirmed receipt and accepted order',
      icon: <CheckCircle2 className="h-4 w-4" />,
    });
  }

  // 7. Dispute Opened
  if (order.disputeOpenedAt || (order.disputeStatus && order.disputeStatus !== 'none' && order.disputeStatus !== 'cancelled')) {
    const disputeStatus = order.disputeStatus || 'open';
    const evidenceCount = order.disputeEvidence?.length || 0;
    const isResolved = disputeStatus.startsWith('resolved_');
    const isCancelled = disputeStatus === 'cancelled';

    steps.push({
      key: 'dispute',
      label: 'Dispute Opened',
      date: order.disputeOpenedAt,
      status: isResolved || isCancelled ? 'complete' : 'blocked',
      description: isResolved
        ? `Dispute resolved (${disputeStatus.replace('resolved_', '')})`
        : isCancelled
        ? 'Dispute cancelled'
        : `Dispute: ${disputeStatus}${evidenceCount > 0 ? ` (${evidenceCount} evidence)` : ''}`,
      severity: isResolved || isCancelled ? 'info' : 'error',
      icon: <AlertTriangle className="h-4 w-4" />,
    });
  }

  // 8. Admin Hold
  if (order.adminHold) {
    steps.push({
      key: 'admin_hold',
      label: 'Admin Hold',
      status: 'blocked',
      description: order.payoutHoldReason === 'dispute_open'
        ? 'Order on hold due to dispute'
        : order.adminHoldReason || 'Order placed on admin hold',
      severity: 'error',
      icon: <Ban className="h-4 w-4" />,
    });
  }

  // 9. Chargeback (if indicated by hold reason or status)
  if (order.payoutHoldReason === 'dispute_open' && order.adminHold && showAdminFields) {
    // Check if there's a chargeback - this would need to be passed in or queried
    // For now, we'll show it if admin hold is due to dispute
    steps.push({
      key: 'chargeback',
      label: 'Chargeback',
      status: 'blocked',
      description: 'Chargeback filed - funds on hold',
      severity: 'error',
      icon: <CreditCard className="h-4 w-4" />,
    });
  }

  // 10. Payout Released
  if (order.releasedAt && order.stripeTransferId) {
    steps.push({
      key: 'payout_released',
      label: 'Payout Released',
      date: order.releasedAt,
      status: 'complete',
      description: `Funds released to seller (Transfer: ${order.stripeTransferId.slice(-8)})`,
      icon: <DollarSign className="h-4 w-4" />,
    });
  }

  // 11. Refunded
  if (order.refundedAt && order.stripeRefundId) {
    const isPartial = order.refundAmount && order.refundAmount < order.amount;
    steps.push({
      key: 'refunded',
      label: isPartial ? 'Partial Refund' : 'Refunded',
      date: order.refundedAt,
      status: 'complete',
      description: isPartial
        ? `Partial refund of ${order.refundAmount?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} processed`
        : `Full refund processed (Refund: ${order.stripeRefundId.slice(-8)})`,
      severity: 'warning',
      icon: <XCircle className="h-4 w-4" />,
    });
  }

  return steps;
}

export function OrderTimeline({ order, compact = false, showAdminFields = false }: OrderTimelineProps) {
  const steps = useMemo(() => buildOrderTimeline(order, showAdminFields), [order, showAdminFields]);

  if (compact) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div key={step.key} className="flex items-center gap-3 text-sm">
                <div className={cn(
                  'flex-shrink-0',
                  step.status === 'complete' && 'text-green-600',
                  step.status === 'pending' && 'text-muted-foreground',
                  step.status === 'blocked' && 'text-red-600',
                  step.status === 'warning' && 'text-orange-600',
                )}>
                  {step.icon || <Clock className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.label}</span>
                    {step.date && (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(step.date)}
                      </span>
                    )}
                  </div>
                  {step.description && (
                    <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                  )}
                </div>
                <Badge
                  variant={
                    step.status === 'complete' ? 'default' :
                    step.status === 'blocked' ? 'destructive' :
                    step.status === 'warning' ? 'outline' :
                    'secondary'
                  }
                  className="text-xs"
                >
                  {step.status === 'complete' ? 'Complete' :
                   step.status === 'blocked' ? 'Blocked' :
                   step.status === 'warning' ? 'Warning' :
                   'Pending'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-6">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1;
            const statusColor = {
              complete: 'text-green-600 border-green-600',
              pending: 'text-muted-foreground border-muted-foreground',
              blocked: 'text-red-600 border-red-600',
              warning: 'text-orange-600 border-orange-600',
            }[step.status];

            return (
              <div key={step.key} className="relative">
                {/* Timeline line */}
                {!isLast && (
                  <div className={cn(
                    'absolute left-5 top-10 w-0.5 h-full',
                    step.status === 'complete' ? 'bg-green-600' :
                    step.status === 'blocked' ? 'bg-red-600' :
                    'bg-muted-foreground/30'
                  )} />
                )}

                <div className="flex gap-4">
                  {/* Icon */}
                  <div className={cn(
                    'flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center bg-background',
                    statusColor
                  )}>
                    {step.icon || <Clock className="h-5 w-5" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{step.label}</h4>
                          <Badge
                            variant={
                              step.status === 'complete' ? 'default' :
                              step.status === 'blocked' ? 'destructive' :
                              step.status === 'warning' ? 'outline' :
                              'secondary'
                            }
                            className="text-xs"
                          >
                            {step.status === 'complete' ? 'Complete' :
                             step.status === 'blocked' ? 'Blocked' :
                             step.status === 'warning' ? 'Warning' :
                             'Pending'}
                          </Badge>
                        </div>
                        {step.date && (
                          <p className="text-sm text-muted-foreground mb-1">
                            {formatDate(step.date)}
                            {step.date.getTime() > Date.now() && (
                              <span className="ml-2">
                                ({formatDistanceToNow(step.date, { addSuffix: true })})
                              </span>
                            )}
                          </p>
                        )}
                        {step.description && (
                          <p className="text-sm text-muted-foreground">{step.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
