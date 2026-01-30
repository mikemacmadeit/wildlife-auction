import { PageLoader } from '@/components/ui/page-loader';

export default function Loading() {
  return (
    <PageLoader
      title="Loading listings…"
      subtitle="Getting your listings ready."
    />
  );
}
