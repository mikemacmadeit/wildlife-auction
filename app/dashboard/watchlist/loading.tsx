import { PageLoader } from '@/components/ui/page-loader';

export default function Loading() {
  return (
    <PageLoader
      title="Loading watchlist…"
      subtitle="Getting your saved listings ready."
    />
  );
}
