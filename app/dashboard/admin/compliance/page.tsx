'use client';

import dynamic from 'next/dynamic';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';

const ComplianceClient = dynamic(
  () => import('./ComplianceClient').then((m) => m.default),
  {
    loading: () => <DashboardContentSkeleton />,
    ssr: false,
  }
);

export default function AdminCompliancePage() {
  return <ComplianceClient />;
}
