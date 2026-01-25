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
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Gavel,
  Handshake,
  MoreHorizontal,
  ArrowUpRight,
  RefreshCw,
  Search,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { getMyBids, placeBidServer, type MyBidRow } from '@/lib/api/bids';
import { getMyOffers } from '@/lib/offers/api';
import { createCheckoutSession, createWireIntent } from '@/lib/stripe/api';
import { PaymentMethodDialog, type PaymentMethodChoice } from '@/components/payments/PaymentMethodDialog';
import { CheckoutStartErrorDialog } from '@/components/payments/CheckoutStartErrorDialog';
import { WireInstructionsDialog } from '@/components/payments/WireInstructionsDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getMinIncrementCents } from '@/lib/auctions/proxyBidding';
import { subscribeToUnreadCountByTypes, markNotificationsAsReadByTypes } from '@/lib/firebase/notifications';
import type { NotificationType } from '@/lib/types';

type OfferRow = {
  offerId: string;
  listingId: string;
  listingSnapshot?: { title?: string; images?: string[]; type?: string; sellerSnapshot?: { displayName?: string } };
  listingImageUrl?: string;
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

function timeLeftTone(ms: number | null): string {
  if (ms === null) return '';
  if (ms <= 0) return 'text-muted-foreground';
  if (ms <= 12 * 60_000) return 'text-destructive font-semibold';
  if (ms <= 60 * 60_000) return 'text-orange-600 font-semibold';
  return '';
}

function suggestNextMaxUsd(params: { currentHighestBid: number; myMaxBid: number }): number {
  const currentCents = Math.max(0, Math.round((Number(params.currentHighestBid || 0) || 0) * 100));
  const myMaxCents = Math.max(0, Math.round((Number(params.myMaxBid || 0) || 0) * 100));
  // We base this off current visible price; server will be authoritative, but this avoids obvious "too low" bids.
  const minNext = currentCents + getMinIncrementCents(currentCents);
  const suggested = Math.max(minNext, myMaxCents + 100);
  return Math.round(suggested) / 100;
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

  const [tab, setTab] = useState<'needs_action' | 'bids' | 'offers' | 'history'>('needs_action');
  const [unreadNeedsAction, setUnreadNeedsAction] = useState(0);
  const [unreadBids, setUnreadBids] = useState(0);
  const [unreadOffers, setUnreadOffers] = useState(0);
  const [unreadHistory, setUnreadHistory] = useState(0);
  const [unreadSellerOfferReceived, setUnreadSellerOfferReceived] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all'); // applies in Bids tab
  const [sortKey, setSortKey] = useState<SortKey>('ending_soon');
  const [query, setQuery] = useState('');

  const [loading, setLoading] = useState(false);
  const [bids, setBids] = useState<MyBidRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);

  // Raise max bid dialog
  const [raiseDialogOpen, setRaiseDialogOpen] = useState(false);
  const [raiseTarget, setRaiseTarget] = useState<null | { listingId: string; listingTitle: string; currentHighestBid: number; myMaxBid: number }>(null);
  const [raiseInput, setRaiseInput] = useState('');
  const [raising, setRaising] = useState(false);

  // Checkout flow (for accepted offers)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [pendingOfferCheckout, setPendingOfferCheckout] = useState<{ listingId: string; offerId: string; amountUsd: number } | null>(null);
  const [checkoutErrorOpen, setCheckoutErrorOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<{ attemptedMethod: PaymentMethodChoice; message: string; technical?: string } | null>(null);
  const [wireDialogOpen, setWireDialogOpen] = useState(false);
  const [wireData, setWireData] = useState<null | {
    orderId: string;
    paymentIntentId: string;
    instructions: { reference: string; financialAddresses: Array<{ type: string; address: any }> };
  }>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [bidsRes, offersRes] = await Promise.allSettled([
        getMyBids({ limit: 100 }),
        getMyOffers({ limit: 100 }),
      ]);

      // Bids: never let offers failure blank out bids
      if (bidsRes.status === 'fulfilled') {
        if (bidsRes.value.ok) setBids(bidsRes.value.bids);
        else {
          setBids([]);
          toast({ title: 'Bids unavailable', description: bidsRes.value.error || 'Failed to load bids', variant: 'destructive' });
        }
      } else {
        setBids([]);
        toast({ title: 'Bids unavailable', description: bidsRes.reason?.message || 'Failed to load bids', variant: 'destructive' });
      }

      // Offers: surface common blocker (email not verified)
      if (offersRes.status === 'fulfilled') {
        setOffers((offersRes.value?.offers || []) as OfferRow[]);
      } else {
        setOffers([]);
        const msg = String(offersRes.reason?.message || 'Failed to load offers');
        toast({
          title: msg.toLowerCase().includes('verify') ? 'Email verification required' : 'Offers unavailable',
          description: msg.toLowerCase().includes('verify')
            ? 'Verify your email to send/receive offers. Go to Settings → Account & Settings → Email verification.'
            : msg,
          variant: 'destructive',
        });
      }
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

  // Unread notification badges for tabs (these should clear when the user clicks into the tab).
  useEffect(() => {
    if (!user?.uid) {
      setUnreadNeedsAction(0);
      setUnreadBids(0);
      setUnreadOffers(0);
      setUnreadHistory(0);
      return;
    }

    const bidTypes: NotificationType[] = ['bid_outbid', 'bid_received'];
    // Buyer-side offers page: buyer mainly receives counter/accepted/declined/expired.
    const offerTypes: NotificationType[] = ['offer_countered', 'offer_accepted', 'offer_declined', 'offer_expired'];
    const needsActionTypes: NotificationType[] = ['bid_outbid', 'offer_countered', 'offer_accepted'];
    const historyTypes: NotificationType[] = ['offer_declined', 'offer_expired'];

    const unsubs: Array<() => void> = [];
    try {
      unsubs.push(subscribeToUnreadCountByTypes(user.uid, needsActionTypes, (c) => setUnreadNeedsAction(c || 0)));
      unsubs.push(subscribeToUnreadCountByTypes(user.uid, bidTypes, (c) => setUnreadBids(c || 0)));
      unsubs.push(subscribeToUnreadCountByTypes(user.uid, offerTypes, (c) => setUnreadOffers(c || 0)));
      unsubs.push(subscribeToUnreadCountByTypes(user.uid, historyTypes, (c) => setUnreadHistory(c || 0)));
    } catch {
      // ignore
    }
    return () => unsubs.forEach((fn) => fn());
  }, [user?.uid]);

  // Seller offers badge (top link): only count *new offers received*.
  useEffect(() => {
    if (!user?.uid) {
      setUnreadSellerOfferReceived(0);
      return;
    }
    const types: NotificationType[] = ['offer_received'];
    try {
      return subscribeToUnreadCountByTypes(user.uid, types, (c) => setUnreadSellerOfferReceived(c || 0));
    } catch {
      setUnreadSellerOfferReceived(0);
      return;
    }
  }, [user?.uid]);

  const clearTabNotifs = useCallback(
    async (nextTab: 'needs_action' | 'bids' | 'offers' | 'history') => {
      if (!user?.uid) return;
      const bidTypes: NotificationType[] = ['bid_outbid', 'bid_received'];
      const offerTypes: NotificationType[] = ['offer_countered', 'offer_accepted', 'offer_declined', 'offer_expired'];
      const needsActionTypes: NotificationType[] = ['bid_outbid', 'offer_countered', 'offer_accepted'];
      const historyTypes: NotificationType[] = ['offer_declined', 'offer_expired'];

      try {
        if (nextTab === 'needs_action') await markNotificationsAsReadByTypes(user.uid, needsActionTypes);
        else if (nextTab === 'bids') await markNotificationsAsReadByTypes(user.uid, bidTypes);
        else if (nextTab === 'offers') await markNotificationsAsReadByTypes(user.uid, offerTypes);
        else await markNotificationsAsReadByTypes(user.uid, historyTypes);
      } catch {
        // best-effort
      }
    },
    [user?.uid]
  );

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
      const image =
        o.listingImageUrl ||
        (Array.isArray(o.listingSnapshot?.images) ? o.listingSnapshot!.images!.find((u) => typeof u === 'string' && u) : undefined);
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

  const stats = useMemo(() => {
    const bidWinning = bids.filter((b) => b.status === 'WINNING').length;
    const bidOutbid = bids.filter((b) => b.status === 'OUTBID').length;
    const bidWon = bids.filter((b) => b.status === 'WON').length;
    const offerAccepted = offers.filter((o) => offerStatusFromRow(o) === 'ACCEPTED').length;
    const offerCountered = offers.filter((o) => offerStatusFromRow(o) === 'COUNTERED').length;
    const offerActive = offers.filter((o) => ['SENT', 'COUNTERED', 'ACCEPTED'].includes(offerStatusFromRow(o))).length;
    return { bidWinning, bidOutbid, bidWon, offerAccepted, offerCountered, offerActive };
  }, [bids, offers]);

  const normalizedQuery = query.trim().toLowerCase();

  const needsAction = useMemo(() => {
    const list = rows.filter((r) => {
      if (r.type === 'bid') return r.status === 'OUTBID';
      return r.status === 'COUNTERED' || r.status === 'ACCEPTED';
    });
    // Prioritize urgent ending soon items first
    return list.sort((a, b) => {
      const aLeft = a.timeLeftMs === null ? Number.POSITIVE_INFINITY : a.timeLeftMs;
      const bLeft = b.timeLeftMs === null ? Number.POSITIVE_INFINITY : b.timeLeftMs;
      return aLeft - bLeft;
    });
  }, [rows]);

  const bidRows = useMemo(() => {
    const now = Date.now();
    let list = rows.filter((r) => r.type === 'bid') as Extract<UnifiedRow, { type: 'bid' }>[];

    if (normalizedQuery) {
      list = list.filter((b) => (b.listingTitle || '').toLowerCase().includes(normalizedQuery));
    }

    // Status filter (bids only)
    if (statusFilter !== 'all') {
      list = list.filter((b) => {
        if (statusFilter === 'winning') return b.status === 'WINNING';
        if (statusFilter === 'outbid') return b.status === 'OUTBID';
        if (statusFilter === 'accepted') return b.status === 'WON';
        if (statusFilter === 'expired') return b.status === 'LOST';
        return true;
      });
    }

    // Sorting
    if (sortKey === 'ending_soon') {
      list.sort((a, b) => {
        const aLeft = a.timeLeftMs === null ? Number.POSITIVE_INFINITY : a.timeLeftMs;
        const bLeft = b.timeLeftMs === null ? Number.POSITIVE_INFINITY : b.timeLeftMs;
        return aLeft - bLeft;
      });
    } else if (sortKey === 'highest_amount') {
      list.sort((a, b) => (b.myMaxBid || 0) - (a.myMaxBid || 0));
    } else {
      list.sort((a, b) => (b.sortUpdatedAt || 0) - (a.sortUpdatedAt || 0));
    }

    // Make sure outbid items float to the top for usability
    list.sort((a, b) => (a.status === 'OUTBID' ? -1 : 0) - (b.status === 'OUTBID' ? -1 : 0));

    // Keep ended auctions at the bottom
    list.sort((a, b) => {
      const aEnded = (a.timeLeftMs ?? 1) <= 0 ? 1 : 0;
      const bEnded = (b.timeLeftMs ?? 1) <= 0 ? 1 : 0;
      return aEnded - bEnded;
    });

    // Update timeLeftMs in case we stayed on the page a while (best-effort)
    return list.map((b) => {
      const endsAt = typeof b.endsAt === 'number' ? b.endsAt : null;
      const timeLeftMs = endsAt ? endsAt - now : null;
      return { ...b, timeLeftMs };
    });
  }, [normalizedQuery, rows, sortKey, statusFilter]);

  const offerRows = useMemo(() => {
    let list = rows.filter((r) => r.type === 'offer') as Extract<UnifiedRow, { type: 'offer' }>[];
    if (normalizedQuery) {
      list = list.filter((o) => (o.listingTitle || '').toLowerCase().includes(normalizedQuery));
    }
    // Most actionable first: accepted, countered, sent, then rest
    const rank = (s: UnifiedRow['status']) => (s === 'ACCEPTED' ? 0 : s === 'COUNTERED' ? 1 : s === 'SENT' ? 2 : 3);
    list.sort((a, b) => rank(a.status) - rank(b.status));
    if (sortKey === 'ending_soon') {
      list.sort((a, b) => {
        const aLeft = a.timeLeftMs === null ? Number.POSITIVE_INFINITY : a.timeLeftMs;
        const bLeft = b.timeLeftMs === null ? Number.POSITIVE_INFINITY : b.timeLeftMs;
        return aLeft - bLeft;
      });
    } else if (sortKey === 'highest_amount') {
      list.sort((a, b) => (b.yourAmount || 0) - (a.yourAmount || 0));
    } else {
      list.sort((a, b) => (b.sortUpdatedAt || 0) - (a.sortUpdatedAt || 0));
    }
    return list;
  }, [normalizedQuery, rows, sortKey]);

  const filtered = useMemo(() => {
    // Legacy list kept for "history" tab grouping only.
    if (tab === 'history') {
      const list = rows.filter((r) => {
        if (r.type === 'bid') return r.status === 'WON' || r.status === 'LOST';
        return r.status === 'EXPIRED' || r.status === 'DECLINED';
      });
      return list.sort((a, b) => (b.sortUpdatedAt || 0) - (a.sortUpdatedAt || 0));
    }
    return [];
  }, [rows, sortKey, statusFilter, tab]);

  const openOfferCheckout = (o: OfferRow) => {
    // Checkout now requires a buyer acknowledgment for animal categories (server-enforced).
    // The listing page contains the required acknowledgment flow and will route into checkout safely.
    window.location.href = `/listing/${o.listingId}`;
  };

  const handleSelectPaymentMethod = async (method: PaymentMethodChoice) => {
    if (!pendingOfferCheckout) return;
    try {
      setPaymentDialogOpen(false);
      if (method === 'wire') {
        const out = await createWireIntent(pendingOfferCheckout.listingId, pendingOfferCheckout.offerId);
        setWireData(out);
        setWireDialogOpen(true);
      } else {
        const { url } = await createCheckoutSession(pendingOfferCheckout.listingId, pendingOfferCheckout.offerId, method);
        window.location.href = url;
      }
    } catch (e: any) {
      setCheckoutError({
        attemptedMethod: method,
        message: 'We couldn’t start checkout. You can retry card or switch to ACH debit / wire.',
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
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-primary" />
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Bids & Offers</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Your command center for auctions + offers. See what needs action, raise max bids, and complete accepted deals.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button asChild variant="secondary" className="min-h-[40px]">
              <Link href="/dashboard/offers">
                <Handshake className="h-4 w-4 mr-2" />
                My offers (sent)
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-[40px]">
              <Link
                href="/seller/offers"
                onClick={() => {
                  if (!user?.uid) return;
                  // Clear the badge as soon as they click into the seller offers inbox.
                  markNotificationsAsReadByTypes(user.uid, ['offer_received']).catch(() => {});
                }}
              >
                <span className="flex items-center gap-2">
                  <Handshake className="h-4 w-4" />
                  <span>Offers received (seller)</span>
                  {unreadSellerOfferReceived > 0 ? (
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                      {unreadSellerOfferReceived}
                    </Badge>
                  ) : null}
                </span>
              </Link>
            </Button>
            <Button variant="outline" onClick={load} disabled={loading} className="min-h-[40px]">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>
        </div>

        {/* Top summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <Card className="border-border/60">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs sm:text-sm text-muted-foreground">Winning</div>
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
              </div>
              <div className="text-xl sm:text-2xl font-extrabold mt-1">{stats.bidWinning}</div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs sm:text-sm text-muted-foreground">Outbid</div>
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-600 flex-shrink-0" />
              </div>
              <div className="text-xl sm:text-2xl font-extrabold mt-1">{stats.bidOutbid}</div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs sm:text-sm text-muted-foreground">Offers active</div>
                <Handshake className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
              </div>
              <div className="text-xl sm:text-2xl font-extrabold mt-1">{stats.offerActive}</div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs sm:text-sm text-muted-foreground">Accepted offers</div>
                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
              </div>
              <div className="text-xl sm:text-2xl font-extrabold mt-1">{stats.offerAccepted}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-2">
          <CardContent className="pt-6 space-y-4">
            <Tabs
              value={tab}
              onValueChange={(v) => {
                const next = v as any;
                setTab(next);
                void clearTabNotifs(next);
              }}
            >
              <div className="flex flex-col xl:flex-row xl:items-center gap-3 justify-between">
                <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full sm:w-auto overflow-hidden rounded-xl border border-border/60 bg-muted/40 p-1">
                  <TabsTrigger
                    value="needs_action"
                    className="h-9 rounded-lg font-semibold data-[state=active]:shadow-none data-[state=active]:border data-[state=active]:border-border/60"
                  >
                    <span className="flex items-center gap-2">
                      Needs action
                      {unreadNeedsAction > 0 ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {unreadNeedsAction}
                        </Badge>
                      ) : null}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="bids"
                    className="h-9 rounded-lg font-semibold data-[state=active]:shadow-none data-[state=active]:border data-[state=active]:border-border/60"
                  >
                    <span className="flex items-center gap-2">
                      Bids
                      {unreadBids > 0 ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {unreadBids}
                        </Badge>
                      ) : null}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="offers"
                    className="h-9 rounded-lg font-semibold data-[state=active]:shadow-none data-[state=active]:border data-[state=active]:border-border/60"
                  >
                    <span className="flex items-center gap-2">
                      Offers
                      {unreadOffers > 0 ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {unreadOffers}
                        </Badge>
                      ) : null}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="h-9 rounded-lg font-semibold data-[state=active]:shadow-none data-[state=active]:border data-[state=active]:border-border/60"
                  >
                    <span className="flex items-center gap-2">
                      History
                      {unreadHistory > 0 ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {unreadHistory}
                        </Badge>
                      ) : null}
                    </span>
                  </TabsTrigger>
                </TabsList>

                <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto">
                  <div className="relative w-full sm:w-[320px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by title…"
                      className="pl-9"
                    />
                  </div>
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
                  {tab === 'bids' ? (
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                      <SelectTrigger className="min-w-[180px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Status: All</SelectItem>
                        <SelectItem value="winning">Winning</SelectItem>
                        <SelectItem value="outbid">Outbid</SelectItem>
                        <SelectItem value="accepted">Won</SelectItem>
                        <SelectItem value="expired">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              </div>

              {loading ? (
                <div className="py-10 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <TabsContent value="needs_action" className="mt-0">
                  {needsAction.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">You’re all caught up.</div>
                  ) : (
                    <div className="space-y-3">
                      {needsAction.map((r) => (
                        <div key={r.id} className="rounded-xl border bg-card p-4 hover:bg-muted/20 transition-colors">
                          <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                                {(r as any).listingImage ? <Image src={(r as any).listingImage} alt="" fill className="object-cover" /> : null}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs">
                                    {r.type === 'bid' ? 'Auction' : 'Offer'}
                                  </Badge>
                                  <Badge variant={badgeVariantForUnifiedStatus(r.status) as any} className="text-xs">
                                    {r.status}
                                  </Badge>
                                  {r.timeLeftMs !== null ? (
                                    <Badge variant="secondary" className={cn('text-xs', timeLeftTone(r.timeLeftMs))}>
                                      {formatTimeLeftFromMs(r.timeLeftMs)}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="font-semibold leading-snug truncate mt-1">{(r as any).listingTitle}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">Seller: {(r as any).sellerName || '—'}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 justify-end flex-wrap">
                              {r.type === 'bid' ? (
                                <>
                                  <Button
                                    onClick={() => {
                                      const b = r as any;
                                      setRaiseTarget({
                                        listingId: b.listingId,
                                        listingTitle: b.listingTitle,
                                        currentHighestBid: Number(b.currentHighestBid || 0) || 0,
                                        myMaxBid: Number(b.myMaxBid || 0) || 0,
                                      });
                                      setRaiseInput(
                                        String(
                                          suggestNextMaxUsd({
                                            currentHighestBid: Number(b.currentHighestBid || 0) || 0,
                                            myMaxBid: Number(b.myMaxBid || 0) || 0,
                                          })
                                        )
                                      );
                                      setRaiseDialogOpen(true);
                                    }}
                                  >
                                    Raise max
                                  </Button>
                                  <Button variant="outline" asChild>
                                    <Link href={`/listing/${(r as any).listingId}`}>View</Link>
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {r.status === 'ACCEPTED' ? (
                                    <Button
                                      onClick={() => openOfferCheckout((r as any).raw)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      Checkout
                                    </Button>
                                  ) : (
                                    <Button
                                      asChild
                                      className={
                                        r.status === 'COUNTERED'
                                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                          : 'border-primary/40 text-primary hover:bg-primary/10'
                                      }
                                      variant={r.status === 'COUNTERED' ? 'default' : 'outline'}
                                    >
                                      <Link href={`/dashboard/offers/${(r as any).id}`}>
                                        {r.status === 'COUNTERED' ? 'Review counter' : 'View offer'}
                                      </Link>
                                    </Button>
                                  )}
                                  <Button variant="outline" asChild>
                                    <Link href={`/listing/${(r as any).listingId}`}>View listing</Link>
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </TabsContent>

                  <TabsContent value="bids" className="mt-0">
                  {bidRows.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">No bids match your filters.</div>
                  ) : (
                    <div className="space-y-3">
                      {bidRows.map((r) => (
                        <div key={r.id} className="rounded-xl border bg-card p-4 hover:bg-muted/20 transition-colors">
                          <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                                {(r as any).listingImage ? <Image src={(r as any).listingImage} alt="" fill className="object-cover" /> : null}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs">
                                    Auction
                                  </Badge>
                                  <Badge variant={badgeVariantForUnifiedStatus(r.status) as any} className="text-xs">
                                    {r.status}
                                  </Badge>
                                  {r.timeLeftMs !== null ? (
                                    <span className={cn('text-xs', timeLeftTone(r.timeLeftMs))}>
                                      Time left {formatTimeLeftFromMs(r.timeLeftMs)}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="font-semibold leading-snug truncate mt-1">{r.listingTitle}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">Seller: {r.sellerName || '—'}</div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
                              <div>
                                <div className="text-xs text-muted-foreground">Current</div>
                                <div className="font-semibold">{formatMoney(r.currentHighestBid)}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Your max</div>
                                <div className="font-semibold">{formatMoney(r.myMaxBid)}</div>
                              </div>
                              <div className="hidden sm:block">
                                <div className="text-xs text-muted-foreground">Your bids</div>
                                <div className="font-semibold">{r.myBidCount}</div>
                              </div>
                              <div className="hidden sm:block">
                                <div className="text-xs text-muted-foreground">Ends</div>
                                <div className="font-semibold">{r.endsAt ? new Date(r.endsAt).toLocaleString() : '—'}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 justify-end">
                              {r.status === 'OUTBID' ? (
                                <Button
                                  onClick={() => {
                                    setRaiseTarget({
                                      listingId: r.listingId,
                                      listingTitle: r.listingTitle,
                                      currentHighestBid: Number(r.currentHighestBid || 0) || 0,
                                      myMaxBid: Number(r.myMaxBid || 0) || 0,
                                    });
                                    setRaiseInput(
                                      String(
                                        suggestNextMaxUsd({
                                          currentHighestBid: Number(r.currentHighestBid || 0) || 0,
                                          myMaxBid: Number(r.myMaxBid || 0) || 0,
                                        })
                                      )
                                    );
                                    setRaiseDialogOpen(true);
                                  }}
                                >
                                  Raise max
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setRaiseTarget({
                                      listingId: r.listingId,
                                      listingTitle: r.listingTitle,
                                      currentHighestBid: Number(r.currentHighestBid || 0) || 0,
                                      myMaxBid: Number(r.myMaxBid || 0) || 0,
                                    });
                                    setRaiseInput(
                                      String(
                                        suggestNextMaxUsd({
                                          currentHighestBid: Number(r.currentHighestBid || 0) || 0,
                                          myMaxBid: Number(r.myMaxBid || 0) || 0,
                                        })
                                      )
                                    );
                                    setRaiseDialogOpen(true);
                                  }}
                                >
                                  Increase max
                                </Button>
                              )}

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-10 w-10">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem asChild>
                                    <Link href={`/listing/${r.listingId}`}>
                                      <ArrowUpRight className="h-4 w-4 mr-2" />
                                      View listing
                                    </Link>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </TabsContent>

                  <TabsContent value="offers" className="mt-0">
                  {offerRows.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">No offers match your search.</div>
                  ) : (
                    <div className="space-y-3">
                      {offerRows.map((r) => (
                        <div key={r.id} className="rounded-xl border bg-card p-4 hover:bg-muted/20 transition-colors">
                          <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                                {r.listingImage ? <Image src={r.listingImage} alt="" fill className="object-cover" /> : null}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs">
                                    Offer
                                  </Badge>
                                  <Badge variant={badgeVariantForUnifiedStatus(r.status) as any} className="text-xs">
                                    {r.status}
                                  </Badge>
                                  {r.timeLeftMs !== null ? (
                                    <span className={cn('text-xs', timeLeftTone(r.timeLeftMs))}>
                                      Expires in {formatTimeLeftFromMs(r.timeLeftMs)}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="font-semibold leading-snug truncate mt-1">{r.listingTitle}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">Seller: {r.sellerName || '—'}</div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto">
                              <div>
                                <div className="text-xs text-muted-foreground">Your amount</div>
                                <div className="font-semibold">{formatMoney(r.yourAmount)}</div>
                              </div>
                              <div className="hidden sm:block">
                                <div className="text-xs text-muted-foreground">Offer</div>
                                <div className="font-semibold font-mono">{r.id}</div>
                              </div>
                              <div className="hidden sm:block">
                                <div className="text-xs text-muted-foreground">Listing</div>
                                <div className="font-semibold capitalize">{r.listingType || '—'}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 justify-end">
                              {r.status === 'ACCEPTED' ? (
                                <Button
                                  onClick={() => openOfferCheckout(r.raw)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  Checkout
                                </Button>
                              ) : (
                                <Button
                                  asChild
                                  className={
                                    r.status === 'COUNTERED'
                                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                      : 'border-primary/40 text-primary hover:bg-primary/10'
                                  }
                                  variant={r.status === 'COUNTERED' ? 'default' : 'outline'}
                                >
                                  <Link href={`/dashboard/offers/${r.id}`}>{r.status === 'COUNTERED' ? 'Review counter' : 'View offer'}</Link>
                                </Button>
                              )}

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-10 w-10">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem asChild>
                                    <Link href={`/listing/${r.listingId}`}>
                                      <ArrowUpRight className="h-4 w-4 mr-2" />
                                      View listing
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/offers/${r.id}`}>
                                      <Handshake className="h-4 w-4 mr-2" />
                                      Offer details
                                    </Link>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </TabsContent>

                  <TabsContent value="history" className="mt-0">
                  {filtered.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">No history yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {filtered.map((r) => (
                        <div key={r.id} className="rounded-xl border bg-card p-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{(r as any).listingTitle}</div>
                              <div className="text-xs text-muted-foreground mt-0.5">{r.type === 'bid' ? 'Auction' : 'Offer'} · {r.status}</div>
                            </div>
                            <Button variant="outline" asChild>
                              <Link href={`/listing/${(r as any).listingId}`}>View listing</Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </TabsContent>
                </>
              )}
            </Tabs>
          </CardContent>
        </Card>

        {/* Raise max bid dialog */}
        <Dialog
          open={raiseDialogOpen}
          onOpenChange={(open) => {
            setRaiseDialogOpen(open);
            if (!open) {
              setRaiseTarget(null);
              setRaiseInput('');
              setRaising(false);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg border-2 w-[calc(100vw-2rem)] sm:w-full">
            <DialogHeader>
              <DialogTitle>Raise your max bid</DialogTitle>
              <DialogDescription>
                Proxy bidding: this sets your <span className="font-semibold">maximum</span>. The visible current bid may not change immediately.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm">
                <div className="font-semibold">{raiseTarget?.listingTitle || 'Auction'}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Current highest: {formatMoney(raiseTarget?.currentHighestBid || 0)} · Your max: {formatMoney(raiseTarget?.myMaxBid || 0)}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="raiseMax">New max bid</Label>
                <Input
                  id="raiseMax"
                  inputMode="decimal"
                  value={raiseInput}
                  onChange={(e) => setRaiseInput(e.target.value)}
                  placeholder="Enter amount (USD)"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const cur = Number(raiseInput || 0) || 0;
                      setRaiseInput(String(Math.round((cur + 10) * 100) / 100));
                    }}
                  >
                    +$10
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const cur = Number(raiseInput || 0) || 0;
                      setRaiseInput(String(Math.round((cur + 25) * 100) / 100));
                    }}
                  >
                    +$25
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const cur = Number(raiseInput || 0) || 0;
                      setRaiseInput(String(Math.round((cur + 50) * 100) / 100));
                    }}
                  >
                    +$50
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setRaiseDialogOpen(false)} disabled={raising}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!raiseTarget?.listingId) return;
                  const amount = Number(raiseInput);
                  if (!Number.isFinite(amount) || amount <= 0) {
                    toast({ title: 'Invalid amount', description: 'Enter a valid max bid amount.', variant: 'destructive' });
                    return;
                  }
                  // Client-side guard to avoid avoidable 400s (server is authoritative).
                  const minAllowed = raiseTarget ? suggestNextMaxUsd({ currentHighestBid: raiseTarget.currentHighestBid, myMaxBid: raiseTarget.myMaxBid }) : 0;
                  if (minAllowed && amount < minAllowed) {
                    toast({
                      title: 'Bid too low',
                      description: `Enter at least $${Number(minAllowed).toLocaleString()} to raise your max bid.`,
                      variant: 'destructive',
                    });
                    return;
                  }
                  try {
                    setRaising(true);
                    const res = await placeBidServer({ listingId: raiseTarget.listingId, amount });
                    if (!res.ok) throw new Error(res.error);
                    toast({
                      title: 'Max bid updated',
                      description: res.priceMoved
                        ? `Current bid is now $${Number(res.newCurrentBid).toLocaleString()}.`
                        : `Max bid set. Current bid stays $${Number(res.newCurrentBid).toLocaleString()}.`,
                    });
                    setRaiseDialogOpen(false);
                    await load();
                  } catch (e: any) {
                    toast({ title: 'Couldn’t update bid', description: e?.message || 'Please try again.', variant: 'destructive' });
                  } finally {
                    setRaising(false);
                  }
                }}
                disabled={raising}
              >
                {raising ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Update max
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PaymentMethodDialog
          open={paymentDialogOpen}
          onOpenChange={(open) => {
            setPaymentDialogOpen(open);
            if (!open) setPendingOfferCheckout(null);
          }}
          amountUsd={pendingOfferCheckout?.amountUsd || 0}
          onSelect={handleSelectPaymentMethod}
          isAuthenticated={!!user}
          isEmailVerified={!!user?.emailVerified}
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
          onSwitchBank={() => handleSelectPaymentMethod('ach_debit')}
          onSwitchWire={() => handleSelectPaymentMethod('wire')}
        />

        <WireInstructionsDialog open={wireDialogOpen} onOpenChange={setWireDialogOpen} data={wireData} />
      </div>
    </div>
  );
}

