'use client';

import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/ui/page-loader';

const NewListingClient = dynamic(
  () => import('./NewListingClient').then((m) => m.default),
  {
    loading: () => (
      <PageLoader
        title="Loading…"
        subtitle="Getting the form ready."
        minHeight="screen"
      />
    ),
    ssr: false,
  }
);

export default function NewListingPage() {
  return <NewListingClient />;
}
