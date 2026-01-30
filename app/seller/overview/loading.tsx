import { SellerOverviewSkeleton } from '@/components/skeletons/SellerOverviewSkeleton';

/** Route-level loading: same layout-matched skeleton as page so content loads in place (no flash). */
export default function Loading() {
  return <SellerOverviewSkeleton />;
}
