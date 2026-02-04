/**
 * TransactionTimeline (Phase 2A)
 *
 * A single, shared user-facing timeline for buyers + sellers (+ admin read-only).
 * Wraps existing order fields; does NOT write to Firestore.
 */

'use client';

import { useMemo, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  CheckCircle2,
  Clock,
  Shield,
  AlertTriangle,
  DollarSign,
  Truck,
  PackageCheck,
  Undo2,
  MapPin,
  Calendar,
} from 'lucide-react';
import type { Order } from '@/lib/types';
import { getOrderTrustState, type OrderTrustState } from '@/lib/orders/getOrderTrustState';
import { getOrderIssueState } from '@/lib/orders/getOrderIssueState';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { getOrderMilestones } from '@/lib/orders/progress';

export type TimelineRole = 'buyer' | 'seller' | 'admin';

type StepStatus = 'done' | 'active' | 'upcoming' | 'blocked';

type TimelineVariant = 'cards' | 'rail';

interface TimelineStep {
  key: string;
  title: string;
  description?: string;
  status: StepStatus;
  icon: React.ReactNode;
  meta?: React.ReactNode;
}

function stateRank(state: OrderTrustState): number {
  switch (state) {
    case 'awaiting_payment':
      return 0;
    case 'payment_received':
      return 1;
    case 'preparing_delivery':
      return 2;
    case 'in_transit':
      return 3;
    case 'delivered':
      return 4;
    case 'protection_window':
      return 5;
    case 'ready_for_payout':
      return 6;
    case 'completed':
      return 7;
    case 'refunded':
      return 8;
    case 'issue_open':
      // Issue is an overlay state; treat as mid-flow for step selection.
      return 4;
    default:
      return 0;
  }
}

function stepStatusFor(stepRank: number, currentRank: number, blocked: boolean): StepStatus {
  if (blocked) return 'blocked';
  if (stepRank < currentRank) return 'done';
  if (stepRank === currentRank) return 'active';
  return 'upcoming';
}

