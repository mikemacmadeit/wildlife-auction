import type { Metadata } from 'next';
import PricingPage from '@/app/pricing/page';

export const metadata: Metadata = {
  title: 'Seller Tiers | Agchange',
  description: 'Learn about Agchange seller tiers and how placement and badges work.',
  alternates: { canonical: '/how-it-works/plans' },
};

export default function HowItWorksPlansPage() {
  return <PricingPage />;
}

