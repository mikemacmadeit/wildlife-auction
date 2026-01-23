'use client';

import { useEffect, useState } from 'react';
import { SiteGateOverlay } from './SiteGateOverlay';

export function SiteGateClient({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    // Check cookie client-side
    const checkCookie = () => {
      try {
        const cookies = document.cookie.split(';').map(c => c.trim());
        const gateCookie = cookies.find(c => c.startsWith('we:site_gate:v1='));
        if (gateCookie) {
          const value = gateCookie.substring('we:site_gate:v1='.length);
          // Cookie exists and has a non-empty value
          setAllowed(value.length > 0);
        } else {
          setAllowed(false);
        }
      } catch (e) {
        // If cookie parsing fails, assume not allowed
        setAllowed(false);
      }
    };

    checkCookie();
    // Check periodically in case cookie was just set (especially after redirect)
    const interval = setInterval(checkCookie, 200);
    return () => clearInterval(interval);
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