export function TransactionTimeline(props: {
  order: Order;
  role: TimelineRole;
  className?: string;
  dense?: boolean; // tighter spacing for list views
  showTitle?: boolean; // hide title row for embedded usage
  variant?: TimelineVariant; // cards (default) or compact horizontal rail
  embedded?: boolean; // render without outer Card (for order tiles)
}) {
  const { order, role, className, dense = false, showTitle = true, variant = 'cards', embedded = false } = props;

  const trust = getOrderTrustState(order);
  const issue = getOrderIssueState(order);
  const txStatus = getEffectiveTransactionStatus(order);

  const toMillisSafe = (value: any): number | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value?.toDate === 'function') {
      try {
        const d = value.toDate();
        if (d instanceof Date && Number.isFinite(d.getTime())) return d.getTime();
      } catch {
        // ignore
      }
    }
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isFinite(d.getTime()) ? d.getTime() : null;
    }
    return null;
  };

  const protectionEndsMs = toMillisSafe((order as any).protectionEndsAt);
  const protectionRemaining =
    protectionEndsMs && protectionEndsMs > Date.now()
      ? formatDistanceToNowStrict(new Date(protectionEndsMs), { addSuffix: true })
      : null;

  const blocked = issue !== 'none' || order.adminHold === true || (order as any).payoutHoldReason === 'chargeback';
  const rank = stateRank(trust);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // When rail variant is used, scroll so the active step is in view (e.g. on mobile cards).
  useEffect(() => {
    if (variant !== 'rail') return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const activeEl = container.querySelector<HTMLElement>('[data-step-status="active"]');
    if (activeEl) {
      activeEl.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
    }
  }, [variant, order?.id, rank]);

  const steps: TimelineStep[] = useMemo(() => {
    const buyerCopy = {
      paymentReceived: 'Payments are processed by Stripe. Sellers are paid immediately upon payment.',
      prepare: 'Seller is preparing delivery. You’ll confirm receipt once it arrives.',
      inTransit: 'Your order is on the way.',
      delivered: 'Delivery is marked. Confirm receipt or report an issue if needed.',
      protection: 'Protection window active. You can report an issue within the window.',
      ready: 'Order fulfilled. Transaction complete.',
      completed: 'Transaction complete. Seller was paid immediately upon successful payment.',
    };
    const sellerCopy = {
      paymentReceived: 'Payment received. Seller was paid immediately. Prepare delivery.',
      prepare: 'Prepare delivery and update the delivery status.',
      inTransit: 'Delivery is in transit. Mark delivered once complete.',
      delivered: 'Delivery is marked. Buyer can confirm receipt or report an issue.',
      protection: 'Protection window active. Buyer can report issues within the window.',
      ready: 'Order fulfilled. Transaction complete.',
      completed: 'Transaction complete. Seller was paid immediately upon successful payment.',
    };
    const copy = role === 'seller' ? sellerCopy : buyerCopy;

    const awaitingPayment = order.status === 'pending' || order.status === 'awaiting_bank_transfer' || order.status === 'awaiting_wire';
    const paymentReceived =
      order.status === 'paid_held' ||
      order.status === 'paid' ||
      order.status === 'in_transit' ||
      order.status === 'delivered' ||
      order.status === 'buyer_confirmed' ||
      order.status === 'accepted' ||
      order.status === 'ready_to_release' ||
      order.status === 'completed';

    // Check for in_transit status - use both status field and timestamp
    const hasInTransit = order.status === 'in_transit' || !!(order as any).inTransitAt || !!order.inTransitAt;
    const hasDelivered =
      !!order.deliveredAt ||
      !!order.deliveryConfirmedAt ||
      !!order.buyerConfirmedAt ||
      order.status === 'delivered' ||
      order.status === 'buyer_confirmed' ||
      order.status === 'accepted' ||
      order.status === 'ready_to_release' ||
      order.status === 'completed';
    const hasPreparing = !!(order as any).sellerPreparingAt || hasInTransit || hasDelivered;
    const inProtection = order.payoutHoldReason === 'protection_window' && !!order.deliveryConfirmedAt;
    const readyForPayout = trust === 'ready_for_payout' || order.status === 'ready_to_release';
    const paymentReleased =
      order.status === 'completed' ||
      order.status === 'refunded' ||
      (typeof order.stripeTransferId === 'string' && order.stripeTransferId.trim().length > 0);

    const baseSteps: Array<Omit<TimelineStep, 'status'> & { rank: number; show?: boolean }> = [
      {
        key: 'payment',
        title: awaitingPayment ? 'Awaiting payment' : 'Payment received',
        description: awaitingPayment ? 'Waiting for payment confirmation.' : copy.paymentReceived,
        icon: awaitingPayment ? <Clock className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />,
        rank: 1,
        show: true,
      },
      {
        key: 'prepare',
        title: 'Preparing delivery',
        description:
          role === 'seller'
            ? hasPreparing
              ? 'Preparing marked. Update to “In transit” when it’s on the way.'
              : 'Mark “Preparing” once you begin getting the order ready.'
            : hasPreparing
              ? 'Seller is preparing delivery. You’ll confirm receipt once it arrives.'
              : 'Waiting on the seller to begin preparing delivery.',
        icon: <Truck className="h-4 w-4" />,
        rank: 2,
        show: paymentReceived,
      },
      {
        key: 'in_transit',
        title: 'In transit',
        description:
          role === 'seller'
            ? hasInTransit
              ? 'In transit marked. Next step is for the buyer to confirm receipt.'
              : 'Mark “In transit” when the order leaves your care.'
            : hasInTransit
              ? 'Your order is on the way.'
              : 'Once the order is on the way, it will be marked “In transit”.',
        icon: <Truck className="h-4 w-4" />,
        rank: 3,
        show: true, // Always show (may be upcoming) to make the mental model consistent.
      },
      {
        key: 'delivered',
        title: 'Delivered',
        description:
          role === 'seller'
            ? 'Buyer will confirm receipt once delivery is complete.'
            : hasDelivered
              ? 'Delivered/received is confirmed.'
              : 'Once it arrives, confirm receipt here (or report an issue if needed).',
        icon: <PackageCheck className="h-4 w-4" />,
        rank: 4,
        show: true,
      },
      {
        key: 'protection',
        title: 'Protection window',
        description: copy.protection,
        icon: <Shield className="h-4 w-4" />,
        rank: 5,
        show: inProtection,
      },
      {
        key: 'ready',
        title: 'Ready for payout',
        description: copy.ready,
        icon: <DollarSign className="h-4 w-4" />,
        rank: 6,
        show: readyForPayout || trust === 'completed' || paymentReleased,
      },
      {
        key: 'payout',
        title: order.status === 'refunded' ? 'Refunded' : 'Payment complete',
        description:
          order.status === 'refunded'
            ? 'Payment was refunded.'
            : 'Seller was paid immediately upon successful payment. Transaction complete.',
        icon: order.status === 'refunded' ? <Undo2 className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />,
        rank: 7,
        // Always show the final step so buyers understand the end-state.
        show: true,
      },
    ];

    // Use transaction status as source of truth so progress always matches actual status
    let currentRank = trust === 'awaiting_payment' ? 0 : rank;
    const inTransitStatuses = ['READY_FOR_PICKUP', 'PICKUP_PROPOSED', 'PICKUP_SCHEDULED', 'DELIVERY_PROPOSED', 'DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY'];
    const deliveredStatuses = ['DELIVERED_PENDING_CONFIRMATION', 'PICKED_UP', 'COMPLETED'];
    if (inTransitStatuses.includes(txStatus) && currentRank < 3) currentRank = 3;
    if (deliveredStatuses.includes(txStatus) && currentRank < 4) currentRank = 4;
    if (txStatus === 'COMPLETED' && currentRank < 7) currentRank = 7;
    // Legacy fallback if txStatus not set
    if (order.status === 'in_transit' && currentRank < 3) currentRank = 3;
    if (order.status === 'delivered' && currentRank < 4) currentRank = 4;

    return baseSteps
      .filter((s) => s.show !== false)
      .map((s) => {
        // Ensure effectiveRank correctly reflects order status
        let effectiveRank = s.rank;
        
        // If this is the "in_transit" step and order status is 'in_transit', ensure it's active
        if (s.key === 'in_transit' && order.status === 'in_transit') {
          effectiveRank = 3;
        }
        // If order is delivered but no explicit in_transit marker, still show in_transit as done
        else if (s.key === 'in_transit' && hasDelivered && !hasInTransit) {
          effectiveRank = 3;
        }
        return {
          key: s.key,
          title: s.title,
          description: s.description,
          icon: s.icon,
          meta:
            s.key === 'protection' && protectionRemaining ? (
              <Badge variant="secondary" className="font-semibold text-xs">
                Ends {protectionRemaining}
              </Badge>
            ) : null,
          status: stepStatusFor(effectiveRank, currentRank, blocked && s.key !== 'payout'),
        } as TimelineStep;
      });
  }, [order, role, trust, rank, blocked, protectionRemaining, txStatus]);

  // Rail variant: use same steps as Order Progress (order detail page) from getOrderMilestones()
  const railSteps = useMemo((): TimelineStep[] => {
    if (variant !== 'rail') return [];
    const milestones = getOrderMilestones(order);
    const iconFor = (key: string) => {
      switch (key) {
        case 'payment': return <DollarSign className="h-4 w-4" />;
        case 'compliance': return <Shield className="h-4 w-4" />;
        case 'set_delivery_address': return <MapPin className="h-4 w-4" />;
        case 'schedule_delivery': return <Calendar className="h-4 w-4" />;
        case 'agree_delivery': return <CheckCircle2 className="h-4 w-4" />;
        case 'out_for_delivery': return <Truck className="h-4 w-4" />;
        case 'delivered': return <PackageCheck className="h-4 w-4" />;
        case 'confirm_receipt': return <CheckCircle2 className="h-4 w-4" />;
        case 'completed': return <CheckCircle2 className="h-4 w-4" />;
        default: return <Clock className="h-4 w-4" />;
      }
    };
    return milestones.map((m) => ({
      key: m.key,
      title: m.label,
      description: undefined,
      status: (m.isComplete ? 'done' : m.isCurrent ? 'active' : m.isBlocked ? 'blocked' : 'upcoming') as StepStatus,
      icon: iconFor(m.key),
      meta: undefined,
    })) as TimelineStep[];
  }, [order, variant]);

  const stepsToShow = variant === 'rail' && railSteps.length > 0 ? railSteps : steps;

  const StepDot = (s: TimelineStep) => (
    <div
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full border',
        // Make the active/done step unmistakably visible (high contrast)
        s.status === 'done' && 'bg-primary border-primary text-primary-foreground shadow-sm',
        s.status === 'active' && 'bg-primary/95 border-primary text-primary-foreground ring-2 ring-primary/30 shadow-sm',
        s.status === 'upcoming' && 'bg-background border-border/50 text-muted-foreground',
        s.status === 'blocked' && 'bg-destructive/10 border-destructive/30 text-destructive'
      )}
    >
      {s.status === 'done' ? <CheckCircle2 className="h-4 w-4" /> : s.icon}
    </div>
  );

  const Rail = () => (
    // Keep the rail contained in its box; allow horizontal scroll only. Hover to show scrollbar.
    <div
      ref={scrollContainerRef}
      className={cn('overflow-x-auto overflow-y-hidden we-scrollbar-hover', dense ? 'pb-0.5' : 'pb-2')}
    >
      {/* Embedded rails sit inside a padded container already — keep padding tight. */}
      <div
        className={cn(
          'flex items-start',
          dense ? 'gap-2.5' : 'gap-3',
          embedded ? 'pr-2' : 'pr-8',
          // Avoid over-forcing width so it "fits" better inside its box; still scrolls when needed.
embedded
              ? dense
                ? 'min-w-[440px]'
                : 'min-w-[640px]'
            : dense
              ? 'min-w-[520px]'
              : 'min-w-[760px]'
        )}
      >
        {stepsToShow.map((s, idx) => {
          const isLast = idx === stepsToShow.length - 1;
          const prev = idx > 0 ? stepsToShow[idx - 1] : null;
          const leftConnectorClass =
            prev?.status === 'blocked'
              ? 'bg-destructive/30'
              : prev?.status === 'done'
                ? 'bg-primary/25'
                : 'bg-border/70';
          const rightConnectorClass =
            s.status === 'blocked'
              ? 'bg-destructive/30'
              : s.status === 'done'
                ? 'bg-primary/25'
                : 'bg-border/70';
          return (
            <div
              key={s.key}
              data-step-status={s.status}
              data-step-key={s.key}
              className={cn(
                'flex-1',
                embedded
                  ? dense
                    ? 'min-w-[110px]'
                    : 'min-w-[130px]'
                  : dense
                    ? 'min-w-[120px]'
                    : 'min-w-[140px]',
                // Give the final step a little breathing room from the scroll edge.
                isLast && (embedded ? 'pr-3' : 'pr-6')
              )}
            >
              {/* Icon row: icon centered above its label, with connectors on the sides */}
              <div className="flex items-center w-full">
                {idx > 0 ? <div className={cn('h-[2px] flex-1 rounded-full', leftConnectorClass)} /> : <div className="flex-1" />}
                <div className="shrink-0">{StepDot(s)}</div>
                {!isLast ? <div className={cn('h-[2px] flex-1 rounded-full', rightConnectorClass)} /> : <div className="flex-1" />}
              </div>
              <div className={cn('mt-2 text-center', dense ? 'text-[12px]' : 'text-xs')}>
                <div
                  className={cn(
                    'font-semibold leading-tight',
                    s.status === 'active' && 'text-primary',
                    s.status === 'blocked' && 'text-destructive'
                  )}
                >
                  {s.title}
                </div>
                {s.meta ? <div className="mt-1 flex justify-center">{s.meta}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const inner = (
    <>
      {(showTitle || issue !== 'none') && (
        <div className={cn('flex items-center justify-between gap-3 flex-wrap', dense ? 'mb-2' : 'mb-4')}>
          {showTitle ? <div className="text-sm font-semibold">Transaction timeline</div> : <div />}
          {issue !== 'none' && (
            <Badge variant="destructive" className="font-semibold text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Issue under review
            </Badge>
          )}
        </div>
      )}

      {variant === 'rail' ? (
        <Rail />
      ) : (
        /* Horizontal stepper (scrolls on small screens); hover to show scrollbar */
        <div className={cn('overflow-x-auto overflow-y-hidden we-scrollbar-hover', dense ? 'pb-1' : 'pb-2')}>
          <div className={cn('relative', dense ? 'min-w-[640px]' : 'min-w-[760px]')}>
            <div className="absolute left-[14px] right-[14px] top-[14px] h-px bg-border/70" />

            <div className="flex items-start gap-3">
              {steps.map((s) => (
                <div key={s.key} className="flex-1 min-w-[190px]">
                  <div className="flex flex-col items-center text-center">
                    <div className="z-10">{StepDot(s)}</div>

                    <div
                      className={cn(
                        'mt-3 w-full rounded-xl border p-3',
                        s.status === 'done' && 'border-primary/20 bg-primary/5',
                        s.status === 'active' && 'border-primary/40 bg-primary/10',
                        s.status === 'upcoming' && 'border-border/50 bg-background/40',
                        s.status === 'blocked' && 'border-destructive/30 bg-destructive/5'
                      )}
                    >
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <div className="text-sm font-semibold leading-tight">{s.title}</div>
                        {s.meta}
                      </div>
                      {s.description ? (
                        <div className="text-xs text-muted-foreground mt-1 leading-snug">{s.description}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className={cn(className)}>{inner}</div>;
  }

  return (
    <Card className={cn('border-border/60', className)}>
      <CardContent className={cn(dense ? 'pt-4 pb-4' : 'pt-6')}>{inner}</CardContent>
    </Card>
  );
}

