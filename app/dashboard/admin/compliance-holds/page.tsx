'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldAlert } from 'lucide-react';

type HoldRow = {
  id: string;
  status?: string;
  payoutHoldReason?: string;
  adminPayoutApproval?: boolean;
  listingId?: string;
  buyerId?: string;
  sellerId?: string;
  listingSnapshot?: { title?: string; category?: string } | null;
  complianceDocsStatus?: { missing?: string[] } | null;
};

const HOLD_REASONS = [
  'MISSING_TAHC_CVI',
  'EXOTIC_CERVID_REVIEW_REQUIRED',
  'ESA_REVIEW_REQUIRED',
  'OTHER_EXOTIC_REVIEW_REQUIRED',
] as const;

const REVIEW_REQUIRED = new Set<string>([
  'EXOTIC_CERVID_REVIEW_REQUIRED',
  'ESA_REVIEW_REQUIRED',
  'OTHER_EXOTIC_REVIEW_REQUIRED',
]);

async function postAdminJson(path: string, body: any) {
  const { auth } = await import('@/lib/firebase/config');
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || json?.message || 'Request failed');
  return json;
}

export default function AdminComplianceHoldsPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HoldRow[]>([]);
  const [approving, setApproving] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ordersRef = collection(db, 'orders');
      const q = query(ordersRef, where('payoutHoldReason', 'in', [...HOLD_REASONS]), limit(100));
      const snap = await getDocs(q);
      const data: HoldRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setRows(data);
    } catch (e: any) {
      console.error('Failed to load compliance holds:', e);
      toast({ title: 'Failed to load', description: e?.message || 'Unable to load compliance holds', variant: 'destructive' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!adminLoading && isAdmin) load();
    if (!adminLoading && !isAdmin) setLoading(false);
  }, [adminLoading, isAdmin, load]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => String(a.payoutHoldReason || '').localeCompare(String(b.payoutHoldReason || '')));
  }, [rows]);

  const approve = async (orderId: string) => {
    setApproving((m) => ({ ...m, [orderId]: true }));
    try {
      await postAdminJson(`/api/admin/orders/${orderId}/payout-approval`, { approved: true });
      toast({ title: 'Approved', description: `Payout approval set for ${orderId}` });
      await load();
    } catch (e: any) {
      toast({ title: 'Approve failed', description: e?.message || 'Unable to approve payout', variant: 'destructive' });
    } finally {
      setApproving((m) => ({ ...m, [orderId]: false }));
    }
  };

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Compliance payout holds
          </h1>
          <p className="text-muted-foreground">
            Orders blocked for marketplace compliance reasons (docs missing or admin approval required).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Refresh
          </Button>
          <Button asChild variant="secondary">
            <Link href="/dashboard/admin/ops">Open Admin Ops</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
          <CardDescription>{sorted.length} order(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6">No compliance payout holds found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Listing</TableHead>
                  <TableHead>Hold reason</TableHead>
                  <TableHead>Missing</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((o) => {
                  const title = o.listingSnapshot?.title || o.listingId || '—';
                  const missing = o.complianceDocsStatus?.missing || [];
                  const reason = String(o.payoutHoldReason || '—');
                  const canApprove = REVIEW_REQUIRED.has(reason) && o.adminPayoutApproval !== true;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.id}</TableCell>
                      <TableCell className="max-w-[360px]">
                        <div className="truncate">{title}</div>
                        <div className="text-xs text-muted-foreground truncate">{o.listingSnapshot?.category || ''}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{reason}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {missing.length > 0 ? missing.join(', ') : '—'}
                      </TableCell>
                      <TableCell>
                        {o.adminPayoutApproval ? (
                          <Badge className="bg-emerald-600 text-white">Approved</Badge>
                        ) : (
                          <Badge variant="outline">Not approved</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canApprove ? (
                          <Button size="sm" onClick={() => approve(o.id)} disabled={!!approving[o.id]}>
                            {approving[o.id] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Approve payout
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" asChild>
                            <Link href="/dashboard/admin/ops">View</Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

