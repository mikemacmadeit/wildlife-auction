/**
 * Mount EmailCapturePopup only on public routes.
 * Keeps popup out of authenticated/dashboard surfaces.
 */

'use client';

import { usePathname } from 'next/navigation';
import { EmailCapturePopup } from '@/components/marketing/EmailCapturePopup';

const BLOCKED_PREFIXES = ['/dashboard', '/seller', '/app'];

export function PublicEmailCaptureMount() {
  const pathname = usePathname() || '/';

  for (const prefix of BLOCKED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return null;
    }
  }

  return <EmailCapturePopup source="popup" />;
}

