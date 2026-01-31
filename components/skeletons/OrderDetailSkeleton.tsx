'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Skeleton for order detail page (buyer or seller). Uses the SAME outer wrapper
 * as the real order detail page (min-h-screen, container, max-w-5xl) so content
 * loads in the same place — smooth like seller overview / dashboard.
 */
export function OrderDetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('min-h-screen bg-background pb-20 md:pb-6', className)}>
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl space-y-6">
        {/* Back button */}
        <Skeleton className="h-9 w-32 rounded-md" />

        {/* Main card — same structure as order page: image + title + badges */}
        <Card className="rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/25">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-3 min-w-[260px]">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-28 w-28 md:h-36 md:w-36 rounded-2xl shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-8 w-24 rounded-lg" />
                    <Skeleton className="h-4 w-full max-w-[280px] rounded" />
                    <Skeleton className="h-3 w-40 rounded" />
                    <div className="flex gap-2 pt-2">
                      <Skeleton className="h-9 w-24 rounded-md" />
                      <Skeleton className="h-9 w-24 rounded-md" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next action / banner area */}
        <Card className="rounded-xl border border-border/60 bg-muted/20">
          <CardContent className="p-4">
            <Skeleton className="h-5 w-40 mb-2 rounded" />
            <Skeleton className="h-4 w-full max-w-md rounded" />
          </CardContent>
        </Card>

        {/* Timeline / progress card */}
        <Card className="rounded-xl border border-border/60">
          <CardContent className="p-4 space-y-4">
            <Skeleton className="h-6 w-28 rounded-lg" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-full max-w-[200px] rounded" />
                    <Skeleton className="h-3 w-24 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Docs / details card */}
        <Card className="rounded-xl border border-border/60">
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-6 w-36 rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-md" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
