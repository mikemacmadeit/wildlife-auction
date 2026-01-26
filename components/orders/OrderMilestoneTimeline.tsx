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
import { formatDate, formatDistanceToNow } from '@/lib/utils';
import type { Order } from '@/lib/types';
import { getOrderMilestones, type MilestoneOwnerRole } from '@/lib/orders/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

export type MilestoneTimelineRole = 'buyer' | 'seller' | 'admin';

export interface OrderMilestoneTimelineProps {
  order: Order;
  role?: MilestoneTimelineRole;
  className?: string;
  showHelpText?: boolean;
}

const ROLE_LABELS: Record<MilestoneOwnerRole, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  system: 'System',
  admin: 'Admin',
};

export function OrderMilestoneTimeline({
  order,
  role = 'buyer',
  className,
  showHelpText = true,
}: OrderMilestoneTimelineProps) {
  const milestones = useMemo(() => getOrderMilestones(order), [order]);

  return (
    <Card className={cn('border-border/60', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Order Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
                    milestone.isComplete ? 'bg-primary/30' : 'bg-border/50',
                    'h-[calc(100%+0.5rem)]'
                  )}
                />
              )}

              <div className="flex items-start gap-3">
                {/* Status dot */}
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
                    <div className="h-7 w-7 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
                      <Clock className="h-4 w-4 text-primary animate-pulse" />
                    </div>
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-muted border-2 border-border flex items-center justify-center">
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Milestone content */}
                <div className="flex-1 min-w-0 pb-4">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div
                          className={cn(
                            'font-semibold text-sm',
                            milestone.isComplete && 'text-primary',
                            isCurrent && !isBlocked && 'text-primary',
                            isBlocked && 'text-destructive'
                          )}
                        >
                          {milestone.label}
                        </div>
                        {milestone.ownerRole !== 'system' && (
                          <Badge variant="outline" className="text-xs">
                            <User className="h-3 w-3 mr-1" />
                            {ROLE_LABELS[milestone.ownerRole]}
                          </Badge>
                        )}
                        {isCurrent && (
                          <Badge variant={isBlocked ? 'destructive' : 'default'} className="text-xs">
                            {isBlocked ? 'Blocked' : 'Current'}
                          </Badge>
                        )}
                      </div>

                      {/* Dates */}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {milestone.completedAt && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Completed {formatDate(milestone.completedAt)}
                          </span>
                        )}
                        {milestone.dueAt && !milestone.completedAt && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Due {formatDate(milestone.dueAt)} ({formatDistanceToNow(milestone.dueAt)})
                          </span>
                        )}
                      </div>

                      {/* Help text */}
                      {showHelpText && milestone.helpText && (
                        <Collapsible>
                          <CollapsibleTrigger asChild>
                            <button className="text-xs text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1">
                              <ChevronDown className="h-3 w-3" />
                              Learn more
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="text-xs text-muted-foreground mt-1 pl-4 border-l-2 border-border">
                              {milestone.helpText}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Blocked reason */}
                      {isBlocked && milestone.isBlocked && (
                        <div className="text-xs text-destructive mt-1 bg-destructive/10 border border-destructive/20 rounded p-2">
                          {(milestone as any).blockedReason || 'This step is currently blocked'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
