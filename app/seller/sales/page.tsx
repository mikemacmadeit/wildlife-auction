'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { getIdToken } from '@/lib/firebase/auth-helper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ArrowRight, Clock, DollarSign, Heart, TrendingUp } from 'lucide-react';
import type { SellerDashboardData, SellerDashboardListing, SellerDashboardOffer, SellerDashboardOrder } from '@/lib/seller/getSellerDashboardData';
import { getSellerInsights } from '@/lib/seller/getSellerInsights';

async function authedGet(path: string, token: string) {
  const res = await fetch(path, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
  return data;
}

function money(n: number) {
  return `$${(Number(n || 0) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function hoursUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / (60 * 60 * 1000));
}

export default function SellerSalesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SellerDashboardData | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setData(null);

        if (!user) return;
        const token = await getIdToken(user, true);
        if (!token) throw new Error('Failed to get auth token');

        const res = await authedGet('/api/seller/dashboard', token);
        if (!mounted) return;
        setData(res.data as SellerDashboardData);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || String(e));
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  const attentionListings = useMemo(() => {
    const active = data?.activeListings || [];
    const drafts = data?.draftListings || [];
    const highWatchNoBid = active
      .filter((l) => l.watcherCount >= 5 && l.bidCount === 0)
      .sort((a, b) => b.watcherCount - a.watcherCount)
      .slice(0, 8);
    const needsPublish = drafts.slice(0, 8);
    return { highWatchNoBid, needsPublish };
  }, [data]);

  const offersWaitingOnSeller = useMemo(() => {
    const offers = data?.offers || [];
    return offers
      .filter((o) => (o.status === 'open' || o.status === 'countered') && o.lastActorRole === 'buyer')
      .sort((a, b) => (a.expiresAt || '').localeCompare(b.expiresAt || ''))
      .slice(0, 10);
  }, [data]);

  const recentSales = useMemo(() => {
    const all = data?.soldListings?.all || [];
    return [...all]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 10);
  }, [data]);

  const insights = useMemo(() => (data ? getSellerInsights(data) : []), [data]);

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="font-semibold">Sign in required</div>
                <div className="text-sm text-muted-foreground">Please sign in to view your seller dashboard.</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Seller dashboard</h1>
          <p className="text-muted-foreground">Operational view of listings, offers, sales, and revenue status.</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/dashboard/listings/new">Create listing</Link>
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <div className="font-semibold">Failed to load dashboard</div>
                <div className="text-sm text-muted-foreground">{error}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : !data ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">No data.</div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Insights */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Insights</CardTitle>
              <CardDescription>Rules-first nudges to help you sell faster (derived from your data).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {insights.length === 0 ? (
                <div className="text-sm text-muted-foreground">No insights right now.</div>
              ) : (
                insights.slice(0, 8).map((i) => (
                  <div key={i.id} className="flex items-start justify-between gap-3 border rounded-md px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={i.severity === 'warning' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {i.severity === 'warning' ? 'Action' : 'FYI'}
                        </Badge>
                        <div className="font-semibold">{i.title}</div>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">{i.description}</div>
                    </div>
                    {i.actionUrl ? (
                      <Button asChild variant="ghost" className="shrink-0">
                        <Link href={i.actionUrl}>{i.actionLabel || 'View'}</Link>
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Performance snapshot */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> GMV
                </CardTitle>
                <CardDescription>Sales volume (orders created)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-bold">{money(data.totals.gmv30d)}</div>
                <div className="text-sm text-muted-foreground">30d · {money(data.totals.gmv90d)} 90d · {money(data.totals.gmvAll)} all</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Velocity
                </CardTitle>
                <CardDescription>Average time-to-sale</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-bold">
                  {data.totals.avgTimeToSaleDays === null ? '—' : `${data.totals.avgTimeToSaleDays.toFixed(1)}d`}
                </div>
                <div className="text-sm text-muted-foreground">
                  Based on listing publish → first order created (when available)
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Heart className="h-4 w-4" /> Interest (active)
                </CardTitle>
                <CardDescription>Watchers and bids across active listings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-bold">{data.totals.watcherCountTotal.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">{data.totals.bidCountTotal.toLocaleString()} total bids</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="attention">
            <TabsList>
              <TabsTrigger value="attention">Listings needing attention</TabsTrigger>
              <TabsTrigger value="offers">Offers waiting on you</TabsTrigger>
              <TabsTrigger value="sales">Recent sales</TabsTrigger>
              <TabsTrigger value="revenue">Revenue status</TabsTrigger>
            </TabsList>

            <TabsContent value="attention" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>High watchers, no bids</CardTitle>
                  <CardDescription>Consider adjusting reserve/price or improving photos/details.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {attentionListings.highWatchNoBid.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No listings matched this rule.</div>
                  ) : (
                    <div className="space-y-2">
                      {attentionListings.highWatchNoBid.map((l) => (
                        <ListingRow key={l.id} listing={l} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Drafts / pending</CardTitle>
                  <CardDescription>Finish publishing to increase inventory and sales velocity.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {attentionListings.needsPublish.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No drafts found.</div>
                  ) : (
                    <div className="space-y-2">
                      {attentionListings.needsPublish.map((l) => (
                        <ListingRow key={l.id} listing={l} isDraft />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="offers" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Offers waiting on you</CardTitle>
                  <CardDescription>Open/countered offers where the buyer acted last.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {offersWaitingOnSeller.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No offers waiting on you.</div>
                  ) : (
                    offersWaitingOnSeller.map((o) => <OfferRow key={o.id} offer={o} />)
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sales" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recent sales</CardTitle>
                  <CardDescription>Latest orders created for your listings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recentSales.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No sales yet.</div>
                  ) : (
                    recentSales.map((o) => <OrderRow key={o.id} order={o} />)
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="revenue" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue status</CardTitle>
                  <CardDescription>Held vs released; protected vs non-protected (derived).</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Held (not transferred)</div>
                    <div className="text-2xl font-bold">{money(data.totals.revenue.held)}</div>
                    <div className="text-sm text-muted-foreground">Protected held: {money(data.totals.revenue.protectedHeld)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Released (transfer created)</div>
                    <div className="text-2xl font-bold">{money(data.totals.revenue.released)}</div>
                    <div className="text-sm text-muted-foreground">Protected released: {money(data.totals.revenue.protectedReleased)}</div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function ListingRow({ listing, isDraft }: { listing: SellerDashboardListing; isDraft?: boolean }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border rounded-md px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/seller/listings/${listing.id}/edit`} className="font-semibold hover:underline truncate">
            {listing.title || 'Untitled listing'}
          </Link>
          <Badge variant="outline" className="text-xs">{listing.type}</Badge>
          <Badge variant={isDraft ? 'secondary' : 'outline'} className="text-xs">{listing.status}</Badge>
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap mt-1">
          <span className="inline-flex items-center gap-1"><Heart className="h-4 w-4" /> {listing.watcherCount}</span>
          <span className="inline-flex items-center gap-1"><TrendingUp className="h-4 w-4" /> {listing.bidCount}</span>
          {listing.endsAt ? <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> ends {new Date(listing.endsAt).toLocaleString()}</span> : null}
        </div>
      </div>
      <Button asChild variant="ghost" className="justify-start md:justify-center">
        <Link href={`/listing/${listing.id}`}>
          View <ArrowRight className="h-4 w-4 ml-1" />
        </Link>
      </Button>
    </div>
  );
}

