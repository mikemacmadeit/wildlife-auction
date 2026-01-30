'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 space-y-4', className)}>
      <Skeleton className="h-48 w-full rounded-md" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

export function SkeletonListingGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Single skeleton card sized to match ListingCard in the homepage rail (same dimensions). */
function ListingRailSkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border-2 border-border/50 bg-card overflow-hidden flex flex-col',
        'w-[200px] h-[300px] sm:w-[320px] sm:h-[420px] lg:w-[340px] lg:h-[420px]',
        className
      )}
    >
      <Skeleton className="w-full flex-1 min-h-0 rounded-none" />
      <div className="p-3 space-y-2 flex-shrink-0 border-t border-border/40">
        <Skeleton className="h-4 w-full rounded" />
        <Skeleton className="h-4 w-3/4 rounded" />
        <Skeleton className="h-5 w-20 rounded" />
      </div>
    </div>
  );
}

/** Horizontal skeleton rail matching ListingRail layout (eBay-style loading). */
export function ListingRailSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('group/rail relative [--rail-card-w:200px] sm:[--rail-card-w:320px] lg:[--rail-card-w:340px]', className)}>
      <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 we-scrollbar-hover snap-x snap-proximity md:px-12">
        <div className="flex gap-4 min-w-max">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="snap-start flex-shrink-0 overflow-hidden w-[200px] h-[300px] sm:w-[320px] sm:h-[420px] lg:w-[340px] lg:h-[420px]">
              <ListingRailSkeletonCard />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
