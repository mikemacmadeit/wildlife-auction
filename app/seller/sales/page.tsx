'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SellerSalesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/bids-offers');
  }, [router]);

  return null;
}

