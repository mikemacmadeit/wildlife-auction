/**
 * TransactionTimeline (Phase 2A)
 *
 * A single, shared user-facing timeline for buyers + sellers (+ admin read-only).
 * Wraps existing order fields; does NOT write to Firestore.
 */

'use client';

import { useMemo } from 'react';
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
} from 'lucide-react';
import type { Order } from '@/lib/types';
import { getOrderTrustState, type OrderTrustState } from '@/lib/orders/getOrderTrustState';
import { getOrderIssueState } from '@/lib/orders/getOrderIssueState';

export type TimelineRole = 'buyer' | 'seller' | 'admin';

type StepStatus = 'done' | 'active' | 'upcoming' | 'blocked';

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

export function TransactionTimeline(props: { order: Order; role: TimelineRole; className?: string }) {
  const { order, role, className } = props;

  const trust = getOrderTrustState(order);
  const issue = getOrderIssueState(order);

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

  const steps: TimelineStep[] = useMemo(() => {
    const buyerCopy = {
      paymentReceived: 'Funds are held securely until delivery and issue windows are complete.',
      prepare: 'Seller is preparing delivery. You’ll confirm receipt once it arrives.',
      inTransit: 'Your order is on the way.',
      delivered: 'Delivery is marked. Confirm receipt or report an issue if needed.',
      protection: 'Protection window active. You can report an issue within the window.',
      ready: 'Ready for payout release. Admin will release funds to the seller.',
      completed: 'Payout released. Transaction complete.',
    };
    const sellerCopy = {
      paymentReceived: 'Payment received and held securely. Prepare delivery.',
      prepare: 'Prepare delivery and update the delivery status.',
      inTransit: 'Delivery is in transit. Mark delivered once complete.',
      delivered: 'Delivery is marked. Buyer can confirm receipt or report an issue.',
      protection: 'Protection window active. Payout is held until the window ends or buyer confirms.',
      ready: 'Ready for payout release. Admin will release funds after checks.',
      completed: 'Payout released. Transaction complete.',
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

    const hasInTransit = order.status === 'in_transit';
    const hasDelivered = !!order.deliveredAt || !!order.deliveryConfirmedAt || order.status === 'delivered' || order.status === 'buyer_confirmed' || order.status === 'accepted' || order.status === 'ready_to_release' || order.status === 'completed';
    const inProtection = order.payoutHoldReason === 'protection_window' && !!order.deliveryConfirmedAt;
    const readyForPayout = trust === 'ready_for_payout' || order.status === 'ready_to_release';

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
        description: copy.prepare,
        icon: <Truck className="h-4 w-4" />,
        rank: 2,
        show: paymentReceived,
      },
      {
        key: 'in_transit',
        title: 'In transit',
        description: copy.inTransit,
        icon: <Truck className="h-4 w-4" />,
        rank: 3,
        show: true, // Always show (may be upcoming) to make the mental model consistent.
      },
      {
        key: 'delivered',
        title: 'Delivered',
        description: copy.delivered,
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
        show: readyForPayout || trust === 'completed',
      },
      {
        key: 'completed',
        title: order.status === 'refunded' ? 'Refunded' : 'Completed',
        description: order.status === 'refunded' ? 'Payment was refunded.' : copy.completed,
        icon: order.status === 'refunded' ? <Undo2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />,
        rank: 7,
        show: order.status === 'completed' || order.status === 'refunded',
      },
    ];

    const currentRank = trust === 'awaiting_payment' ? 0 : rank;

    return baseSteps
      .filter((s) => s.show !== false)
      .map((s) => {
        // If order is delivered but no explicit in_transit, we still show In transit as done? Keep it simple:
        const effectiveRank =
          s.key === 'in_transit' && hasDelivered && !hasInTransit ? 3 : s.rank;
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
          status: stepStatusFor(effectiveRank, currentRank, blocked && s.key !== 'completed'),
        } as TimelineStep;
      });
  }, [order, role, trust, rank, blocked, protectionRemaining]);

  const StepDot = (s: TimelineStep) => (
    <div
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full border',
        s.status === 'done' && 'bg-primary/10 border-primary/30 text-primary',
        s.status === 'active' && 'bg-primary/15 border-primary/40 text-primary',
        s.status === 'upcoming' && 'bg-background border-border/50 text-muted-foreground',
        s.status === 'blocked' && 'bg-destructive/10 border-destructive/30 text-destructive'
      )}
    >
      {s.status === 'done' ? <CheckCircle2 className="h-4 w-4" /> : s.icon}
    </div>
  );

  return (
    <Card className={cn('border-border/60', className)}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="text-sm font-semibold">Transaction timeline</div>
          {issue !== 'none' && (
            <Badge variant="destructive" className="font-semibold text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Issue under review
            </Badge>
          )}
        </div>

        {/* Horizontal stepper (scrolls on small screens) */}
        <div className="overflow-x-auto pb-2">
          <div className="relative min-w-[760px]">
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
      </CardContent>
    </Card>
  );
}

