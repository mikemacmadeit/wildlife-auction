'use client';

import { cn } from '@/lib/utils';

interface LoadingSkeletonProps {
  className?: string;
  height?: string;
  width?: string;
}

export function LoadingSkeleton({ className, height = 'h-4', width = 'w-full' }: LoadingSkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-muted rounded',
        height,
        width,
        className
      )}
    />
  );
}

export function DashboardLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex md:w-64 border-r border-border/50 bg-card flex-col">
        <div className="flex items-center justify-between h-20 px-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <LoadingSkeleton height="h-10" width="w-10" />
            <div className="space-y-2">
              <LoadingSkeleton height="h-4" width="w-32" />
              <LoadingSkeleton height="h-3" width="w-20" />
            </div>
          </div>
        </div>
        <div className="flex-1 p-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <LoadingSkeleton key={i} height="h-11" width="w-full" />
          ))}
        </div>
      </div>
      
      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col">
        <div className="md:hidden border-b border-border/50 h-16 px-4 flex items-center">
          <LoadingSkeleton height="h-9" width="w-40" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          <LoadingSkeleton height="h-8" width="w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <LoadingSkeleton key={i} height="h-32" width="w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}