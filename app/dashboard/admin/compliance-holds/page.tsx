'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';

/**
 * Legacy route kept for backward compatibility.
 * Compliance payout holds are now managed inside /dashboard/admin/compliance under the "Payout Holds" tab.
 */
export default function AdminComplianceHoldsPage() {
  const router = useRouter();
  const { isAdmin, loading: adminLoading } = useAdmin();

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) return;
    router.replace('/dashboard/admin/compliance?tab=payout_holds');
  }, [adminLoading, isAdmin, router]);

  if (adminLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Admin access required.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Compliance payout holds moved
          </CardTitle>
          <CardDescription>
            This queue is now managed in the main Compliance hub under “Payout Holds”.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Button asChild>
            <Link href="/dashboard/admin/compliance?tab=payout_holds">Go to Compliance → Payout Holds</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

