import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';

/**
 * Layout-level loading for /dashboard/* — skeleton-in-shell.
 * Shell (sidebar, header) stays visible; only content area shows skeleton.
 */
export default function DashboardLoading() {
  return <DashboardContentSkeleton />;
}
