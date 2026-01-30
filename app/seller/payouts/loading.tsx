import { PageLoader } from '@/components/ui/page-loader';

export default function Loading() {
  return (
    <PageLoader
      title="Loading payouts…"
      subtitle="Getting your earnings ready."
    />
  );
}
