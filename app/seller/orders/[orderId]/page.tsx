/**
 * Seller Order Detail (read-only + seller delivery actions)
 *
 * Phase 2A: Shared TransactionTimeline for seller view.
 * Phase 2C: Seller will be able to mark in-transit (route added separately) and delivered (existing).
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, AlertTriangle, ArrowLeft, Truck, PackageCheck } from 'lucide-react';
import type { Listing, Order } from '@/lib/types';
import { getOrderById } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { TransactionTimeline } from '@/components/orders/TransactionTimeline';
import { getOrderIssueState } from '@/lib/orders/getOrderIssueState';
import { getOrderTrustState } from '@/lib/orders/getOrderTrustState';

async function postAuthJson(path: string, body?: any): Promise<any> {
  const { auth } = await import('@/lib/firebase/config');
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || 'Request failed');
  return json;
}

export default function SellerOrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const orderId = params?.orderId;
  const [order, setOrder] = useState<Order | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<'in_transit' | 'delivered' | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.uid || !orderId) return;
      setLoading(true);
      setError(null);
      try {
        const o = await getOrderById(orderId);
        if (!o) throw new Error('Order not found');
        if (o.sellerId !== user.uid) throw new Error('You can only view your own sales.');
        const l = await getListingById(o.listingId);
        if (cancelled) return;
        setOrder(o);
        setListing(l || null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load order');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (!authLoading) void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, orderId, user?.uid]);

  const issueState = useMemo(() => (order ? getOrderIssueState(order) : 'none'), [order]);
  const trustState = useMemo(() => (order ? getOrderTrustState(order) : null), [order]);

  const canMarkDelivered = !!order && ['paid', 'paid_held', 'in_transit'].includes(order.status) && !order.deliveredAt;
  // Phase 2C: mark-in-transit route will enable this (kept disabled until route exists)
  const canMarkInTransit = !!order && ['paid', 'paid_held'].includes(order.status);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Card>
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <div className="font-semibold">Sign in required</div>
              <div className="text-sm text-muted-foreground mt-1">Please sign in to view this sale.</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-8 max-w-4xl space-y-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/seller/overview">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to seller dashboard
            </Link>
          </Button>
          <Card>
            <CardContent className="pt-6">
              <div className="font-semibold text-destructive">Couldn’t load order</div>
              <div className="text-sm text-muted-foreground mt-1">{error || 'Order not found.'}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl space-y-6">
        <Card className="border-border/60 bg-gradient-to-br from-card via-card to-muted/25">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2 min-w-[260px]">
                <Button asChild variant="outline" size="sm">
                  <Link href="/seller/overview">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to seller dashboard
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Sale</h1>
                  <p className="text-sm text-muted-foreground break-words mt-1">
                    {listing?.title || 'Listing'} · <span className="font-mono">{order.id}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {typeof order.amount === 'number' ? (
                  <Badge variant="secondary" className="font-semibold text-xs">
                    Total ${order.amount.toLocaleString()}
                  </Badge>
                ) : null}
                {trustState ? (
                  <Badge variant="secondary" className="font-semibold text-xs capitalize">
                    {trustState.replaceAll('_', ' ')}
                  </Badge>
                ) : null}
                {issueState !== 'none' && (
                  <Badge variant="destructive" className="font-semibold text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Issue under review
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <TransactionTimeline order={order} role="seller" />

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Delivery actions</CardTitle>
              <CardDescription>These actions update existing order fields only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold text-sm">Mark in transit</div>
                  <div className="text-xs text-muted-foreground">Optional step before delivered (Phase 2C).</div>
                </div>
                <Button
                  variant="outline"
                  disabled={!canMarkInTransit || processing !== null}
                  onClick={async () => {
                    try {
                      setProcessing('in_transit');
                      await postAuthJson(`/api/orders/${order.id}/mark-in-transit`);
                      toast({ title: 'Updated', description: 'Marked in transit.' });
                      const refreshed = await getOrderById(order.id);
                      if (refreshed) setOrder(refreshed);
                    } catch (e: any) {
                      toast({ title: 'Error', description: e?.message || 'Failed to mark in transit', variant: 'destructive' });
                    } finally {
                      setProcessing(null);
                    }
                  }}
                >
                  {processing === 'in_transit' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Truck className="h-4 w-4 mr-2" />}
                  Mark in transit
                </Button>
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold text-sm">Mark delivered</div>
                  <div className="text-xs text-muted-foreground">Unlocks buyer receipt confirmation and issue reporting.</div>
                </div>
                <Button
                  disabled={!canMarkDelivered || processing !== null}
                  onClick={async () => {
                    try {
                      setProcessing('delivered');
                      await postAuthJson(`/api/orders/${order.id}/mark-delivered`, {});
                      toast({ title: 'Updated', description: 'Marked delivered.' });
                      const refreshed = await getOrderById(order.id);
                      if (refreshed) setOrder(refreshed);
                    } catch (e: any) {
                      toast({ title: 'Error', description: e?.message || 'Failed to mark delivered', variant: 'destructive' });
                    } finally {
                      setProcessing(null);
                    }
                  }}
                >
                  {processing === 'delivered' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}
                  Mark delivered
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Order details</CardTitle>
              <CardDescription>Quick reference links and metadata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold text-sm">Listing</div>
                  <div className="text-xs text-muted-foreground">{listing?.title || 'Listing'}</div>
                </div>
                {listing?.id ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/listing/${listing.id}`}>View listing</Link>
                  </Button>
                ) : null}
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/60 p-3 bg-background/40">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="text-sm font-semibold mt-0.5">{String(order.status).replaceAll('_', ' ')}</div>
                </div>
                <div className="rounded-lg border border-border/60 p-3 bg-background/40">
                  <div className="text-xs text-muted-foreground">Payment</div>
                  <div className="text-sm font-semibold mt-0.5">
                    {String((order as any).paymentMethod || '—').replaceAll('_', ' ')}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

