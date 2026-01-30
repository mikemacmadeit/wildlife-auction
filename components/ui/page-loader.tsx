'use client';

import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

export interface PageLoaderProps {
  /** Main line, e.g. "Loading…" or "Loading orders…" */
  title?: string;
  /** Optional second line, e.g. "Getting things ready." */
  subtitle?: string;
  /** Minimum height so layout doesn't jump. Default matches route loading. */
  minHeight?: 'screen' | 'content';
  className?: string;
}

const minHeightClasses = {
  screen: 'min-h-screen',
  content: 'min-h-[70vh]',
} as const;

/**
 * Full-page loading state. Use in loading.tsx and for in-page full-screen
 * loading so route transitions and data loading show the same spinner and feel.
 * Fades in quickly for a smooth transition.
 */
export function PageLoader({
  title = 'Loading…',
  subtitle = 'Getting things ready.',
  minHeight = 'content',
  className,
}: PageLoaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center px-4 pb-20 md:pb-6',
        minHeightClasses[minHeight],
        className
      )}
    >
      <div className="text-center space-y-3 animate-in fade-in-0 duration-150">
        <Spinner size="xl" className="mx-auto" />
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {subtitle ? (
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}
