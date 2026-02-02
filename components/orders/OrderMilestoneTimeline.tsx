/**
 * OrderMilestoneTimeline
 * 
 * Shared truth milestone timeline component for buyer, seller, and admin views.
 * Uses getOrderMilestones() from lib/orders/progress.ts to ensure consistency.
 */

'use client';

import { useMemo } from 'react';
import { CheckCircle2, Clock, Circle, AlertTriangle, User, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDate, formatDistanceToNow, isValidNonEpochDate } from '@/lib/utils';
import type { Order } from '@/lib/types';
import { getOrderMilestones, type MilestoneOwnerRole, type OrderMilestone } from '@/lib/orders/progress';

export type MilestoneTimelineRole = 'buyer' | 'seller' | 'admin';

export interface OrderMilestoneTimelineProps {
  order: Order;
  role?: MilestoneTimelineRole;
  className?: string;
  /** Optional content below the timeline (e.g. report issue after completion) */
  footer?: React.ReactNode;
  /** Render step-specific info (address, scheduled time, actions) under each milestone */
  renderMilestoneDetail?: (milestone: OrderMilestone, order: Order) => React.ReactNode;
}

function getRoleLabel(ownerRole: MilestoneOwnerRole, viewerRole: MilestoneTimelineRole): string {
  if (ownerRole === 'system' || ownerRole === 'admin') return ownerRole === 'system' ? 'System' : 'Admin';
  if (viewerRole === 'buyer' && ownerRole === 'buyer') return 'You';
  if (viewerRole === 'buyer' && ownerRole === 'seller') return 'Seller';
  if (viewerRole === 'seller' && ownerRole === 'seller') return 'You';
  if (viewerRole === 'seller' && ownerRole === 'buyer') return 'Buyer';
  return ownerRole === 'buyer' ? 'Buyer' : 'Seller';
}

export function OrderMilestoneTimeline({
  order,
  role = 'buyer',
  className,
  footer,
  renderMilestoneDetail,
}: OrderMilestoneTimelineProps) {
  const milestones = useMemo(
    () => getOrderMilestones(order, role === 'seller' ? 'seller' : 'buyer'),
    [order, role]
  );

  return (
    <Card className={cn('border-border/60', className)}>
      <CardHeader className="pb-3 px-4 sm:px-6 pt-4 sm:pt-6">
        <CardTitle className="text-base">Order Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 sm:px-6 pb-4 sm:pb-6 pt-0">
        {milestones.map((milestone, index) => {
          const isLast = index === milestones.length - 1;
          const isCurrent = milestone.isCurrent;
          const isBlocked = milestone.isBlocked;

          return (
            <div key={milestone.key} className="relative">
              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    'absolute left-[14px] top-[28px] w-px',
                    milestone.isComplete ? 'bg-primary/30' : isCurrent ? 'bg-orange-400/30' : 'bg-muted-foreground/20',
                    'h-[calc(100%+0.5rem)]'
                  )}
                />
              )}

              <div className="flex items-start gap-3">
                {/* Status dot: green when complete, orange when current, muted when pending */}
                <div className="relative z-10 shrink-0">
                  {milestone.isComplete ? (
                    <div className="h-7 w-7 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </div>
                  ) : isBlocked ? (
                    <div className="h-7 w-7 rounded-full bg-destructive/10 border-2 border-destructive flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    </div>
                  ) : isCurrent ? (
                    <div className="h-7 w-7 rounded-full bg-orange-500/20 border-2 border-orange-500 flex items-center justify-center">
                      <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400 animate-pulse" />
                    </div>
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-muted/50 border-2 border-muted-foreground/25 flex items-center justify-center">
                      <Circle className="h-4 w-4 text-muted-foreground/60" />
                    </div>
                  )}
                </div>

                {/* Milestone content */}
                <div className={cn('flex-1 min-w-0 pb-4 rounded-lg -mx-1 px-2 py-1 overflow-hidden', isCurrent && !isBlocked && 'bg-primary/5 ring-1 ring-primary/20')}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div
                          className={cn(
                            'font-semibold text-sm',
                            milestone.isComplete && 'text-primary',
                            isCurrent && !isBlocked && !milestone.isComplete && 'text-orange-600 dark:text-orange-400',
                            isBlocked && 'text-destructive',
                            !milestone.isComplete && !isCurrent && !isBlocked && 'text-muted-foreground'
                          )}
                        >
                          {milestone.label}
                        </div>
                        {milestone.ownerRole !== 'system' && (
                          <Badge variant="outline" className="text-xs">
                            <User className="h-3 w-3 mr-1" />
                            {getRoleLabel(milestone.ownerRole, role)}
                          </Badge>
                        )}
                        {isCurrent && (
                          <Badge variant={isBlocked ? 'destructive' : 'secondary'} className="text-xs">
                            {isBlocked ? 'Blocked' : 'Current'}
                          </Badge>
                        )}
                      </div>

                      {/* Dates — only show when valid (avoid "Dec 31, 1969" / "56 years ago") */}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {milestone.completedAt && isValidNonEpochDate(milestone.completedAt) && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Completed {formatDate(milestone.completedAt)}
                          </span>
                        )}
                        {milestone.dueAt && !milestone.completedAt && isValidNonEpochDate(milestone.dueAt) && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Due {formatDate(milestone.dueAt)} ({formatDistanceToNow(milestone.dueAt)})
                          </span>
                        )}
                      </div>

                      {/* Blocked reason */}
                      {isBlocked && milestone.isBlocked && (
                        <div className="text-xs text-destructive mt-1 bg-destructive/10 border border-destructive/20 rounded p-2">
                          {(milestone as any).blockedReason || 'This step is currently blocked'}
                        </div>
                      )}

                      {/* Step-specific detail (address, scheduled time, action CTA, etc.) */}
                      {renderMilestoneDetail?.(milestone, order)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {footer ? (
          <>
            <div className="my-3 border-t border-border/60" />
            {footer}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
