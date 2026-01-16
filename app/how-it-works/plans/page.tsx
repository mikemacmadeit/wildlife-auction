import type { Metadata } from 'next';
import PricingPage from '@/app/pricing/page';

export const metadata: Metadata = {
  title: 'Exposure Plans | Wildlife Exchange',
  description: 'Learn about Wildlife Exchange seller exposure plans and how tiering affects placement and visibility.',
  alternates: { canonical: '/how-it-works/plans' },
};

export default function HowItWorksPlansPage() {
  return <PricingPage />;
}

