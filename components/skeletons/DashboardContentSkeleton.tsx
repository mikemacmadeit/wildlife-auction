'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Skeleton for dashboard route content. Uses the SAME outer wrapper as real
 * dashboard pages (min-h-screen, container, padding, max-w-7xl) so content
 * loads in the same place — smooth like seller overview.
 */
export function DashboardContentSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('min-h-screen bg-background pb-20 md:pb-6', className)}>
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        {/* Header — same as typical dashboard page */}
        <div>
          <Skeleton className="h-8 md:h-9 w-48 sm:w-64 rounded-lg mb-2" />
          <Skeleton className="h-4 w-full max-w-md rounded" />
        </div>
        {/* Filter/search card — matches orders, bids-offers, etc. */}
        <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20">
          <CardContent className="p-4 space-y-4">
            <Skeleton className="h-11 w-full md:max-w-md rounded-lg" />
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-9 w-24 rounded-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        {/* List/cards area — same structure as order cards */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="rounded-xl border border-border/60 overflow-hidden">
              <CardContent className="p-0">
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
                  <Skeleton className="h-20 w-24 sm:h-24 sm:w-28 rounded-lg shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-5 w-full max-w-[220px] rounded" />
                    <Skeleton className="h-4 w-28 rounded" />
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-10 w-full sm:w-28 rounded-md shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
