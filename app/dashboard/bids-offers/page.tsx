'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Gavel, Handshake, MoreHorizontal, ArrowUpRight, RefreshCw } from 'lucide-react';
import { getMyBids, type MyBidRow } from '@/lib/api/bids';
import { getMyOffers } from '@/lib/offers/api';
import { createCheckoutSession } from '@/lib/stripe/api';
import { PaymentMethodDialog, type PaymentMethodChoice } from '@/components/payments/PaymentMethodDialog';
import { CheckoutStartErrorDialog } from '@/components/payments/CheckoutStartErrorDialog';

type OfferRow = {
  offerId: string;
  listingId: string;
  listingSnapshot?: { title?: string; images?: string[]; type?: string; sellerSnapshot?: { displayName?: string } };
  sellerId?: string;
  status: string;
  currentAmount: number;
  acceptedAmount?: number;
  lastActorRole?: 'buyer' | 'seller' | 'system';
  expiresAt?: number | null;
  updatedAt?: number | null;
};

type UnifiedRow =
  | ({
      type: 'bid';
      id: string;
      status: 'WINNING' | 'OUTBID' | 'WON' | 'LOST';
      timeLeftMs: number | null;
      sortUpdatedAt: number;
    } & MyBidRow)
  | {
      type: 'offer';
      id: string;
      status: 'SENT' | 'COUNTERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
      listingId: string;
      listingTitle: string;
      listingImage?: string;
      listingType?: string;
      sellerName?: string;
      yourAmount: number;
      timeLeftMs: number | null;
      sortUpdatedAt: number;
      raw: OfferRow;
    };

type StatusFilter = 'all' | 'winning' | 'outbid' | 'accepted' | 'expired';
type TypeFilter = 'all' | 'bids' | 'offers';
type SortKey = 'ending_soon' | 'newest' | 'highest_amount';

function formatMoney(n: number) {
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.round(n).toLocaleString()}`;
}

function formatTimeLeftFromMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms <= 0) return 'Ended';
  const mins = Math.floor(ms / (60 * 1000));
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ${hrs % 24}h`;
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

function offerStatusFromRow(o: OfferRow): UnifiedRow['status'] {
  const now = Date.now();
  const expiresAt = typeof o.expiresAt === 'number' ? o.expiresAt : null;
  const isExpiredByTime = expiresAt ? expiresAt <= now : false;
  if (isExpiredByTime) return 'EXPIRED';

  if (o.status === 'accepted') return 'ACCEPTED';
  if (o.status === 'declined') return 'DECLINED';
  if (o.status === 'countered' && o.lastActorRole === 'seller') return 'COUNTERED';
  if (o.status === 'expired') return 'EXPIRED';
  return 'SENT';
}

function badgeVariantForUnifiedStatus(status: UnifiedRow['status']) {
  if (status === 'WINNING' || status === 'ACCEPTED' || status === 'WON') return 'default';
  if (status === 'OUTBID' || status === 'COUNTERED') return 'secondary';
  return 'outline';
}

