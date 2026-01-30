import { BrowseSkeletonWrapper } from '@/components/skeletons/BrowseSkeleton';

/** Route-level loading: layout-matched skeleton (grid or list from localStorage) so content loads in place (no flash). */
export default function Loading() {
  return <BrowseSkeletonWrapper />;
}
