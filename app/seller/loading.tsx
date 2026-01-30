import { SellerContentSkeleton } from '@/components/skeletons/SellerContentSkeleton';

/**
 * Layout-level loading for /seller/* — skeleton-in-shell.
 * Shell (sidebar, header) stays visible; only content area shows skeleton.
 */
export default function SellerLoading() {
  return <SellerContentSkeleton />;
}
