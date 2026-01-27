import type { Metadata } from 'next';
import TrustPage from '@/app/trust/page';

export const metadata: Metadata = {
  title: 'Trust & Compliance | Agchange',
  description: 'Trust badges, verification, and compliance workflows for regulated categories on Agchange.',
  alternates: { canonical: '/how-it-works/trust' },
};

export default function HowItWorksTrustPage() {
  return <TrustPage />;
}

