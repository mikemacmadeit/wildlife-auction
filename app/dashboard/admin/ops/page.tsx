'use client';

import dynamic from 'next/dynamic';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';

const OpsClient = dynamic(
  () => import('./OpsClient').then((m) => m.default),
  {
    loading: () => <DashboardContentSkeleton />,
    ssr: false,
  }
);

export default function AdminOpsPage() {
  return <OpsClient />;
}
