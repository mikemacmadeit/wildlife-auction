'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export default function SellerLogisticsPage() {
  const router = useRouter();

  useEffect(() => {
    // Canonical management is per-order in Sales → order detail.
    const t = setTimeout(() => router.replace('/seller/sales'), 250);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-3xl space-y-6">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Documents & Delivery Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Documents and delivery updates are managed on each order page.
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button asChild>
                <Link href="/seller/sales">
                  Go to Sales
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/orders">Go to Purchases</Link>
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Note: Wildlife Exchange does not arrange pickup, transport, or delivery. Parties coordinate directly.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

