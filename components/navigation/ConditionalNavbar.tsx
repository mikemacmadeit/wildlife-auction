'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';

export function ConditionalNavbar() {
  const pathname = usePathname();
  
  // Hide navbar for dashboard and seller routes (backend experience)
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/seller')) {
    return null;
  }

  return <Navbar />;
}
