'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy route kept for backward compatibility.
 *
 * Canonical create-listing flow:
 * - `/dashboard/listings/new`
 * - includes listing-limit gating + latest compliance requirements
 */
export default function NewSellerListingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/listings/new');
  }, [router]);

  return null;
}

