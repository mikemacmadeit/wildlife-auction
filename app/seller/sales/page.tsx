'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Loader2,
  Search,
  ArrowRight,
  AlertTriangle,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ChevronDown,
  Receipt,
  Info,
} from 'lucide-react';
import type { Listing, Order } from '@/lib/types';
import { getOrdersForUser } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { getDocument } from '@/lib/firebase/firestore';
import { useDebounce } from '@/hooks/use-debounce';
import { subscribeToUnreadCountByTypes, markNotificationsAsReadByTypes } from '@/lib/firebase/notifications';
import type { NotificationType } from '@/lib/types';
import { usePathname } from 'next/navigation';

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

type PublicProfileLite = {
  id: string;
  displayName?: string;
  photoURL?: string;
};

function formatMoney(n: number | null | undefined) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatDate(d: any) {
  try {
    const date = d instanceof Date ? d : null;
    if (!date) return '—';
    return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formatShortDate(d: any) {
  try {
    const date = d instanceof Date ? d : null;
    if (!date) return '—';
    return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
  } catch {
    return '—';
  }
}

function initials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  const first = parts[0]?.[0] || 'U';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '';
  return (first + last).toUpperCase();
}

export default function SellerSalesPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const pathname = usePathname();

  const [tab, setTab] = useState<TabKey>('needs_action');
  const [tabFading, setTabFading] = useState(false);
  const [orders, setOrders] = useState<OrderWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250);
  const [buyerProfiles, setBuyerProfiles] = useState<Record<string, PublicProfileLite | null>>({});
  const [paymentOpen, setPaymentOpen] = useState<Record<string, boolean>>({});
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});
  const [unreadSalesCount, setUnreadSalesCount] = useState(0);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const sellerOrdersRaw = await getOrdersForUser(user.uid, 'seller');
      // Avoid showing checkout-abandoned "pending" skeleton orders as real sales.
      const sellerOrders = sellerOrdersRaw.filter((o) => !(o.status === 'pending' && o.stripeCheckoutSessionId));
      // Prefer server-authored snapshots for list rendering (avoid N+1 listing reads).
      // Fallback to a listing fetch only if snapshot is missing (older historical orders).
      const needsListing = sellerOrders.filter((o) => !o.listingSnapshot?.title);
      const listingById = new Map<string, Listing | null>();
      await Promise.all(
        needsListing.map(async (o) => {
          try {
            const l = await getListingById(o.listingId);
            listingById.set(o.listingId, l || null);
          } catch {
            listingById.set(o.listingId, null);
          }
        })
      );
      setOrders(
        sellerOrders.map((o) => ({
          ...o,
          listing: listingById.has(o.listingId) ? listingById.get(o.listingId) : undefined,
        }))
      );
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

  // Subscribe to sales notifications (Order.Received maps to order_created in NotificationType)
  useEffect(() => {
    if (!user?.uid) {
      setUnreadSalesCount(0);
      return;
    }

    try {
      // Order.Received notification maps to 'order_created' type in inApp.ts
      const salesNotificationTypes: NotificationType[] = ['order_created', 'order_paid'];
      return subscribeToUnreadCountByTypes(user.uid, salesNotificationTypes, (count) => {
        console.log('[Seller Sales] Unread sales notifications:', count);
        setUnreadSalesCount(count || 0);
      });
    } catch (error) {
      console.error('[Seller Sales] Error subscribing to notifications:', error);
      setUnreadSalesCount(0);
      return;
    }
  }, [user?.uid]);

  // Mark sales notifications as read when viewing the sales page
  useEffect(() => {
    if (!user?.uid) return;
    if (!pathname?.startsWith('/seller/sales')) return;
    
    const markAsRead = async () => {
      try {
        await markNotificationsAsReadByTypes(user.uid, ['order_created', 'order_paid']);
        setUnreadSalesCount(0);
      } catch (error) {
        console.error('[Seller Sales] Error marking notifications as read:', error);
      }
    };
    
    void markAsRead();
  }, [pathname, user?.uid]);

  // Smooth visual transition when switching in-page tabs (avoid "flash" from unmount/remount).
  useEffect(() => {
    setTabFading(true);
    const t = setTimeout(() => setTabFading(false), 140);
    return () => clearTimeout(t);
  }, [tab]);

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

  // Fetch buyer public profiles for currently visible rows (best-effort, public-safe only).
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!user?.uid) return;
      const ids = Array.from(
        new Set(
          filtered
            .slice(0, 30)
            .map((o) => String(o.buyerId || '').trim())
            .filter(Boolean)
        )
      );
      const missing = ids.filter((id) => !(id in buyerProfiles));
      if (missing.length === 0) return;

      // Mark as "in flight" (null) so we don't refetch spam on re-render.
      setBuyerProfiles((prev) => {
        const next = { ...prev };
        for (const id of missing) next[id] = null;
        return next;
      });

      const results: Record<string, PublicProfileLite | null> = {};
      await Promise.all(
        missing.map(async (uid) => {
          try {
            const doc = await getDocument<PublicProfileLite>('publicProfiles', uid);
            results[uid] = doc ? { id: doc.id, displayName: doc.displayName || undefined, photoURL: doc.photoURL || undefined } : null;
          } catch {
            results[uid] = null;
          }
        })
      );
      if (cancelled) return;
      setBuyerProfiles((prev) => ({ ...prev, ...results }));
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [buyerProfiles, filtered, user?.uid]);

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
            <CardTitle className="text-2xl md:text-3xl font-extrabold tracking-tight">Sold</CardTitle>
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
        </Tabs>

        <div className={`mt-4 transition-opacity duration-150 ${tabFading ? 'opacity-70' : 'opacity-100'}`}>
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
                const title = o.listingSnapshot?.title || o.listing?.title || 'Listing';
                const cover = o.listingSnapshot?.coverPhotoUrl || (Array.isArray((o.listing as any)?.images) ? (o.listing as any).images?.[0] : null) || null;
                const orderTotal = typeof o.amount === 'number' ? o.amount : null;
                const platformFee = typeof o.platformFee === 'number' ? o.platformFee : null;
                const net = typeof o.sellerAmount === 'number' ? o.sellerAmount : null;
                const buyerProfile = buyerProfiles[o.buyerId] || null;
                const buyerLabel =
                  (buyerProfile?.displayName && buyerProfile.displayName.trim()) ||
                  (String(o.buyerId || '').trim() ? `Buyer ${String(o.buyerId).slice(0, 6)}…` : 'Buyer');
                const buyerPaidAt = o.paidAt || null;
                const soldAt = o.paidAt || o.createdAt || null;
                const viewPaymentOpen = paymentOpen[o.id] === true;
                const viewDetailsOpen = detailsOpen[o.id] === true;

                return (
                  <Card key={o.id} className="border-border/60 overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex gap-4 p-4">
                        <div className="relative h-24 w-24 shrink-0 rounded-lg overflow-hidden bg-muted border">
                          {cover ? (
                            <Image
                              src={String(cover)}
                              alt={title}
                              fill
                              className="object-cover"
                              sizes="96px"
                              unoptimized
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                              <Package className="h-6 w-6" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={badge.variant}>{badge.label}</Badge>
                                {o.payoutHoldReason && o.payoutHoldReason !== 'none' ? (
                                  <Badge variant="secondary" className="font-semibold">
                                    Hold: {String(o.payoutHoldReason).replaceAll('_', ' ').toLowerCase()}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-2 font-semibold text-foreground leading-snug line-clamp-2">{title}</div>
                              <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono">Item ID: {o.listingId}</span>
                                  <span className="text-muted-foreground/70">•</span>
                                  <span className="font-mono">Order: {o.id}</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span>Sold: {formatShortDate(soldAt)}</span>
                                  <span className="text-muted-foreground/70">•</span>
                                  <span>Buyer paid: {formatShortDate(buyerPaidAt)}</span>
                                  <span className="text-muted-foreground/70">•</span>
                                  <span className="truncate">Buyer: {buyerLabel}</span>
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 flex flex-col items-end gap-2">
                              <div className="text-right">
                                <div className="text-sm text-muted-foreground">Net proceeds</div>
                                <div className="text-lg font-extrabold tracking-tight">{formatMoney(net)}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button asChild size="sm" className="font-semibold">
                                  <Link href={`/seller/orders/${o.id}`}>
                                    View order details
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                  </Link>
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                            <div className="text-sm text-muted-foreground">
                              <span className="font-semibold text-foreground">{formatMoney(orderTotal)}</span> order total
                              {platformFee !== null ? (
                                <>
                                  {' '}
                                  <span className="text-muted-foreground/70">•</span> Fees: <span className="font-semibold text-foreground">{formatMoney(platformFee)}</span>
                                </>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              <Collapsible
                                open={viewPaymentOpen}
                                onOpenChange={(open) => setPaymentOpen((prev) => ({ ...prev, [o.id]: open }))}
                              >
                                <CollapsibleTrigger asChild>
                                  <Button variant="outline" size="sm" className="font-semibold">
                                    <Receipt className="h-4 w-4 mr-2" />
                                    Payment details
                                    <ChevronDown className={viewPaymentOpen ? 'h-4 w-4 ml-2 rotate-180 transition-transform' : 'h-4 w-4 ml-2 transition-transform'} />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="mt-3 rounded-lg border bg-muted/10 p-4">
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                      <div>
                                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payments</div>
                                        <div className="mt-1 text-2xl font-extrabold tracking-tight">{formatMoney(net)}</div>
                                        <div className="text-sm text-muted-foreground">Net proceeds</div>
                                      </div>
                                      <div className="text-sm text-muted-foreground max-w-[420px]">
                                        This order uses a delayed settlement model. Payments are processed through the platform and released when the order becomes eligible and operations releases payout.
                                      </div>
                                    </div>

                                    <Separator className="my-4" />

                                    <div className="grid gap-3 md:grid-cols-3">
                                      <div className="rounded-md border bg-background p-3">
                                        <div className="text-xs text-muted-foreground">Buyer paid</div>
                                        <div className="font-semibold">{formatDate(o.paidAt || null)}</div>
                                      </div>
                                      <div className="rounded-md border bg-background p-3">
                                        <div className="text-xs text-muted-foreground">Eligible for release</div>
                                        <div className="font-semibold">{formatDate((o as any).releaseEligibleAt || null)}</div>
                                      </div>
                                      <div className="rounded-md border bg-background p-3">
                                        <div className="text-xs text-muted-foreground">Released</div>
                                        <div className="font-semibold">{formatDate(o.releasedAt || null)}</div>
                                      </div>
                                    </div>

                                    <Separator className="my-4" />

                                    <div className="grid gap-3 md:grid-cols-2">
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Transaction info</div>
                                        <div className="text-sm">
                                          <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Type</span>
                                            <span className="font-semibold">Order</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Order date</span>
                                            <span className="font-semibold">{formatDate(o.createdAt || null)}</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Buyer</span>
                                            <span className="font-semibold truncate max-w-[220px]">{buyerLabel}</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Payment intent</span>
                                            <span className="font-mono text-xs truncate max-w-[220px]">{o.stripePaymentIntentId || '—'}</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Transfer</span>
                                            <span className="font-mono text-xs truncate max-w-[220px]">{o.stripeTransferId || '—'}</span>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Transaction breakdown</div>
                                        <div className="text-sm">
                                          <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Amount</span>
                                            <span className="font-semibold">{formatMoney(orderTotal)}</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Fees</span>
                                            <span className="font-semibold">{platformFee !== null ? formatMoney(-Math.abs(platformFee)) : '—'}</span>
                                          </div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Net proceeds</span>
                                            <span className="font-extrabold">{formatMoney(net)}</span>
                                          </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                                          <Info className="h-3.5 w-3.5" />
                                          <span>
                                            Learn how you get paid in{' '}
                                            <Link href="/how-it-works" className="underline underline-offset-2">
                                              How it works
                                            </Link>
                                            .
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>

                              <Collapsible
                                open={viewDetailsOpen}
                                onOpenChange={(open) => setDetailsOpen((prev) => ({ ...prev, [o.id]: open }))}
                              >
                                <CollapsibleTrigger asChild>
                                  <Button variant="outline" size="sm" className="font-semibold">
                                    Order details
                                    <ChevronDown className={viewDetailsOpen ? 'h-4 w-4 ml-2 rotate-180 transition-transform' : 'h-4 w-4 ml-2 transition-transform'} />
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="mt-3 rounded-lg border bg-background p-4">
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                      <div>
                                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order</div>
                                        <div className="mt-1 font-semibold">{title}</div>
                                        <div className="mt-1 text-sm text-muted-foreground">
                                          Item ID: <span className="font-mono">{o.listingId}</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Button asChild size="sm" className="font-semibold">
                                          <Link href={`/seller/orders/${o.id}`}>Open full timeline</Link>
                                        </Button>
                                      </div>
                                    </div>

                                    <Separator className="my-4" />

                                    <div className="grid gap-3 md:grid-cols-4">
                                      <div className="rounded-md border bg-muted/10 p-3">
                                        <div className="text-xs text-muted-foreground">Buyer paid</div>
                                        <div className="font-semibold">{formatDate(o.paidAt || null)}</div>
                                      </div>
                                      <div className="rounded-md border bg-muted/10 p-3">
                                        <div className="text-xs text-muted-foreground">Marked delivered</div>
                                        <div className="font-semibold">{formatDate(o.deliveredAt || null)}</div>
                                      </div>
                                      <div className="rounded-md border bg-muted/10 p-3">
                                        <div className="text-xs text-muted-foreground">Buyer confirmed</div>
                                        <div className="font-semibold">{formatDate(o.buyerConfirmedAt || o.acceptedAt || null)}</div>
                                      </div>
                                      <div className="rounded-md border bg-muted/10 p-3">
                                        <div className="text-xs text-muted-foreground">Dispute</div>
                                        <div className="font-semibold">{o.disputedAt ? formatDate(o.disputedAt) : '—'}</div>
                                      </div>
                                    </div>

                                    {(o.complianceDocsStatus?.missing?.length || 0) > 0 ? (
                                      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                        <div className="font-semibold">Compliance documents required</div>
                                        <div className="mt-1">
                                          Missing: <span className="font-mono">{o.complianceDocsStatus?.missing?.join(', ')}</span>
                                        </div>
                                        <div className="mt-2">
                                          Manage required docs from the order timeline to unblock payout.
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