function OfferRow({ offer }: { offer: SellerDashboardOffer }) {
  const hrs = hoursUntil(offer.expiresAt);
  const expLabel = hrs === null ? null : hrs <= 0 ? 'Expired' : `${hrs}h left`;
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border rounded-md px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/seller/offers/${offer.id}`} className="font-semibold hover:underline truncate">
            {offer.listingTitle || 'Offer'}
          </Link>
          <Badge variant="outline" className="text-xs">{offer.status}</Badge>
          {expLabel ? (
            <Badge variant={hrs !== null && hrs <= 3 ? 'destructive' : 'secondary'} className="text-xs inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {expLabel}
            </Badge>
          ) : null}
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          Offer: {money(offer.currentAmount)}
        </div>
      </div>
      <Button asChild variant="ghost" className="justify-start md:justify-center">
        <Link href={`/seller/offers/${offer.id}`}>
          Review <ArrowRight className="h-4 w-4 ml-1" />
        </Link>
      </Button>
    </div>
  );
}

function OrderRow({ order }: { order: SellerDashboardOrder }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border rounded-md px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/seller/orders/${order.id}`} className="font-semibold hover:underline truncate">
            {order.listingTitle || order.listingId}
          </Link>
          <Badge variant="outline" className="text-xs">{order.status}</Badge>
          {order.stripeTransferId ? <Badge variant="secondary" className="text-xs">Released</Badge> : <Badge variant="outline" className="text-xs">Held</Badge>}
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {money(order.amount)} · {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
        </div>
      </div>
      <Button asChild variant="ghost" className="justify-start md:justify-center">
        <Link href={`/seller/orders/${order.id}`}>
          View <ArrowRight className="h-4 w-4 ml-1" />
        </Link>
      </Button>
    </div>
  );
}

