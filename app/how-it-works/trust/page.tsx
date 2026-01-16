import type { Metadata } from 'next';
import TrustPage from '@/app/trust/page';

export const metadata: Metadata = {
  title: 'Trust & Compliance | Wildlife Exchange',
  description: 'Trust badges, verification, and compliance workflows for regulated categories on Wildlife Exchange.',
  alternates: { canonical: '/how-it-works/trust' },
};

export default function HowItWorksTrustPage() {
  return <TrustPage />;
}

