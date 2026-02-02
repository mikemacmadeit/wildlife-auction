'use client';

import { usePathname } from 'next/navigation';
import { Footer } from './Footer';

export function ConditionalFooter() {
  const pathname = usePathname();

  // Hide footer for dashboard and seller routes (backend experience)
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/seller') || pathname?.startsWith('/delivery')) {
    return null;
  }

  return <Footer />;
}

