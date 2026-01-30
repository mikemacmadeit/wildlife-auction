import { PageLoader } from '@/components/ui/page-loader';

export default function Loading() {
  return (
    <PageLoader
      title="Loading bids & offers…"
      subtitle="Getting your activity ready."
    />
  );
}
