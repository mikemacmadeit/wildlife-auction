import type { SellerReviewStats } from '@/lib/types';

export function initReviewStats(): SellerReviewStats {
  return {
    reviewCount: 0,
    avgRating: 0,
    ratingBuckets: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    lastReviewAt: null,
  };
}

export function applyReviewDelta(
  current: SellerReviewStats | null | undefined,
  rating: number,
  delta: 1 | -1,
  lastReviewAt?: Date
): SellerReviewStats {
  const safe = current ? { ...current } : initReviewStats();
  const buckets = { ...safe.ratingBuckets };
  const key = String(Math.min(5, Math.max(1, Math.round(rating)))) as keyof SellerReviewStats['ratingBuckets'];
  buckets[key] = Math.max(0, Number(buckets[key] || 0) + delta);

  const reviewCount = Math.max(0, Number(safe.reviewCount || 0) + delta);
  const total =
    Number(buckets['1'] || 0) * 1 +
    Number(buckets['2'] || 0) * 2 +
    Number(buckets['3'] || 0) * 3 +
    Number(buckets['4'] || 0) * 4 +
    Number(buckets['5'] || 0) * 5;
  const avgRating = reviewCount > 0 ? Math.round((total / reviewCount) * 100) / 100 : 0;

  return {
    reviewCount,
    avgRating,
    ratingBuckets: buckets,
    lastReviewAt: lastReviewAt || safe.lastReviewAt || null,
  };
}
