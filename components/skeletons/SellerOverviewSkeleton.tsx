'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Skeleton that mirrors the exact layout of the seller overview page.
 * Same container, header, KPI grid, and "Today" card structure so when
 * real content loads it appears in the same positions (no flash / layout shift).
 */
export function SellerOverviewSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('min-h-screen bg-background pb-bottom-nav-safe md:pb-8', className)}>
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        {/* Header — same structure as real page */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <Skeleton className="h-9 md:h-10 w-56 md:w-72 mb-2 rounded-lg" />
            <Skeleton className="h-5 w-full max-w-sm rounded" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Skeleton className="h-11 w-28 rounded-lg" />
            <Skeleton className="h-11 w-36 rounded-lg" />
          </div>
        </div>

        {/* KPI grid — same grid and card structure as real page */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-4 lg:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card
              key={i}
              className={cn(
                'rounded-xl border border-border/50 bg-card',
                'max-lg:min-h-[120px] max-lg:flex max-lg:flex-col max-lg:justify-between'
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 max-lg:px-4 max-lg:pt-4 max-lg:pb-2">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
              </CardHeader>
              <CardContent className="max-lg:px-4 max-lg:pb-4 max-lg:pt-0">
                <Skeleton className="h-8 md:h-9 w-16 mb-2 rounded" />
                <Skeleton className="h-3 w-full max-w-[140px] rounded" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Today card — same structure as real page (header + 4 inner cards) */}
        <Card className="rounded-xl border border-border/50 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <Skeleton className="h-7 w-16 mb-2 rounded" />
                <Skeleton className="h-4 w-64 max-w-full rounded" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-24 rounded-md" />
                <Skeleton className="h-9 w-24 rounded-md" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="rounded-xl border border-border/60">
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-28 mb-3 rounded" />
                    <Skeleton className="h-8 w-12 mb-2 rounded" />
                    <Skeleton className="h-3 w-full rounded mb-3" />
                    <Skeleton className="h-10 w-full rounded-md" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Alerts / list section placeholder — reserves space so content doesn't jump */}
        <div className="space-y-3">
          <Skeleton className="h-7 w-40 rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
