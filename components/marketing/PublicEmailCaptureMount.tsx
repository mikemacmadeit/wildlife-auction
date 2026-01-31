/**
 * Mount EmailCapturePopup only on public routes.
 * Keeps popup out of authenticated/dashboard surfaces.
 */

'use client';

import { usePathname } from 'next/navigation';
import { EmailCapturePopup } from '@/components/marketing/EmailCapturePopup';

// Keep the marketing popup off critical flows (auth + authenticated areas).
const BLOCKED_PREFIXES = ['/dashboard', '/seller', '/app', '/login', '/register'];

export function PublicEmailCaptureMount() {
  const pathname = usePathname() || '/';

  // Temporarily disabled for testing
  return null;

  /* Original logic - uncomment to re-enable
  for (const prefix of BLOCKED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return null;
    }
  }

  return <EmailCapturePopup source="popup" />;
  */
}

