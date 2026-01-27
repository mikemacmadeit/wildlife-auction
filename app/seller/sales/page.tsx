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
import { getOrdersForUser, filterSellerRelevantOrders } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { getDocument } from '@/lib/firebase/firestore';
import { useDebounce } from '@/hooks/use-debounce';
import { subscribeToUnreadCountByTypes, markNotificationsAsReadByTypes } from '@/lib/firebase/notifications';
import type { NotificationType, TransactionStatus } from '@/lib/types';
import { usePathname } from 'next/navigation';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { getNextRequiredAction, getUXBadge } from '@/lib/orders/progress';

interface OrderWithListing extends Order {
  listing?: Listing | null;
  fulfillmentSlaDeadlineAt?: Date;
  fulfillmentSlaStartedAt?: Date;
}

type TabKey = 'needs_action' | 'in_progress' | 'completed' | 'cancelled' | 'all';

// DEPRECATED: Use getUXBadge() from lib/orders/progress.ts instead
// Keeping for backward compatibility during migration
function statusBadgeFromTransactionStatus(txStatus: TransactionStatus) {
  // Use new shared model
  const mockOrder = { transactionStatus: txStatus } as Order;
  return getUXBadge(mockOrder, 'seller');
}

// Legacy function for backward compatibility (derives from order.status if transactionStatus missing)
function statusBadge(status: string) {
  // This is a fallback - prefer using statusBadgeFromTransactionStatus
  switch (status) {
    case 'paid_held':
    case 'paid':
      return { variant: 'default' as const, label: 'Paid' };
    case 'in_transit':
      return { variant: 'secondary' as const, label: 'In transit' };
    case 'delivered':
      return { variant: 'secondary' as const, label: 'Delivered' };
    case 'ready_to_release':
      return { variant: 'default' as const, label: 'Fulfillment complete' };
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
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});
  const [unreadSalesCount, setUnreadSalesCount] = useState(0);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const sellerOrdersRaw = await getOrdersForUser(user.uid, 'seller');
      const sellerOrders = filterSellerRelevantOrders(sellerOrdersRaw);
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

  // Shared with tab logic and counts: "Needs action" = seller has the next required action (matches admin reminders)
  const isSellerNeedsAction = useCallback((order: Order) => {
    const a = getNextRequiredAction(order, 'seller');
    return !!(a && a.ownerRole === 'seller');
  }, []);

  const tabCounts = useMemo(() => {
    const tx = (o: Order) => getEffectiveTransactionStatus(o);
    return {
      needs_action: orders.filter((o) => isSellerNeedsAction(o)).length,
      in_progress: orders.filter((o) => {
        if (isSellerNeedsAction(o)) return false;
        const s = tx(o);
        return ['PENDING_PAYMENT', 'FULFILLMENT_REQUIRED', 'DELIVERY_PROPOSED', 'READY_FOR_PICKUP', 'PICKUP_PROPOSED', 'PICKUP_SCHEDULED', 'DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 'DELIVERED_PENDING_CONFIRMATION', 'AWAITING_TRANSFER_COMPLIANCE'].includes(s);
      }).length,
      completed: orders.filter((o) => tx(o) === 'COMPLETED').length,
      cancelled: orders.filter((o) => ['REFUNDED', 'CANCELLED'].includes(tx(o))).length,
      all: orders.length,
    };
  }, [orders, isSellerNeedsAction]);

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    const base = !q
      ? orders
      : orders.filter((o) => {
          return (
            o.id.toLowerCase().includes(q) ||
            o.listingId?.toLowerCase().includes(q) ||
            (o.listing?.title || o.listingSnapshot?.title || '').toString().toLowerCase().includes(q) ||
            String(o.status || '').toLowerCase().includes(q) ||
            String(getEffectiveTransactionStatus(o)).toLowerCase().includes(q)
          );
        });

    const tx = (o: Order) => getEffectiveTransactionStatus(o);
    switch (tab) {
      case 'needs_action':
        return base.filter((o) => isSellerNeedsAction(o));
      case 'in_progress':
        return base.filter((o) => {
          if (isSellerNeedsAction(o)) return false;
          const s = tx(o);
          return ['PENDING_PAYMENT', 'FULFILLMENT_REQUIRED', 'DELIVERY_PROPOSED', 'READY_FOR_PICKUP', 'PICKUP_PROPOSED', 'PICKUP_SCHEDULED', 'DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 'DELIVERED_PENDING_CONFIRMATION', 'AWAITING_TRANSFER_COMPLIANCE'].includes(s);
        });
      case 'completed':
        return base.filter((o) => tx(o) === 'COMPLETED');
      case 'cancelled':
        return base.filter((o) => ['REFUNDED', 'CANCELLED'].includes(tx(o)));
      case 'all':
      default:
        return base;
    }
  }, [debounced, orders, tab, isSellerNeedsAction]);

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
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl space-y-6 min-w-0 overflow-x-hidden">
        <Card className="border-border/60 bg-gradient-to-br from-card via-card to-muted/25 overflow-hidden">
          <CardHeader className="pb-4 px-4 pt-4 sm:px-6 sm:pt-6">
            <CardTitle className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight">Sold</CardTitle>
            <CardDescription>Track payment → delivery → completion for every order.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative w-full min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search orders…" className="pl-9 min-h-11 w-full" aria-label="Search orders" />
              </div>
              <Button variant="outline" onClick={() => load()} disabled={loading} className="w-full sm:w-auto min-h-11 shrink-0">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {tab === 'needs_action' && tabCounts.needs_action > 0 ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
            <Clock className="h-5 w-5 text-primary shrink-0" aria-hidden />
            <p className="text-sm font-medium text-foreground min-w-0 break-words">
              {tabCounts.needs_action} order{tabCounts.needs_action !== 1 ? 's' : ''} need your action. Complete the step on each card to keep things moving — admins can send reminders to buyers if they’re holding things up.
            </p>
          </div>
        ) : null}

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full min-w-0">
          <TabsList className="flex-wrap h-auto gap-1 p-1.5 w-full min-w-0">
            <TabsTrigger value="needs_action" className="min-h-11 px-3 py-2.5 text-xs sm:text-sm shrink-0">
              <Clock className="h-4 w-4 mr-1.5 shrink-0" aria-hidden />
              <span className="truncate">Needs action</span>
              {tabCounts.needs_action > 0 && (
                <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                  {tabCounts.needs_action}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="in_progress" className="min-h-11 px-3 py-2.5 text-xs sm:text-sm shrink-0">
              <Truck className="h-4 w-4 mr-1.5 shrink-0" aria-hidden />
              <span className="truncate">In progress</span>
              {tabCounts.in_progress > 0 && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {tabCounts.in_progress}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed" className="min-h-11 px-3 py-2.5 text-xs sm:text-sm shrink-0">
              <CheckCircle2 className="h-4 w-4 mr-1.5 shrink-0" aria-hidden />
              <span className="truncate">Completed</span>
              {tabCounts.completed > 0 && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {tabCounts.completed}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="min-h-11 px-3 py-2.5 text-xs sm:text-sm shrink-0">
              <span className="truncate">Cancelled</span>
              {tabCounts.cancelled > 0 && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {tabCounts.cancelled}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="all" className="min-h-11 px-3 py-2.5 text-xs sm:text-sm shrink-0">All</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className={`mt-4 transition-opacity duration-150 ${tabFading ? 'opacity-70' : 'opacity-100'}`}>
          {filtered.length === 0 ? (
            <Card className="border-border/60">
              <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
                {tab === 'needs_action' ? (
                  <>
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-primary/70" />
                    <p className="font-semibold text-foreground">All caught up</p>
                    <p className="mt-1">No orders need your action right now.</p>
                    <p className="mt-2 text-xs">Check <button type="button" onClick={() => setTab('in_progress')} className="text-primary underline underline-offset-2 font-medium">In progress</button> for orders waiting on the buyer, or <button type="button" onClick={() => setTab('all')} className="text-primary underline underline-offset-2 font-medium">All</button> to see everything.</p>
                  </>
                ) : tab === 'in_progress' ? (
                  <>
                    <Truck className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="font-semibold text-foreground">No orders in progress</p>
                    <p className="mt-1">Orders awaiting your action appear under <button type="button" onClick={() => setTab('needs_action')} className="text-primary underline underline-offset-2 font-medium">Needs action</button>.</p>
                  </>
                ) : (
                  <>
                    <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    No sales found.
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 min-w-0">
              {filtered.map((o) => {
                const txStatus = getEffectiveTransactionStatus(o);
                const badge = statusBadgeFromTransactionStatus(txStatus);
                const transportOption = o.transportOption || 'SELLER_TRANSPORT';
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
                const viewDetailsOpen = detailsOpen[o.id] === true;

                // Use shared progress model for next action
                const nextActionData = getNextRequiredAction(o, 'seller');
                const nextActionHrefBase = nextActionData.ctaAction.startsWith('/') ? nextActionData.ctaAction : `/seller/orders/${o.id}`;
                const nextAction = nextActionData ? {
                  label: nextActionData.ctaLabel,
                  href: nextActionHrefBase.includes('/seller/orders/') ? (nextActionHrefBase.includes('?') ? `${nextActionHrefBase}&from=sales` : `${nextActionHrefBase}?from=sales`) : nextActionHrefBase,
                  variant: nextActionData.severity === 'danger' ? 'destructive' as const : nextActionData.severity === 'warning' ? 'default' as const : 'secondary' as const,
                } : null;

                const sellerHasAction = nextActionData && nextActionData.ownerRole === 'seller';

                return (
                  <Card key={o.id} className={`border-border/60 overflow-hidden min-w-0 ${sellerHasAction ? 'ring-1 ring-primary/30' : ''}`}>
                    <CardContent className="p-0 overflow-hidden">
                      {sellerHasAction && (
                        <div className="bg-primary/10 border-b border-primary/20 px-4 py-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-primary shrink-0" />
                                <span className="font-semibold text-sm text-primary">Action needed</span>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {nextActionData.title} — {nextActionData.description}
                              </p>
                              {nextActionData.dueAt && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Due {formatDate(nextActionData.dueAt)}
                                </p>
                              )}
                            </div>
                            {!nextActionData.blockedReason && nextAction && (
                              <Button size="default" variant="default" className="w-full sm:w-auto min-h-11 shrink-0 font-semibold shadow-warm ring-2 ring-primary/25" asChild>
                                <Link href={nextAction.href} className="min-h-11">
                                  {nextAction.label}
                                  <ArrowRight className="h-4 w-4 ml-2 shrink-0" aria-hidden />
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row gap-4 p-4 min-w-0">
                        <div className="relative h-24 w-24 shrink-0 rounded-lg overflow-hidden bg-muted border self-start">
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

                        <div className="min-w-0 flex-1 flex flex-col gap-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 min-w-0">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={badge.variant} className="shrink-0">{badge.label}</Badge>
                                {/* SLA countdown chip */}
                                {o.fulfillmentSlaDeadlineAt && (() => {
                                  const now = Date.now();
                                  const deadline = o.fulfillmentSlaDeadlineAt.getTime();
                                  const hoursRemaining = Math.floor((deadline - now) / (1000 * 60 * 60));
                                  if (hoursRemaining < 0) {
                                    return <Badge variant="destructive" className="text-xs">SLA Overdue</Badge>;
                                  }
                                  if (hoursRemaining < 24) {
                                    return <Badge variant="destructive" className="text-xs">{hoursRemaining}h remaining</Badge>;
                                  }
                                  return <Badge variant="outline" className="text-xs">{hoursRemaining}h remaining</Badge>;
                                })()}
                                {transportOption === 'BUYER_TRANSPORT' ? (
                                  <Badge variant="outline" className="font-semibold text-xs">
                                    Buyer Transport
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="font-semibold text-xs">
                                    Seller Transport
                                  </Badge>
                                )}
                                {txStatus === 'SELLER_NONCOMPLIANT' ? (
                                  <Badge variant="destructive" className="font-semibold">
                                    Non-compliant
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-2 font-semibold text-foreground leading-snug line-clamp-2">{title}</div>
                              <div className="mt-1 text-xs text-muted-foreground space-y-0.5 min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="font-mono truncate max-w-[120px] sm:max-w-none" title={o.listingId}>Item ID: {o.listingId}</span>
                                  <span className="text-muted-foreground/70 shrink-0">•</span>
                                  <span className="font-mono truncate max-w-[100px] sm:max-w-none" title={o.id}>Order: {o.id}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span>Sold: {formatShortDate(soldAt)}</span>
                                  <span className="text-muted-foreground/70 shrink-0">•</span>
                                  <span>Buyer paid: {formatShortDate(buyerPaidAt)}</span>
                                  <span className="text-muted-foreground/70 shrink-0">•</span>
                                  <span className="truncate min-w-0" title={buyerLabel}>Buyer: {buyerLabel}</span>
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 flex flex-col sm:items-end gap-2 w-full sm:w-auto">
                              <div className="text-left sm:text-right">
                                <div className="text-sm text-muted-foreground">Net proceeds</div>
                                <div className="text-lg font-extrabold tracking-tight">{formatMoney(net)}</div>
                              </div>
                              <Button asChild size="default" variant="outline" className="font-semibold shadow-warm w-full sm:w-auto min-h-11">
                                <Link href={`/seller/orders/${o.id}?from=sales`} className="inline-flex items-center justify-center min-h-11">
                                  View details
                                  <ArrowRight className="h-4 w-4 ml-2 shrink-0" aria-hidden />
                                </Link>
                              </Button>
                            </div>
                          </div>

                          <div className="mt-3 w-full min-w-0">
                            <Collapsible
                              open={viewDetailsOpen}
                              onOpenChange={(open) => setDetailsOpen((prev) => ({ ...prev, [o.id]: open }))}
                              className="w-full min-w-0"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
                                <div className="text-sm text-muted-foreground min-w-0 break-words">
                                  <span className="font-semibold text-foreground">{formatMoney(orderTotal)}</span> order total
                                  {platformFee !== null ? (
                                    <>
                                      {' '}
                                      <span className="text-muted-foreground/70">•</span> Fees: <span className="font-semibold text-foreground">{formatMoney(platformFee)}</span>
                                    </>
                                  ) : null}
                                </div>
                                <CollapsibleTrigger asChild>
                                  <Button variant="outline" size="sm" className="font-semibold w-full sm:w-auto min-h-11 justify-between sm:justify-start">
                                    <span className="inline-flex items-center gap-2">
                                      <Receipt className="h-4 w-4 shrink-0" aria-hidden />
                                      Payment & order details
                                    </span>
                                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${viewDetailsOpen ? 'rotate-180' : ''}`} aria-hidden />
                                  </Button>
                                </CollapsibleTrigger>
                              </div>
                              <CollapsibleContent className="w-full min-w-0">
                                  <div className="mt-3 w-full min-w-0 rounded-xl border bg-muted/10 p-4 sm:p-5 md:p-6 space-y-6 md:space-y-8 overflow-hidden">
                                    {/* Payment section — full width, two-column layout on md+ */}
                                    <div className="space-y-5">
                                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment</div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                        <div>
                                          <div className="text-2xl md:text-3xl font-extrabold tracking-tight">{formatMoney(net)}</div>
                                          <div className="text-sm text-muted-foreground mt-1">Net proceeds</div>
                                        </div>
                                        <div className="text-sm text-muted-foreground md:pt-1">
                                          Seller receives funds immediately upon successful payment via Stripe Connect destination charges. No payout release needed.
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="rounded-lg border bg-background p-4">
                                          <div className="text-xs text-muted-foreground uppercase tracking-wider">Buyer paid</div>
                                          <div className="font-semibold mt-1">{formatDate(o.paidAt || null)}</div>
                                        </div>
                                        <div className="rounded-lg border bg-background p-4">
                                          <div className="text-xs text-muted-foreground uppercase tracking-wider">Payment status</div>
                                          <div className="font-semibold mt-1">Paid immediately</div>
                                        </div>
                                        <div className="rounded-lg border bg-background p-4">
                                          <div className="text-xs text-muted-foreground uppercase tracking-wider">Payment method</div>
                                          <div className="font-semibold mt-1">{(o as any).paymentMethod || 'Card'}</div>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                        <div className="rounded-lg border bg-background p-4 space-y-3">
                                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Transaction info</div>
                                          <dl className="text-sm space-y-2.5">
                                            <div className="flex justify-between gap-4">
                                              <dt className="text-muted-foreground shrink-0">Type</dt>
                                              <dd className="font-semibold text-right truncate">Order</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                              <dt className="text-muted-foreground shrink-0">Order date</dt>
                                              <dd className="font-semibold text-right truncate">{formatDate(o.createdAt || null)}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                              <dt className="text-muted-foreground shrink-0">Buyer</dt>
                                              <dd className="font-semibold text-right truncate min-w-0" title={buyerLabel}>{buyerLabel}</dd>
                                            </div>
                                            <div className="flex justify-between gap-2 min-w-0">
                                              <dt className="text-muted-foreground shrink-0">Payment intent</dt>
                                              <dd className="font-mono text-xs text-right truncate min-w-0 max-w-[50%]" title={o.stripePaymentIntentId || ''}>{o.stripePaymentIntentId || '—'}</dd>
                                            </div>
                                            <div className="flex justify-between gap-2 min-w-0">
                                              <dt className="text-muted-foreground shrink-0">Transfer</dt>
                                              <dd className="font-mono text-xs text-right truncate min-w-0 max-w-[50%]" title={o.stripeTransferId || ''}>{o.stripeTransferId || '—'}</dd>
                                            </div>
                                          </dl>
                                        </div>
                                        <div className="rounded-lg border bg-background p-4 space-y-3">
                                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Transaction breakdown</div>
                                          <dl className="text-sm space-y-2.5">
                                            <div className="flex justify-between gap-4">
                                              <dt className="text-muted-foreground shrink-0">Amount</dt>
                                              <dd className="font-semibold text-right">{formatMoney(orderTotal)}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4">
                                              <dt className="text-muted-foreground shrink-0">Platform fee (10%)</dt>
                                              <dd className="font-semibold text-right">{platformFee !== null ? formatMoney(-Math.abs(platformFee)) : '—'}</dd>
                                            </div>
                                            <div className="flex justify-between gap-4 border-t border-border pt-2.5 mt-2.5">
                                              <dt className="text-muted-foreground shrink-0">Net proceeds</dt>
                                              <dd className="font-extrabold text-right">{formatMoney(net)}</dd>
                                            </div>
                                          </dl>
                                          <div className="text-xs text-muted-foreground flex items-start gap-2 pt-1">
                                            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                            <span>
                                              Learn how you get paid in{' '}
                                              <Link href="/how-it-works" className="underline underline-offset-2">How it works</Link>.
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <Separator className="my-2" />

                                    {/* Order section — full width, spaced layout */}
                                    <div className="space-y-5">
                                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order</div>
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 min-w-0">
                                        <div className="min-w-0 flex-1">
                                          <div className="font-semibold break-words">{title}</div>
                                          <div className="mt-1 text-sm text-muted-foreground truncate" title={o.listingId}>
                                            Item ID: <span className="font-mono">{o.listingId}</span>
                                          </div>
                                        </div>
                                        <Button asChild size="sm" className="font-semibold shrink-0 w-full sm:w-auto min-h-11">
                                          <Link href={`/seller/orders/${o.id}?from=sales`} className="inline-flex items-center justify-center min-h-11">Open full timeline</Link>
                                        </Button>
                                      </div>
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 min-w-0">
                                        <div className="rounded-lg border bg-muted/20 p-4">
                                          <div className="text-xs text-muted-foreground uppercase tracking-wider">Buyer paid</div>
                                          <div className="font-semibold mt-1">{formatDate(o.paidAt || null)}</div>
                                        </div>
                                        <div className="rounded-lg border bg-muted/20 p-4">
                                          <div className="text-xs text-muted-foreground uppercase tracking-wider">Marked delivered</div>
                                          <div className="font-semibold mt-1">{formatDate(o.deliveredAt || null)}</div>
                                        </div>
                                        <div className="rounded-lg border bg-muted/20 p-4">
                                          <div className="text-xs text-muted-foreground uppercase tracking-wider">Buyer confirmed</div>
                                          <div className="font-semibold mt-1">{formatDate(o.buyerConfirmedAt || o.acceptedAt || null)}</div>
                                        </div>
                                        <div className="rounded-lg border bg-muted/20 p-4">
                                          <div className="text-xs text-muted-foreground uppercase tracking-wider">Dispute</div>
                                          <div className="font-semibold mt-1">{o.disputedAt ? formatDate(o.disputedAt) : '—'}</div>
                                        </div>
                                      </div>
                                      {(o.complianceDocsStatus?.missing?.length || 0) > 0 ? (
                                        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-100 min-w-0 break-words">
                                          <div className="font-semibold">Compliance documents required</div>
                                          <div className="mt-1 break-words">
                                            Missing: <span className="font-mono break-all">{o.complianceDocsStatus?.missing?.join(', ')}</span>
                                          </div>
                                          <div className="mt-2 text-amber-800 dark:text-amber-200">
                                            Manage required docs from the order timeline to unblock payout.
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                              </CollapsibleContent>
                            </Collapsible>
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

