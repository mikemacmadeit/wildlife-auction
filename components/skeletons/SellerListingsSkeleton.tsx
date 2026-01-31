'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Skeleton that mirrors the seller listings page (gallery/list view).
 * Same container, header, filter card, and gallery grid so content loads in place.
 */
export function SellerListingsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('min-h-screen bg-background pb-20 md:pb-6', className)}>
      <div className="container mx-auto px-4 py-4 sm:py-6 md:py-8 max-w-7xl space-y-4 sm:space-y-6 md:space-y-8">
        {/* Header — same structure and spacing as real page */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="min-w-0">
            <Skeleton className="h-7 sm:h-9 md:h-10 w-24 sm:w-32 md:w-36 mb-0.5 sm:mb-2 rounded-lg" />
            <Skeleton className="h-3 sm:h-4 md:h-5 w-48 sm:w-56 max-w-full rounded" />
          </div>
          <Skeleton className="h-11 min-h-[44px] w-36 md:w-40 rounded-lg shrink-0" />
        </div>

        {/* Filter card — same structure as real page (search row + chips) */}
        <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <Skeleton className="h-11 w-full md:max-w-md rounded-lg" />
              <Skeleton className="h-10 w-[180px] rounded-lg hidden md:block" />
            </div>
            <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1 we-scrollbar-hover">
              <div className="flex items-center gap-2 flex-nowrap md:flex-wrap min-w-0">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <Skeleton key={i} className="h-9 w-24 rounded-full shrink-0" />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border/40 mt-2 pt-3">
              <Skeleton className="h-4 w-8 rounded" />
              <Skeleton className="h-9 w-[180px] rounded-lg" />
            </div>
          </CardContent>
        </Card>

        {/* Gallery grid (default view) */}
        <Card className="rounded-xl border-0 bg-transparent md:border md:border-border/60 md:bg-muted/30 md:dark:bg-muted/20">
          <CardContent className="p-0">
            {/* Gallery-style grid (default view) */}
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/60 bg-card overflow-hidden"
                >
                  <Skeleton className="w-full aspect-[4/3] rounded-none" />
                  <div className="p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <Skeleton className="h-4 flex-1 max-w-[180px] rounded" />
                      <Skeleton className="h-8 w-8 rounded-md shrink-0" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    <div className="flex justify-between gap-2">
                      <Skeleton className="h-5 w-14 rounded" />
                      <Skeleton className="h-3 w-20 rounded" />
                    </div>
                    <Skeleton className="h-3 w-24 rounded" />
                    <div className="flex gap-2 pt-1">
                      <Skeleton className="h-9 flex-1 rounded-md" />
                      <Skeleton className="h-9 flex-1 rounded-md" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
