import { PageLoader } from '@/components/ui/page-loader';

export default function Loading() {
  return (
    <PageLoader
      title="Loading sales…"
      subtitle="Getting your orders ready."
    />
  );
}
