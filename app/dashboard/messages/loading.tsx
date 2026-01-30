import { PageLoader } from '@/components/ui/page-loader';

export default function Loading() {
  return (
    <PageLoader
      title="Loading messages…"
      subtitle="Getting your conversations ready."
    />
  );
}
