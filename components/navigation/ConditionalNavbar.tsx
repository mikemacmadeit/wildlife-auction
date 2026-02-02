'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';

export function ConditionalNavbar() {
  const pathname = usePathname();
  
  // Hide navbar for dashboard, seller, and delivery routes (backend/embedded experience)
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/seller') || pathname?.startsWith('/delivery')) {
    return null;
  }

  return <Navbar />;
}
