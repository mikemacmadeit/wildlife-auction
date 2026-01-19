'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ArrowRight, AlertTriangle, Package, Truck, CheckCircle2, Clock } from 'lucide-react';
import type { Listing, Order } from '@/lib/types';
import { getOrdersForUser } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { useDebounce } from '@/hooks/use-debounce';

interface OrderWithListing extends Order {
  listing?: Listing | null;
}

type TabKey = 'needs_action' | 'in_progress' | 'completed' | 'cancelled' | 'all';

function statusBadge(status: string) {
  switch (status) {
    case 'paid_held':
    case 'paid':
      return { variant: 'default' as const, label: 'Paid (held)' };
    case 'in_transit':
      return { variant: 'secondary' as const, label: 'In transit' };
    case 'delivered':
      return { variant: 'secondary' as const, label: 'Delivered' };
    case 'ready_to_release':
      return { variant: 'default' as const, label: 'Ready to release' };
    case 'completed':
      return { variant: 'secondary' as const, label: 'Completed' };
    case 'disputed':
      return { variant: 'destructive' as const, label: 'Disputed' };
    case 'awaiting_bank_transfer':
      return { variant: 'secondary' as const, label: 'Awaiting bank transfer' };
    case 'awaiting_wire':
      return { variant: 'secondary' as const, label: 'Awaiting wire' };
    case 'cancelled':
      return { variant: 'secondary' as const, label: 'Cancelled' };
    case 'pending':
    default:
      return { variant: 'secondary' as const, label: 'Pending' };
  }
}

export default function SellerSalesPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabKey>('needs_action');
  const [orders, setOrders] = useState<OrderWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const sellerOrders = await getOrdersForUser(user.uid, 'seller');
      const enriched = await Promise.all(
        sellerOrders.map(async (o) => {
          try {
            const listing = await getListingById(o.listingId);
            return { ...o, listing: listing || null } as OrderWithListing;
          } catch {
            return { ...o, listing: null } as OrderWithListing;
          }
        })
      );
      setOrders(enriched);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load sales', variant: 'destructive' });
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [toast, user?.uid]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    const base = !q
      ? orders
      : orders.filter((o) => {
          return (
            o.id.toLowerCase().includes(q) ||
            o.listingId?.toLowerCase().includes(q) ||
            (o.listing?.title || '').toLowerCase().includes(q) ||
            String(o.status || '').toLowerCase().includes(q)
          );
        });

    const isNeedsAction = (s: string) =>
      ['paid_held', 'paid', 'ready_to_release', 'delivered', 'disputed'].includes(s);
    const isInProgress = (s: string) => ['pending', 'awaiting_bank_transfer', 'awaiting_wire', 'in_transit'].includes(s);

    switch (tab) {
      case 'needs_action':
        return base.filter((o) => isNeedsAction(String(o.status || '')));
      case 'in_progress':
        return base.filter((o) => isInProgress(String(o.status || '')));
      case 'completed':
        return base.filter((o) => String(o.status || '') === 'completed');
      case 'cancelled':
        return base.filter((o) => ['cancelled', 'refunded'].includes(String(o.status || '')));
      case 'all':
      default:
        return base;
    }
  }, [debounced, orders, tab]);

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
              <div className="text-sm text-muted-foreground mt-1">Please sign in to view your sales.</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl space-y-6">
        <Card className="border-border/60 bg-gradient-to-br from-card via-card to-muted/25">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl md:text-3xl font-extrabold tracking-tight">Sales</CardTitle>
            <CardDescription>Track payment → delivery → completion for every order.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by order, listing, status..." className="pl-9" />
              </div>
              <Button variant="outline" onClick={() => load()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="needs_action">
              <Clock className="h-4 w-4 mr-2" />
              Needs action
            </TabsTrigger>
            <TabsTrigger value="in_progress">
              <Truck className="h-4 w-4 mr-2" />
              In progress
            </TabsTrigger>
            <TabsTrigger value="completed">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Completed
            </TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            {filtered.length === 0 ? (
              <Card className="border-border/60">
                <CardContent className="pt-6 text-center text-sm text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  No sales found.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {filtered.map((o) => {
                  const badge = statusBadge(String(o.status || ''));
                  const title = o.listing?.title || 'Listing';
                  const total = typeof o.amount === 'number' ? o.amount : null;
                  return (
                    <Card key={o.id} className="border-border/60 hover:shadow-sm transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="min-w-0">
                            <div className="font-semibold line-clamp-1">{title}</div>
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                              <span className="font-mono">Order {o.id}</span>
                              {o.listing?.id ? (
                                <Link href={`/listing/${o.listing.id}`} className="underline underline-offset-2">
                                  View listing
                                </Link>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            {total !== null ? <Badge variant="secondary">${Number(total).toLocaleString()}</Badge> : null}
                            <Button asChild size="sm">
                              <Link href={`/seller/orders/${o.id}`}>
                                View
                                <ArrowRight className="h-4 w-4 ml-2" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

