'use client';

import { cn } from '@/lib/utils';

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
  xl: 'h-10 w-10 border-4',
} as const;

export type SpinnerSize = keyof typeof sizeClasses;

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

/**
 * Single canonical spinner for the app. Use for all loading states so
 * transitions are consistent (page load, in-page load, buttons).
 */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'rounded-full border-primary border-t-transparent animate-spin',
        sizeClasses[size],
        className
      )}
    />
  );
}
