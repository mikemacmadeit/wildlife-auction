'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Skeleton for listing detail page — matches typical layout (image, title, price, content).
 */
export function ListingDetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6 p-4 sm:p-6 pb-20 md:pb-6', className)}>
      <div className="grid gap-6 lg:grid-cols-[1fr,minmax(0,400px)]">
        <div className="space-y-4">
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-12 w-32 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
