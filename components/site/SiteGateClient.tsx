'use client';

import { useEffect, useState } from 'react';
import { SiteGateOverlay } from './SiteGateOverlay';

export function SiteGateClient({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    // Check cookie client-side
    const checkCookie = () => {
      const cookies = document.cookie.split(';');
      const gateCookie = cookies.find(c => c.trim().startsWith('we:site_gate:v1='));
      setAllowed(!!gateCookie);
    };

    checkCookie();
    // Check again after a short delay in case cookie was just set
    const timer = setTimeout(checkCookie, 100);
    return () => clearTimeout(timer);
  }, []);

  if (allowed === null) {
    // Show nothing while checking
    return null;
  }

  if (!allowed) {
    return <SiteGateOverlay />;
  }

  return <>{children}</>;
}