export default function BidsOffersPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<'all' | 'bids' | 'offers'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('ending_soon');

  const [loading, setLoading] = useState(false);
  const [bids, setBids] = useState<MyBidRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);

  // Checkout flow (for accepted offers)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [pendingOfferCheckout, setPendingOfferCheckout] = useState<{ listingId: string; offerId: string; amountUsd: number } | null>(null);
  const [checkoutErrorOpen, setCheckoutErrorOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<{ attemptedMethod: PaymentMethodChoice; message: string; technical?: string } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [bidsRes, offersRes] = await Promise.all([
        getMyBids({ limit: 100 }),
        getMyOffers({ limit: 100 }),
      ]);
      if (bidsRes.ok) setBids(bidsRes.bids);
      else setBids([]);
      setOffers((offersRes?.offers || []) as OfferRow[]);
    } catch (e: any) {
      toast({ title: 'Failed to load', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    load();
  }, [authLoading, load, user]);

  const rows: UnifiedRow[] = useMemo(() => {
    const now = Date.now();
    const bidRows: UnifiedRow[] = bids.map((b) => {
      const endsAtMs = typeof b.endsAt === 'number' ? b.endsAt : null;
      const timeLeftMs = endsAtMs ? endsAtMs - now : null;
      return {
        ...(b as any),
        type: 'bid',
        id: `${b.listingId}:bid`,
        status: b.status,
        timeLeftMs,
        sortUpdatedAt: b.myLastBidAt || 0,
      };
    });

    const offerRows: UnifiedRow[] = offers.map((o) => {
      const status = offerStatusFromRow(o) as any;
      const expiresAtMs = typeof o.expiresAt === 'number' ? o.expiresAt : null;
      const timeLeftMs = expiresAtMs ? expiresAtMs - now : null;
      const title = o.listingSnapshot?.title || 'Unknown listing';
      const image = Array.isArray(o.listingSnapshot?.images) ? o.listingSnapshot!.images![0] : undefined;
      const sellerName = o.listingSnapshot?.sellerSnapshot?.displayName;
      const yourAmount = Number(o.acceptedAmount ?? o.currentAmount ?? 0);
      const listingType = o.listingSnapshot?.type;
      const updatedAt = typeof o.updatedAt === 'number' ? o.updatedAt : 0;
      return {
        type: 'offer',
        id: o.offerId,
        status,
        listingId: o.listingId,
        listingTitle: title,
        listingImage: image,
        listingType,
        sellerName,
        yourAmount,
        timeLeftMs,
        sortUpdatedAt: updatedAt,
        raw: o,
      };
    });

    return [...bidRows, ...offerRows];
  }, [bids, offers]);

  const filtered = useMemo(() => {
    let list = rows.slice();

    // Top tabs (quick type switch)
    if (tab === 'bids') list = list.filter((r) => r.type === 'bid');
    if (tab === 'offers') list = list.filter((r) => r.type === 'offer');

    // Type filter
    if (typeFilter === 'bids') list = list.filter((r) => r.type === 'bid');
    if (typeFilter === 'offers') list = list.filter((r) => r.type === 'offer');

    // Status filter (eBay-like)
    if (statusFilter !== 'all') {
      list = list.filter((r) => {
        if (statusFilter === 'winning') return r.status === 'WINNING';
        if (statusFilter === 'outbid') return r.status === 'OUTBID';
        if (statusFilter === 'accepted') return r.status === 'ACCEPTED' || r.status === 'WON';
        if (statusFilter === 'expired') return r.status === 'EXPIRED' || r.status === 'LOST' || r.status === 'DECLINED';
        return true;
      });
    }

    // Sort
    if (sortKey === 'ending_soon') {
      list.sort((a, b) => {
        const aLeft = a.timeLeftMs === null ? Number.POSITIVE_INFINITY : a.timeLeftMs;
        const bLeft = b.timeLeftMs === null ? Number.POSITIVE_INFINITY : b.timeLeftMs;
        return aLeft - bLeft;
      });
    } else if (sortKey === 'highest_amount') {
      list.sort((a, b) => {
        const aAmt =
          a.type === 'bid' ? (a as any).myMaxBid : (a as any).yourAmount;
        const bAmt =
          b.type === 'bid' ? (b as any).myMaxBid : (b as any).yourAmount;
        return (bAmt || 0) - (aAmt || 0);
      });
    } else {
      list.sort((a, b) => (b.sortUpdatedAt || 0) - (a.sortUpdatedAt || 0));
    }

    return list;
  }, [rows, sortKey, statusFilter, tab, typeFilter]);

  const openOfferCheckout = (o: OfferRow) => {
    const amount = Number(o.acceptedAmount ?? o.currentAmount ?? 0);
    setPendingOfferCheckout({ listingId: o.listingId, offerId: o.offerId, amountUsd: Number.isFinite(amount) ? amount : 0 });
    setPaymentDialogOpen(true);
  };

  const handleSelectPaymentMethod = async (method: PaymentMethodChoice) => {
    if (!pendingOfferCheckout) return;
    try {
      setPaymentDialogOpen(false);
      const { url } = await createCheckoutSession(pendingOfferCheckout.listingId, pendingOfferCheckout.offerId, method);
      window.location.href = url;
    } catch (e: any) {
      setCheckoutError({
        attemptedMethod: method,
        message: 'We couldn’t start checkout. You can retry card or switch to bank transfer / wire.',
        technical: e?.message ? String(e.message) : String(e),
      });
      setCheckoutErrorOpen(true);
    } finally {
      setPendingOfferCheckout(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">You must be signed in to manage bids and offers.</p>
            <Button asChild className="w-full">
              <Link href="/login">Go to login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-primary" />
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Bids & Offers</h1>
            </div>
            <p className="text-sm text-muted-foreground">Track auctions you’re bidding on and offers you’ve sent—like eBay, but built for Wildlife.Exchange.</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="min-h-[40px]">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>

        <Card className="border-2">
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
              <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
                <TabsList className="grid grid-cols-3 w-full sm:w-auto">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="bids">Bids</TabsTrigger>
                  <TabsTrigger value="offers">Offers</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="min-w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Status: All</SelectItem>
                    <SelectItem value="winning">Winning</SelectItem>
                    <SelectItem value="outbid">Outbid</SelectItem>
                    <SelectItem value="accepted">Accepted / Won</SelectItem>
                    <SelectItem value="expired">Expired / Lost</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                  <SelectTrigger className="min-w-[180px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Type: All</SelectItem>
                    <SelectItem value="bids">Bids</SelectItem>
                    <SelectItem value="offers">Offers</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className="min-w-[180px]">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ending_soon">Sort: Ending Soon</SelectItem>
                    <SelectItem value="newest">Sort: Newest</SelectItem>
                    <SelectItem value="highest_amount">Sort: Highest Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loading ? (
              <div className="py-10 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Nothing to show for the selected filters.
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => (
                  <div key={r.id} className="rounded-xl border bg-card p-4 hover:bg-muted/20 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                          {r.type === 'bid' ? (
                            (r as any).listingImage ? (
                              <Image src={(r as any).listingImage} alt="" fill className="object-cover" />
                            ) : null
                          ) : (
                            (r as any).listingImage ? (
                              <Image src={(r as any).listingImage} alt="" fill className="object-cover" />
                            ) : null
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {r.type === 'bid' ? (
                              <Badge variant="outline" className="text-xs">
                                Auction
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Offer
                              </Badge>
                            )}
                            <Badge variant={badgeVariantForUnifiedStatus(r.status) as any} className="text-xs">
                              {r.status}
                            </Badge>
                            {r.timeLeftMs !== null ? (
                              <Badge variant="secondary" className="text-xs">
                                {formatTimeLeftFromMs(r.timeLeftMs)}
                              </Badge>
                            ) : null}
                          </div>

                          <div className="font-semibold leading-snug truncate mt-1">
                            {r.type === 'bid' ? (r as any).listingTitle : (r as any).listingTitle}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Seller: {r.type === 'bid' ? ((r as any).sellerName || '—') : ((r as any).sellerName || '—')}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full md:w-auto">
                        {r.type === 'bid' ? (
                          <>
                            <div>
                              <div className="text-xs text-muted-foreground">Your max bid</div>
                              <div className="font-semibold">{formatMoney((r as any).myMaxBid)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Current highest</div>
                              <div className="font-semibold">{formatMoney((r as any).currentHighestBid)}</div>
                            </div>
                            <div className="hidden sm:block">
                              <div className="text-xs text-muted-foreground">Bids</div>
                              <div className="font-semibold">{(r as any).myBidCount}</div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <div className="text-xs text-muted-foreground">Your offer</div>
                              <div className="font-semibold">{formatMoney((r as any).yourAmount)}</div>
                            </div>
                            <div className="hidden sm:block">
                              <div className="text-xs text-muted-foreground">Status</div>
                              <div className="font-semibold">{r.status}</div>
                            </div>
                            <div className="hidden sm:block">
                              <div className="text-xs text-muted-foreground">Time left</div>
                              <div className="font-semibold">{formatTimeLeftFromMs(r.timeLeftMs)}</div>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        {r.type === 'offer' && r.status === 'ACCEPTED' ? (
                          <Button
                            onClick={() => openOfferCheckout((r as any).raw)}
                            className="min-h-[40px]"
                          >
                            Checkout
                          </Button>
                        ) : null}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="h-10 w-10">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link href={`/listing/${r.type === 'bid' ? (r as any).listingId : (r as any).listingId}`}>
                                <ArrowUpRight className="h-4 w-4 mr-2" />
                                View listing
                              </Link>
                            </DropdownMenuItem>
                            {r.type === 'bid' ? (
                              <DropdownMenuItem asChild>
                                <Link href={`/listing/${(r as any).listingId}`}>
                                  <Gavel className="h-4 w-4 mr-2" />
                                  Increase bid
                                </Link>
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem asChild>
                                <Link href={`/listing/${(r as any).listingId}`}>
                                  <Handshake className="h-4 w-4 mr-2" />
                                  View offer thread
                                </Link>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <PaymentMethodDialog
          open={paymentDialogOpen}
          onOpenChange={(open) => {
            setPaymentDialogOpen(open);
            if (!open) setPendingOfferCheckout(null);
          }}
          amountUsd={pendingOfferCheckout?.amountUsd || 0}
          onSelect={handleSelectPaymentMethod}
        />

        <CheckoutStartErrorDialog
          open={checkoutErrorOpen}
          onOpenChange={(open) => {
            setCheckoutErrorOpen(open);
            if (!open) setCheckoutError(null);
          }}
          attemptedMethod={checkoutError?.attemptedMethod || 'card'}
          errorMessage={checkoutError?.message || 'Checkout could not be started.'}
          technicalDetails={checkoutError?.technical}
          onRetryCard={() => handleSelectPaymentMethod('card')}
          onSwitchBank={() => handleSelectPaymentMethod('bank_transfer')}
          onSwitchWire={() => handleSelectPaymentMethod('wire')}
        />
      </div>
    </div>
  );
}

