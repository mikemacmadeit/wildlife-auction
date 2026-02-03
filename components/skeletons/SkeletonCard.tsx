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

/** Single list row skeleton matching ListItem layout (image left, content right). */
function SkeletonListingRow({ variant = 'default' }: { variant?: 'default' | 'browseMobile' }) {
  if (variant === 'browseMobile') {
    return (
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <div className="flex">
          <Skeleton className="w-[96px] min-w-[96px] h-[112px] shrink-0 rounded-none" />
          <div className="flex-1 min-w-0 p-3 space-y-2">
            <Skeleton className="h-4 w-full max-w-[180px] rounded" />
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-5 w-16 rounded mt-2" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <div className="flex flex-row md:grid md:grid-cols-[288px_1fr] min-h-[128px] md:min-h-[208px]">
        <Skeleton className="w-32 h-32 sm:w-44 sm:h-44 md:w-full md:min-h-[208px] shrink-0 rounded-none" />
        <div className="flex-1 min-w-0 p-3 sm:p-4 md:p-5 space-y-3">
          <Skeleton className="h-5 w-full max-w-[240px] rounded" />
          <Skeleton className="h-4 w-32 rounded" />
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-6 w-24 rounded mt-2" />
        </div>
      </div>
    </div>
  );
}

/** List of row skeletons matching ListItem so grid/list transition has no layout flash. */
export function SkeletonListingList({
  count = 8,
  className,
  variant = 'default',
}: {
  count?: number;
  className?: string;
  variant?: 'default' | 'browseMobile';
}) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListingRow key={i} variant={variant} />
      ))}
    </div>
  );
}

/** Single skeleton card sized to match ListingCard in the homepage rail (same dimensions). box-border so border is inside and doesn't get clipped by wrapper. */
function ListingRailSkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border-2 border-border/50 bg-card overflow-hidden flex flex-col box-border',
        'w-[260px] h-[360px] sm:w-[320px] sm:h-[420px] lg:w-[340px] lg:h-[420px]',
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

/** Horizontal skeleton rail matching ListingRail layout (eBay-style loading). Wrapper uses same dimensions as real rail; card uses box-border so it doesn't clip. */
export function ListingRailSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('group/rail relative [--rail-card-w:260px] sm:[--rail-card-w:320px] lg:[--rail-card-w:340px]', className)}>
      <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 we-scrollbar-hover snap-x snap-proximity md:px-12">
        <div className="flex gap-4 min-w-max">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="snap-start flex-shrink-0 w-[260px] h-[360px] sm:w-[320px] sm:h-[420px] lg:w-[340px] lg:h-[420px]">
              <ListingRailSkeletonCard />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
