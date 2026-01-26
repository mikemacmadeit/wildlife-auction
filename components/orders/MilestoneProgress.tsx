/**
 * MilestoneProgress
 * 
 * Transport-aware milestone checklist visible to all roles (buyer, seller, admin).
 * Shows completed steps, current step, and next step clearly.
 */

'use client';

import { useMemo } from 'react';
import { CheckCircle2, Clock, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order } from '@/lib/types';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';

export type MilestoneRole = 'buyer' | 'seller' | 'admin';

export interface MilestoneProgressProps {
  order: Order;
  role?: MilestoneRole;
  className?: string;
  variant?: 'full' | 'compact'; // full = detailed, compact = minimal
}

interface MilestoneItem {
  key: string;
  label: string;
  completed: boolean;
  current: boolean;
}

export function MilestoneProgress({
  order,
  role = 'buyer',
  className,
  variant = 'full',
}: MilestoneProgressProps) {
  const txStatus = getEffectiveTransactionStatus(order);
  const transportOption = order.transportOption || 'SELLER_TRANSPORT';

  const milestones = useMemo(() => {
    const items: MilestoneItem[] = [];

    if (transportOption === 'SELLER_TRANSPORT') {
      // SELLER_TRANSPORT milestones
      const scheduled = ['DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 'DELIVERED_PENDING_CONFIRMATION', 'COMPLETED'].includes(txStatus);
      const out = ['OUT_FOR_DELIVERY', 'DELIVERED_PENDING_CONFIRMATION', 'COMPLETED'].includes(txStatus);
      const deliveredPending = ['DELIVERED_PENDING_CONFIRMATION', 'COMPLETED'].includes(txStatus);
      const completed = txStatus === 'COMPLETED';

      items.push(
        {
          key: 'scheduled',
          label: 'Delivery scheduled',
          completed: scheduled,
          current: txStatus === 'DELIVERY_SCHEDULED',
        },
        {
          key: 'out',
          label: 'Out for delivery',
          completed: out,
          current: txStatus === 'OUT_FOR_DELIVERY',
        },
        {
          key: 'delivered',
          label: 'Delivered (pending confirmation)',
          completed: deliveredPending,
          current: txStatus === 'DELIVERED_PENDING_CONFIRMATION',
        },
        {
          key: 'completed',
          label: 'Completed',
          completed: completed,
          current: txStatus === 'COMPLETED',
        }
      );
    } else {
      // BUYER_TRANSPORT milestones
      const pickupInfo = ['READY_FOR_PICKUP', 'PICKUP_SCHEDULED', 'PICKED_UP', 'COMPLETED'].includes(txStatus);
      const windowSelected = ['PICKUP_SCHEDULED', 'PICKED_UP', 'COMPLETED'].includes(txStatus);
      const pickupConfirmed = ['PICKED_UP', 'COMPLETED'].includes(txStatus);
      const completed = txStatus === 'COMPLETED';

      items.push(
        {
          key: 'pickupInfo',
          label: 'Pickup info set',
          completed: pickupInfo,
          current: txStatus === 'READY_FOR_PICKUP',
        },
        {
          key: 'windowSelected',
          label: 'Pickup window selected',
          completed: windowSelected,
          current: txStatus === 'PICKUP_SCHEDULED',
        },
        {
          key: 'pickupConfirmed',
          label: 'Pickup confirmed',
          completed: pickupConfirmed,
          current: txStatus === 'PICKED_UP',
        },
        {
          key: 'completed',
          label: 'Completed',
          completed: completed,
          current: txStatus === 'COMPLETED',
        }
      );
    }

    return items;
  }, [txStatus, transportOption]);

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-2 flex-wrap', className)}>
        {milestones.map((item, idx) => (
          <div key={item.key} className="flex items-center gap-1.5 text-xs">
            {item.completed ? (
              <CheckCircle2 className="h-3 w-3 text-green-600" />
            ) : item.current ? (
              <Clock className="h-3 w-3 text-blue-600" />
            ) : (
              <Circle className="h-3 w-3 text-muted-foreground" />
            )}
            <span
              className={cn(
                item.completed && 'text-green-600 font-medium',
                item.current && !item.completed && 'text-blue-600 font-medium',
                !item.completed && !item.current && 'text-muted-foreground'
              )}
            >
              {item.label}
            </span>
            {idx < milestones.length - 1 && (
              <span className="text-muted-foreground/50 mx-1">•</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {milestones.map((item) => (
        <div key={item.key} className="flex items-center gap-2 text-sm">
          {item.completed ? (
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          ) : item.current ? (
            <Clock className="h-4 w-4 text-blue-600 shrink-0 animate-pulse" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span
            className={cn(
              item.completed && 'text-green-600 font-medium',
              item.current && !item.completed && 'text-blue-600 font-medium',
              !item.completed && !item.current && 'text-muted-foreground'
            )}
          >
            {item.label}
            {item.current && !item.completed && ' (current step)'}
          </span>
        </div>
      ))}
    </div>
  );
}
