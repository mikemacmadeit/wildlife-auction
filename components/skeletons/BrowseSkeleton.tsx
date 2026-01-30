'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonListingGrid, SkeletonListingList } from '@/components/skeletons/SkeletonCard';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'browse-view-mode';

/** Reads saved view mode from localStorage (client-only). Used so route loading skeleton matches page. */
function getStoredViewMode(): BrowseViewMode {
  if (typeof window === 'undefined') return 'card';
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'list' || saved === 'card' ? saved : 'card';
}

/**
 * Client wrapper that shows grid or list skeleton based on saved view mode.
 * Use in loading.tsx so the route-level skeleton matches the page (no flash).
 */
export function BrowseSkeletonWrapper({ className }: { className?: string }) {
  const [viewMode] = useState<BrowseViewMode>(getStoredViewMode);
  return <BrowseSkeleton className={className} viewMode={viewMode} />;
}

export type BrowseViewMode = 'card' | 'list';

/**
 * Skeleton that mirrors browse page layout so content loads in place.
 * Same frame: 280px sidebar + main with results header, toolbar, and results area.
 * Respects viewMode so grid/list transition is smooth (no flash).
 * Mobile always shows list skeleton (page always shows list on mobile).
 */
export function BrowseSkeleton({
  className,
  viewMode = 'card',
}: {
  className?: string;
  viewMode?: BrowseViewMode;
}) {
  return (
    <div className={cn('min-h-screen bg-background', className)}>
      <div className="container mx-auto px-4 py-2 md:py-6">
        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-8">
          {/* Sidebar — same width and sticky as real page */}
          <aside className="hidden lg:block self-start">
            <div className="sticky top-[104px] space-y-4 pr-1 -mr-1">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <div className="space-y-2 pt-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-9 w-full rounded" />
                ))}
              </div>
              <Skeleton className="h-10 w-32 rounded-lg mt-4" />
            </div>
          </aside>

          {/* Main: results header + toolbar + grid — same structure as real page */}
          <div>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-3 md:mb-6 gap-4">
              <div className="min-w-0">
                <Skeleton className="h-8 md:h-9 w-48 md:w-64 mb-2 rounded-lg" />
                <div className="flex items-center gap-2 flex-wrap">
                  <Skeleton className="h-4 w-56 rounded" />
                  <Skeleton className="h-8 w-24 rounded" />
                </div>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <Skeleton className="h-12 w-[150px] rounded-lg" />
                <Skeleton className="h-12 w-[170px] rounded-lg" />
                <Skeleton className="h-12 w-[180px] rounded-lg" />
                <div className="hidden md:flex gap-1">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </div>
              </div>
            </div>

            {/* Mobile: always list (page always shows list on mobile) */}
            <div className="md:hidden">
              <SkeletonListingList count={8} variant="browseMobile" />
            </div>
            {/* Desktop: grid or list by viewMode so no flash when content loads */}
            {viewMode === 'card' ? (
              <div className="hidden md:block">
                <SkeletonListingGrid count={12} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6" />
              </div>
            ) : (
              <div className="hidden md:block">
                <SkeletonListingList count={8} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
