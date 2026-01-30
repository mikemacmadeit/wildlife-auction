'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Skeleton that mirrors the exact layout of the seller listings page.
 * Same container, header, filter card, table (desktop) and cards (mobile)
 * so content loads in the same positions — no flash / layout shift.
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
          </CardContent>
        </Card>

        {/* Table (desktop) — same table structure, col widths, row heights as real page */}
        <Card className="rounded-xl border-0 bg-transparent md:border md:border-border/60 md:bg-muted/30 md:dark:bg-muted/20">
          <CardContent className="p-0">
            <div className="hidden md:block overflow-hidden">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[34%]" />
                  <col className="w-[9%]" />
                  <col className="w-[11%]" />
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-border/50 bg-background/50">
                    <th className="h-16 px-4 text-left align-middle">
                      <Skeleton className="h-4 w-16 rounded" />
                    </th>
                    <th className="h-16 px-4 text-left align-middle">
                      <Skeleton className="h-4 w-10 rounded" />
                    </th>
                    <th className="h-16 px-4 text-left align-middle">
                      <Skeleton className="h-4 w-16 rounded" />
                    </th>
                    <th className="h-16 px-4 text-left align-middle">
                      <Skeleton className="h-4 w-14 rounded" />
                    </th>
                    <th className="h-16 px-4 text-left align-middle">
                      <Skeleton className="h-4 w-12 rounded" />
                    </th>
                    <th className="h-16 px-4 text-left align-middle">
                      <Skeleton className="h-4 w-14 rounded" />
                    </th>
                    <th className="h-16 px-4 text-left align-middle">
                      <Skeleton className="h-4 w-14 rounded" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="p-5 align-middle">
                        <div className="flex items-start gap-4">
                          <Skeleton className="h-24 w-32 rounded-xl shrink-0" />
                          <div className="flex flex-col gap-2 min-w-0 flex-1">
                            <Skeleton className="h-5 w-full max-w-[180px] rounded" />
                            <Skeleton className="h-4 w-24 rounded" />
                          </div>
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <Skeleton className="h-5 w-16 rounded" />
                      </td>
                      <td className="p-4 align-middle">
                        <Skeleton className="h-6 w-14 rounded" />
                      </td>
                      <td className="p-3 align-middle">
                        <Skeleton className="h-4 w-20 rounded" />
                      </td>
                      <td className="p-3 align-middle">
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </td>
                      <td className="p-3 align-middle">
                        <Skeleton className="h-4 w-12 rounded" />
                      </td>
                      <td className="p-3 align-middle">
                        <Skeleton className="h-9 w-20 rounded-md" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile — same card layout and image size as real page */}
            <div className="md:hidden p-2 sm:p-0 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-xl border border-primary bg-muted/30 dark:bg-muted/20 p-3 sm:p-4"
                >
                  <div className="flex gap-3 min-w-0">
                    <Skeleton className="h-16 w-20 sm:h-20 sm:w-24 rounded-lg shrink-0" />
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <Skeleton className="h-4 w-full max-w-[200px] rounded" />
                      <Skeleton className="h-3 w-24 rounded" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  </div>
                  <div className="mt-3 pt-3 flex gap-2">
                    <Skeleton className="h-8 flex-1 rounded-md" />
                    <Skeleton className="h-8 flex-1 rounded-md" />
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
