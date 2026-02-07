'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingReviewCountProps {
  /** Average rating 0–5 (displayed as X.X) */
  avgRating: number;
  /** Number of reviews */
  reviewCount: number;
  className?: string;
  /** Size: 'sm' | 'md' | 'lg' */
  size?: 'sm' | 'md' | 'lg';
  /** Show "reviews" label; if false, only star + number */
  showReviewLabel?: boolean;
}

export function StarRatingReviewCount({
  avgRating,
  reviewCount,
  className,
  size = 'md',
  showReviewLabel = true,
}: StarRatingReviewCountProps) {
  const hasReviews = reviewCount > 0;
  const displayRating = hasReviews ? Number(avgRating).toFixed(1) : '—';
  const label = showReviewLabel
    ? `${reviewCount} review${reviewCount === 1 ? '' : 's'}`
    : '';

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : size === 'md' ? 'h-4 w-4' : 'h-5 w-5';
  const textSize = size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base';

  return (
    <div className={cn('inline-flex items-center gap-1.5 text-muted-foreground', textSize, className)}>
      <Star className={cn(iconSize, 'text-amber-500 fill-amber-500 shrink-0')} />
      <span className="font-semibold text-foreground">{displayRating}</span>
      {showReviewLabel && (
        <>
          <span className="text-muted-foreground">·</span>
          <span>{label}</span>
        </>
      )}
    </div>
  );
}
