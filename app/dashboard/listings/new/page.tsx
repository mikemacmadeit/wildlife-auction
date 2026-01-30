'use client';

import dynamic from 'next/dynamic';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';

const NewListingClient = dynamic(
  () => import('./NewListingClient').then((m) => m.default),
  {
    loading: () => <DashboardContentSkeleton className="min-h-screen" />,
    ssr: false,
  }
);

export default function NewListingPage() {
  return <NewListingClient />;
}
