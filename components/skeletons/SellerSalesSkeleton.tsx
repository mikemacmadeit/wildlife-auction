'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Skeleton that mirrors the exact layout of the seller sales page.
 * Same container, header, search card, tabs, and order cards so content
 * loads in the same positions — no flash / layout shift.
 */
export function SellerSalesSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('min-h-screen bg-background pb-20 md:pb-6', className)}>
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl space-y-6 min-w-0 overflow-x-hidden">
        {/* Header — same structure as real page */}
        <div className="space-y-2">
          <Skeleton className="h-7 sm:h-8 md:h-9 w-16 sm:w-24 md:w-28 rounded-lg" />
          <Skeleton className="h-4 w-72 max-w-full rounded" />
        </div>

        {/* Search card — same layout as real page */}
        <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <Skeleton className="h-11 min-h-11 w-full sm:max-w-md rounded-lg" />
              <div className="flex items-center gap-2 shrink-0">
                <Skeleton className="h-11 min-h-11 w-20 rounded-lg" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs — same scroll wrapper and pill height as real page */}
        <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1 we-scrollbar-hover">
          <div className="inline-flex flex-nowrap h-auto gap-1.5 p-0 w-max min-w-full sm:min-w-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-11 min-h-[44px] w-28 rounded-full shrink-0" />
            ))}
          </div>
        </div>

        {/* Order cards — same structure and spacing as real page (mt-4, grid gap-4, card layout) */}
        <div className="mt-4 space-y-4 min-w-0">
          {[1, 2, 3].map((i) => (
            <Card
              key={i}
              className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 min-w-0 overflow-hidden"
            >
              <CardContent className="p-0 overflow-hidden">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 p-3 sm:p-4 min-w-0">
                  <Skeleton className="h-16 w-20 sm:h-24 sm:w-24 shrink-0 rounded-lg self-start" />
                  <div className="min-w-0 flex-1 flex flex-col gap-2 sm:gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 min-w-0">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-4 w-full max-w-[220px] rounded" />
                        <Skeleton className="h-3 w-32 rounded" />
                      </div>
                      <div className="shrink-0 flex flex-col sm:items-end gap-2 w-full sm:w-auto">
                        <Skeleton className="h-5 w-20 rounded" />
                        <Skeleton className="h-10 w-full sm:w-28 rounded-md" />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
