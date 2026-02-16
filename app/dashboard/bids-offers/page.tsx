'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Gavel,
  Handshake,
  MoreHorizontal,
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  RefreshCw,
  Search,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import { formatUserFacingError } from '@/lib/format-user-facing-error';
import { getMyBids, placeBidServer, type MyBidRow } from '@/lib/api/bids';
import { getMyOffers, getSellerOffers } from '@/lib/offers/api';
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
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { getMinIncrementCents } from '@/lib/auctions/proxyBidding';
import { subscribeToUnreadCountByTypes, markNotificationsAsReadByTypes } from '@/lib/firebase/notifications';
import { getListingById } from '@/lib/firebase/listings';
import type { NotificationType } from '@/lib/types';

type OfferRow = {
  offerId: string;
  listingId: string;
  listingSnapshot?: { title?: string; images?: string[]; type?: string; sellerSnapshot?: { displayName?: string } };
  listingImageUrl?: string;
  sellerId?: string;
  buyerId?: string;
  sellerDisplayName?: string; // Hydrated by API for Offers tab "Seller" column
  status: string;
  currentAmount: number;
  originalAmount?: number;
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
      direction: 'in' | 'out'; // 'out' = you sent (you're buyer), 'in' = you received (you're seller)
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
type OfferStatusFilter = 'all' | 'sent' | 'received' | 'open' | 'countered' | 'accepted' | 'declined' | 'expired';
type OfferSortKey = 'status' | 'newest' | 'ending_soon' | 'highest_amount';

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

/** Minimum required to place/raise a bid: current auction price + required increment (matches server). */
function getMinRequiredForBidUsd(currentHighestBid: number): { minUsd: number; incrementUsd: number } {
  const currentCents = Math.max(0, Math.round((Number(currentHighestBid || 0) || 0) * 100));
  const incrementCents = getMinIncrementCents(currentCents);
  const minCents = currentCents + incrementCents;
  return {
    minUsd: Math.round(minCents) / 100,
    incrementUsd: Math.round(incrementCents) / 100,
  };
}

function suggestNextMaxUsd(params: { currentHighestBid: number; myMaxBid: number }): number {
  const { minUsd } = getMinRequiredForBidUsd(params.currentHighestBid || 0);
  const myMax = Number(params.myMaxBid || 0) || 0;
  // Suggested = at least minimum to beat current price; if raising, must also be above your current max.
  return Math.max(minUsd, myMax + 1);
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
  if (status === 'LOST') return 'destructive';
  return 'outline';
}

function offerStatusBanner(status: UnifiedRow['status']): string {
  if (status === 'EXPIRED') return 'OFFER EXPIRED';
  if (status === 'DECLINED') return 'OFFER DECLINED';
  if (status === 'ACCEPTED') return 'OFFER ACCEPTED';
  if (status === 'COUNTERED') return 'COUNTER OFFER';
  if (status === 'SENT') return 'OFFER SENT';
  return status;
}

function formatOfferExpiry(timeLeftMs: number | null, expiresAtMs: number | null): string {
  if (timeLeftMs !== null && timeLeftMs > 0) {
    const mins = Math.floor(timeLeftMs / (60 * 1000));
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `Ends in ${days}d ${hrs % 24}h`;
    if (hrs > 0) return `Ends in ${hrs}h ${mins % 60}m`;
    return `Ends in ${mins}m`;
  }
  if (expiresAtMs) {
    const d = new Date(expiresAtMs);
    return `Ended ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  }
  return '';
}

const TAB_VALUES = ['needs_action', 'bids', 'offers', 'history'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function parseTabFromSearchParams(sp: URLSearchParams | null): TabValue {
  const t = sp?.get('tab')?.toLowerCase();
  if (t && TAB_VALUES.includes(t as TabValue)) return t as TabValue;
  return 'needs_action';
}

export default function BidsOffersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [tab, setTabState] = useState<TabValue>('needs_action');
  const setTab = useCallback(
    (next: TabValue) => {
      setTabState(next);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('tab', next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // Sync tab from ?tab= when landing (e.g. Back from offer detail → ?tab=offers).
  useEffect(() => {
    const t = parseTabFromSearchParams(searchParams);
    setTabState(t);
  }, [searchParams]);

  // Close mobile filters sheet when switching tabs so it doesn't stay open on the wrong tab
  useEffect(() => {
    setMobileFiltersOpen(false);
  }, [tab]);
  const [unreadNeedsAction, setUnreadNeedsAction] = useState(0);
  const [unreadBids, setUnreadBids] = useState(0);
  const [unreadOffers, setUnreadOffers] = useState(0);
  const [unreadHistory, setUnreadHistory] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all'); // applies in Bids tab
  const [sortKey, setSortKey] = useState<SortKey>('ending_soon');
  const [offerStatusFilter, setOfferStatusFilter] = useState<OfferStatusFilter>('all');
  const [offerSortKey, setOfferSortKey] = useState<OfferSortKey>('status');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');

  const [loading, setLoading] = useState(false);
  const [bids, setBids] = useState<MyBidRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  // When API returns "Unknown listing" / "Listing unavailable", try client fetch to recover title/seller (e.g. listing exists but API missed it).
  const [listingOverrides, setListingOverrides] = useState<Record<string, { title: string; sellerName?: string }>>({});

  const [dismissedRemovedListingIds, setDismissedRemovedListingIds] = useState<Set<string>>(new Set());
  const [hideRemovedListings, setHideRemovedListingsState] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('bids_offers_hide_removed') === 'true';
    } catch {
      return false;
    }
  });
  const setHideRemovedListings = useCallback((v: boolean) => {
    setHideRemovedListingsState(v);
    try {
      localStorage.setItem('bids_offers_hide_removed', v ? 'true' : 'false');
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.warn('[bids-offers] localStorage setItem failed', e);
    }
  }, []);

  // Raise max bid dialog
  const [raiseDialogOpen, setRaiseDialogOpen] = useState(false);
  const [raiseTarget, setRaiseTarget] = useState<null | { listingId: string; listingTitle: string; currentHighestBid: number; myMaxBid: number }>(null);
  const [raiseInput, setRaiseInput] = useState('');
  const [raising, setRaising] = useState(false);
  // Success modal after placing/raising bid
  const [bidSuccessOpen, setBidSuccessOpen] = useState(false);
  const [bidSuccessResult, setBidSuccessResult] = useState<{
    listingTitle: string;
    yourMaxBid: number;
    newCurrentBid: number;
    priceMoved: boolean;
    newBidderId: string | null;
  } | null>(null);

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
      const [bidsRes, buyerOffersRes, sellerOffersRes] = await Promise.allSettled([
        getMyBids({ limit: 100 }),
        getMyOffers({ limit: 100 }),
        getSellerOffers({ limit: 100 }),
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

      // Offers: combine buyer and seller offers, surface common blocker (email not verified)
      const buyerOffers = buyerOffersRes.status === 'fulfilled' ? (buyerOffersRes.value?.offers || []) : [];
      const sellerOffers = sellerOffersRes.status === 'fulfilled' ? (sellerOffersRes.value?.offers || []) : [];
      const allOffers = [...buyerOffers, ...sellerOffers] as OfferRow[];
      
      if (buyerOffersRes.status === 'fulfilled' || sellerOffersRes.status === 'fulfilled') {
        setOffers(allOffers);
      } else {
        setOffers([]);
        const msg = String(buyerOffersRes.reason?.message || sellerOffersRes.reason?.message || 'Failed to load offers');
        toast({
          title: msg.toLowerCase().includes('verify') ? 'Email verification required' : 'Offers unavailable',
          description: msg.toLowerCase().includes('verify')
            ? 'Verify your email to send/receive offers. Go to Settings → Account & Settings → Email verification.'
            : msg,
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({ title: 'Failed to load', description: formatUserFacingError(e, 'Please try again.'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    load();
  }, [authLoading, load, user]);

  // When API returns "Listing removed or deleted" for a bid, try client-side fetch so we still show title/seller if the listing exists.
  useEffect(() => {
    const unavailable = bids.filter(
      (b) =>
        (b.listingTitle === 'Unknown listing' ||
          b.listingTitle === 'Listing unavailable' ||
          b.listingTitle === 'Listing removed or deleted') &&
        b.listingId
    );
    if (unavailable.length === 0) return;
    let cancelled = false;
    const run = async () => {
      for (const b of unavailable) {
        if (cancelled) break;
        try {
          const listing = await getListingById(b.listingId);
          if (cancelled) break;
          if (listing)
            setListingOverrides((prev) => ({
              ...prev,
              [b.listingId]: {
                title: listing.title,
                sellerName: listing.sellerSnapshot?.displayName,
              },
            }));
        } catch {
          // listing may be deleted or inaccessible; leave as unavailable
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [bids]);

  // Refetch when page gains focus so WINNING/OUTBID stays correct after placing a bid on the listing page.
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, load]);

  // Load persisted dismissed-removed listing ids when user is available.
  useEffect(() => {
    if (!user?.uid || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(`bids_offers_dismissed_${user.uid}`);
      const arr = raw ? JSON.parse(raw) : [];
      setDismissedRemovedListingIds(new Set(Array.isArray(arr) ? arr : []));
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.warn('[bids-offers] localStorage getItem/parse failed', e);
    }
  }, [user?.uid]);

  // Clear bids/offers, listing overrides, and dismissed IDs on logout so we never show another user's data (e.g. shared device).
  useEffect(() => {
    if (!authLoading && !user) {
      setBids([]);
      setOffers([]);
      setListingOverrides({});
      setDismissedRemovedListingIds(new Set());
    }
  }, [authLoading, user]);

  // Unread notification badges for tabs (these should clear when the user clicks into the tab).
  useEffect(() => {
    if (!user?.uid) {
      setUnreadNeedsAction(0);
      setUnreadBids(0);
      setUnreadOffers(0);
      setUnreadHistory(0);
      return;
    }

    const bidTypes: NotificationType[] = ['bid_outbid', 'bid_received', 'bid_placed', 'auction_high_bidder'];
    const offerTypes: NotificationType[] = ['offer_received', 'offer_countered', 'offer_accepted', 'offer_declined', 'offer_expired'];
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

  const clearTabNotifs = useCallback(
    async (nextTab: 'needs_action' | 'bids' | 'offers' | 'history') => {
      if (!user?.uid) return;
      // Do NOT mark "Needs action" notifications as read when user views the tab — they stay until action is completed or dismissed.
      if (nextTab === 'needs_action') return;
      const bidTypes: NotificationType[] = ['bid_outbid', 'bid_received', 'bid_placed', 'auction_high_bidder'];
      const offerTypes: NotificationType[] = ['offer_received', 'offer_countered', 'offer_accepted', 'offer_declined', 'offer_expired'];
      const historyTypes: NotificationType[] = ['offer_declined', 'offer_expired'];

      try {
        if (nextTab === 'bids') await markNotificationsAsReadByTypes(user.uid, bidTypes);
        else if (nextTab === 'offers') await markNotificationsAsReadByTypes(user.uid, offerTypes);
        else if (nextTab === 'history') await markNotificationsAsReadByTypes(user.uid, historyTypes);
      } catch {
        // best-effort
      }
    },
    [user?.uid]
  );

  // On initial visit, clear the current tab's notifications so sidebar badge updates (except Needs action — persistence: stay until done).
  useEffect(() => {
    if (!user?.uid) return;
    if (tab === 'needs_action') return;
    void clearTabNotifs(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount with initial tab
  }, [user?.uid]);

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
      const title = o.listingSnapshot?.title || 'Listing removed or deleted';
      const image =
        o.listingImageUrl ||
        (Array.isArray(o.listingSnapshot?.images) ? o.listingSnapshot!.images!.find((u) => typeof u === 'string' && u) : undefined);
      const sellerName = o.sellerDisplayName ?? o.listingSnapshot?.sellerSnapshot?.displayName;
      const yourAmount = Number(o.acceptedAmount ?? o.currentAmount ?? 0);
      const listingType = o.listingSnapshot?.type;
      const updatedAt = typeof o.updatedAt === 'number' ? o.updatedAt : 0;
      const direction = o.sellerId === user?.uid ? 'in' : 'out'; // in = you're seller (received), out = you're buyer (sent)
      return {
        type: 'offer',
        id: o.offerId,
        status,
        direction,
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
  }, [bids, offers, user?.uid]);

  const getDisplayTitle = useCallback(
    (r: UnifiedRow) =>
      r.type === 'bid' && 'listingId' in r && r.listingId && listingOverrides[r.listingId]
        ? listingOverrides[r.listingId].title
        : (r as { listingTitle?: string }).listingTitle ?? 'Listing removed or deleted',
    [listingOverrides]
  );
  const getDisplaySeller = useCallback(
    (r: UnifiedRow) =>
      r.type === 'bid' && 'listingId' in r && r.listingId && listingOverrides[r.listingId]?.sellerName != null
        ? listingOverrides[r.listingId].sellerName
        : (r as { sellerName?: string }).sellerName,
    [listingOverrides]
  );

  const isListingRemoved = useCallback(
    (r: UnifiedRow) => getDisplayTitle(r) === 'Listing removed or deleted',
    [getDisplayTitle]
  );

  const dismissRemovedListing = useCallback(
    (listingId: string) => {
      setDismissedRemovedListingIds((prev) => {
        const next = new Set(prev);
        next.add(listingId);
        try {
          if (user?.uid) localStorage.setItem(`bids_offers_dismissed_${user.uid}`, JSON.stringify(Array.from(next)));
        } catch (e) {
          if (process.env.NODE_ENV === 'development') console.warn('[bids-offers] localStorage setItem failed', e);
        }
        return next;
      });
    },
    [user?.uid]
  );

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
    if (!user?.uid) return [];
    let list = rows.filter((r) => {
      if (r.type === 'bid') {
        const ended = r.timeLeftMs != null && r.timeLeftMs <= 0;
        if (ended || r.status === 'LOST' || r.status === 'WON') return false;
        return r.status === 'OUTBID';
      }
      // For offers: use buyerId/sellerId to determine role; buyer needs action when countered or accepted
      if (r.type === 'offer') {
        const offerRow = r.raw as OfferRow;
        const rawStatus = String(offerRow.status || '').toLowerCase();
        const isBuyer = offerRow.buyerId === user.uid;
        const isSeller = offerRow.sellerId === user.uid;

        if (isBuyer) {
          // Buyer needs action: seller countered (COUNTERED) or accepted (ACCEPTED) — must respond or checkout
          return r.status === 'COUNTERED' || r.status === 'ACCEPTED';
        }
        if (isSeller) {
          // Seller needs action: new offers (status 'open') or buyer countered seller's counter
          return (
            r.status === 'SENT' &&
            (rawStatus === 'open' || (rawStatus === 'countered' && offerRow.lastActorRole === 'buyer'))
          );
        }
        // Fallback: if role ambiguous, treat ACCEPTED/COUNTERED as needs-action (likely buyer view)
        return r.status === 'COUNTERED' || r.status === 'ACCEPTED';
      }
      return false;
    });
    list = list.filter((r) => {
      if (r.type === 'bid' && 'listingId' in r) {
        if (dismissedRemovedListingIds.has(r.listingId)) return false;
        if (hideRemovedListings && isListingRemoved(r)) return false;
      }
      return true;
    });
    // Prioritize checkout-ready (ACCEPTED offers) first, then ending soon
    return list.sort((a, b) => {
      const aCheckout = a.type === 'offer' && a.status === 'ACCEPTED' ? 1 : 0;
      const bCheckout = b.type === 'offer' && b.status === 'ACCEPTED' ? 1 : 0;
      if (bCheckout !== aCheckout) return bCheckout - aCheckout; // ACCEPTED first
      const aLeft = a.timeLeftMs === null ? Number.POSITIVE_INFINITY : a.timeLeftMs;
      const bLeft = b.timeLeftMs === null ? Number.POSITIVE_INFINITY : b.timeLeftMs;
      return aLeft - bLeft;
    });
  }, [rows, user?.uid, dismissedRemovedListingIds, hideRemovedListings, isListingRemoved]);

  const bidRows = useMemo(() => {
    const now = Date.now();
    let list = rows.filter((r) => r.type === 'bid') as Extract<UnifiedRow, { type: 'bid' }>[];

    list = list.filter((b) => !dismissedRemovedListingIds.has(b.listingId));
    if (hideRemovedListings) {
      list = list.filter((b) => getDisplayTitle(b) !== 'Listing removed or deleted');
    }

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
  }, [normalizedQuery, rows, sortKey, statusFilter, dismissedRemovedListingIds, hideRemovedListings, getDisplayTitle]);

  const offerRows = useMemo(() => {
    let list = rows.filter((r) => r.type === 'offer') as Extract<UnifiedRow, { type: 'offer' }>[];
    if (normalizedQuery) {
      list = list.filter((o) => (o.listingTitle || '').toLowerCase().includes(normalizedQuery));
    }
    // Offer status filter (eBay-style)
    if (offerStatusFilter !== 'all') {
      list = list.filter((o) => {
        if (offerStatusFilter === 'sent') return o.direction === 'out';
        if (offerStatusFilter === 'received') return o.direction === 'in';
        if (offerStatusFilter === 'open' || offerStatusFilter === 'countered' || offerStatusFilter === 'accepted' || offerStatusFilter === 'declined' || offerStatusFilter === 'expired') {
          return o.status === offerStatusFilter.toUpperCase() as any;
        }
        return true;
      });
    }
    // Sort
    if (offerSortKey === 'status') {
      const rank = (s: UnifiedRow['status']) => (s === 'ACCEPTED' ? 0 : s === 'COUNTERED' ? 1 : s === 'SENT' ? 2 : 3);
      list.sort((a, b) => rank(a.status) - rank(b.status));
    } else if (offerSortKey === 'ending_soon') {
      list.sort((a, b) => {
        const aLeft = a.timeLeftMs === null ? Number.POSITIVE_INFINITY : a.timeLeftMs;
        const bLeft = b.timeLeftMs === null ? Number.POSITIVE_INFINITY : b.timeLeftMs;
        return aLeft - bLeft;
      });
    } else if (offerSortKey === 'highest_amount') {
      list.sort((a, b) => (b.yourAmount || 0) - (a.yourAmount || 0));
    } else {
      list.sort((a, b) => (b.sortUpdatedAt || 0) - (a.sortUpdatedAt || 0));
    }
    return list;
  }, [normalizedQuery, rows, offerStatusFilter, offerSortKey]);

  const offerCountByStatus = useMemo(() => {
    const all = rows.filter((r) => r.type === 'offer') as Extract<UnifiedRow, { type: 'offer' }>[];
    return {
      all: all.length,
      sent: all.filter((o) => o.direction === 'out').length,
      received: all.filter((o) => o.direction === 'in').length,
      open: all.filter((o) => o.status === 'SENT').length,
      countered: all.filter((o) => o.status === 'COUNTERED').length,
      accepted: all.filter((o) => o.status === 'ACCEPTED').length,
      declined: all.filter((o) => o.status === 'DECLINED').length,
      expired: all.filter((o) => o.status === 'EXPIRED').length,
    };
  }, [rows]);

  const offerRowsSent = useMemo(() => offerRows.filter((r) => r.direction === 'out'), [offerRows]);
  const offerRowsReceived = useMemo(() => offerRows.filter((r) => r.direction === 'in'), [offerRows]);

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
    return <DashboardContentSkeleton className="min-h-[60vh]" />;
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
      <div className="container mx-auto px-4 py-4 sm:py-6 md:py-8 max-w-7xl space-y-4 sm:space-y-6 md:space-y-8">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-primary shrink-0" />
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight truncate">Bids & Offers</h1>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Auctions and offers in one place. Manage bids, sent and received offers.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading} className="min-h-[44px] min-w-[44px] h-11 w-11 sm:h-9 sm:w-9 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {/* Top summary — 2x2 on mobile for touch-friendly tiles, 4 cols on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 min-w-0">
          <Card className="rounded-xl border border-border bg-card shadow-warm min-w-0">
            <CardContent className="p-3 sm:p-4 flex flex-row items-center justify-between gap-2 min-w-0">
              <span className="text-[11px] sm:text-xs text-muted-foreground truncate">Winning</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-base sm:text-xl font-extrabold tabular-nums">{stats.bidWinning}</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-primary hidden sm:block" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border bg-card shadow-warm min-w-0">
            <CardContent className="p-3 sm:p-4 flex flex-row items-center justify-between gap-2 min-w-0">
              <span className="text-[11px] sm:text-xs text-muted-foreground truncate">Outbid</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-base sm:text-xl font-extrabold tabular-nums">{stats.bidOutbid}</span>
                <TrendingUp className="h-3.5 w-3.5 text-orange-600 hidden sm:block" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border bg-card shadow-warm min-w-0">
            <CardContent className="p-3 sm:p-4 flex flex-row items-center justify-between gap-2 min-w-0">
              <span className="text-[11px] sm:text-xs text-muted-foreground truncate">Offers active</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-base sm:text-xl font-extrabold tabular-nums">{stats.offerActive}</span>
                <Handshake className="h-3.5 w-3.5 text-primary hidden sm:block" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border bg-card shadow-warm min-w-0">
            <CardContent className="p-3 sm:p-4 flex flex-row items-center justify-between gap-2 min-w-0">
              <span className="text-[11px] sm:text-xs text-muted-foreground truncate">Accepted</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-base sm:text-xl font-extrabold tabular-nums">{stats.offerAccepted}</span>
                <Clock className="h-3.5 w-3.5 text-primary hidden sm:block" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-xl border border-border bg-card shadow-warm">
          <CardContent className="pt-4 sm:pt-6 space-y-4">
            <Tabs
              value={tab}
              onValueChange={(v) => {
                const next = v as any;
                setTab(next);
                void clearTabNotifs(next);
              }}
            >
              {/* Row 1: Tabs — mobile: shorter labels + horizontal scroll; desktop: full labels */}
              <TabsList className="w-full flex flex-nowrap gap-2 p-1 h-auto rounded-lg bg-muted/40 border border-border/60 mb-4 overflow-x-auto overflow-y-hidden -mx-1 px-1 we-scrollbar-hover sm:overflow-visible sm:mx-0 sm:px-0">
                  <TabsTrigger
                    value="needs_action"
                    className="flex-1 min-w-[4rem] sm:min-w-0 py-2.5 px-2 sm:px-3 rounded-md text-sm font-medium transition-colors border border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm min-h-[44px] justify-center gap-1.5 shrink-0"
                  >
                    <span className="md:hidden">Action</span>
                    <span className="hidden md:inline">Needs action</span>
                    {unreadNeedsAction > 0 ? (
                      <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs bg-background/80 text-foreground border-0">{unreadNeedsAction}</Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="bids"
                    className="flex-1 min-w-[4rem] sm:min-w-0 py-2.5 px-2 sm:px-3 rounded-md text-sm font-medium transition-colors border border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm min-h-[44px] justify-center gap-1.5 shrink-0"
                  >
                    Bids
                    {unreadBids > 0 ? (
                      <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs bg-background/80 text-foreground border-0">{unreadBids}</Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="offers"
                    className="flex-1 min-w-[4rem] sm:min-w-0 py-2.5 px-2 sm:px-3 rounded-md text-sm font-medium transition-colors border border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm min-h-[44px] justify-center gap-1.5 shrink-0"
                  >
                    Offers
                    {unreadOffers > 0 ? (
                      <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs bg-background/80 text-foreground border-0">{unreadOffers}</Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="flex-1 min-w-[4rem] sm:min-w-0 py-2.5 px-2 sm:px-3 rounded-md text-sm font-medium transition-colors border border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm min-h-[44px] justify-center gap-1.5 shrink-0"
                  >
                    History
                    {unreadHistory > 0 ? (
                      <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs bg-background/80 text-foreground border-0">{unreadHistory}</Badge>
                    ) : null}
                  </TabsTrigger>
              </TabsList>

              {/* Row 2: Filters — mobile: full-width search + Filters popover; desktop: search, sort, status, hide-removed */}
              <div className="flex flex-col gap-2 sm:gap-3">
                {/* Mobile: search full width, then Filters sheet when Bids or Offers (better touch targets) */}
                <div className="flex flex-col gap-2 sm:hidden">
                  <div className="relative w-full min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by title…"
                      className="pl-9 min-h-[44px] h-11 w-full"
                    />
                  </div>
                  {tab === 'bids' ? (
                    <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                      <SheetTrigger asChild>
                        <Button variant="outline" className="w-full min-h-[44px] h-11 justify-between font-medium">
                          <span className="truncate">
                            {sortKey === 'ending_soon' ? 'Ending soon' : sortKey === 'newest' ? 'Newest' : 'Highest'} · {statusFilter === 'all' ? 'All' : statusFilter === 'winning' ? 'Winning' : statusFilter === 'outbid' ? 'Outbid' : statusFilter === 'accepted' ? 'Won' : 'Lost'}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto pb-safe">
                        <SheetHeader>
                          <SheetTitle>Sort & filter</SheetTitle>
                        </SheetHeader>
                        <div className="mt-6 space-y-6 pb-6">
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort by</Label>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(['ending_soon', 'newest', 'highest_amount'] as const).map((s) => (
                                <Button key={s} variant={sortKey === s ? 'default' : 'outline'} size="default" className="min-h-[44px]" onClick={() => setSortKey(s)}>
                                  {s === 'ending_soon' ? 'Ending soon' : s === 'newest' ? 'Newest' : 'Highest'}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</Label>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(['all', 'winning', 'outbid', 'accepted', 'expired'] as const).map((f) => (
                                <Button key={f} variant={statusFilter === f ? 'default' : 'outline'} size="default" className="min-h-[44px]" onClick={() => setStatusFilter(f)}>
                                  {f === 'all' ? 'All' : f === 'winning' ? 'Winning' : f === 'outbid' ? 'Outbid' : f === 'accepted' ? 'Won' : 'Lost'}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3 pt-4 border-t min-h-[44px]">
                            <Label htmlFor="hide-removed-sheet" className="text-sm font-medium">Hide removed listings</Label>
                            <Switch id="hide-removed-sheet" checked={hideRemovedListings} onCheckedChange={setHideRemovedListings} className="data-[state=checked]:bg-primary" />
                          </div>
                        </div>
                      </SheetContent>
                    </Sheet>
                  ) : tab === 'offers' ? (
                    <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                      <SheetTrigger asChild>
                        <Button variant="outline" className="w-full min-h-[44px] h-11 justify-between font-medium">
                          <span className="truncate">
                            {offerSortKey === 'status' ? 'Status' : offerSortKey === 'newest' ? 'Newest' : offerSortKey === 'ending_soon' ? 'Ending soon' : 'Highest'} · {offerStatusFilter === 'all' ? 'All' : offerStatusFilter === 'sent' ? 'You sent' : offerStatusFilter === 'received' ? 'Received' : offerStatusFilter === 'open' ? 'Open' : offerStatusFilter === 'countered' ? 'Countered' : offerStatusFilter === 'accepted' ? 'Accepted' : offerStatusFilter === 'declined' ? 'Declined' : 'Expired'}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto pb-safe">
                        <SheetHeader>
                          <SheetTitle>Sort & filter offers</SheetTitle>
                        </SheetHeader>
                        <div className="mt-6 space-y-6 pb-6">
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort by</Label>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(['status', 'newest', 'ending_soon', 'highest_amount'] as const).map((s) => (
                                <Button key={s} variant={offerSortKey === s ? 'default' : 'outline'} size="default" className="min-h-[44px]" onClick={() => setOfferSortKey(s)}>
                                  {s === 'status' ? 'Status' : s === 'newest' ? 'Newest' : s === 'ending_soon' ? 'Ending soon' : 'Highest'}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</Label>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(['all', 'sent', 'received', 'open', 'countered', 'accepted', 'declined', 'expired'] as const).map((f) => (
                                <Button key={f} variant={offerStatusFilter === f ? 'default' : 'outline'} size="default" className="min-h-[44px]" onClick={() => setOfferStatusFilter(f)}>
                                  {f === 'all' ? 'All' : f === 'sent' ? 'You sent' : f === 'received' ? 'Received' : f === 'open' ? 'Open' : f === 'countered' ? 'Countered' : f === 'accepted' ? 'Accepted' : f === 'declined' ? 'Declined' : 'Expired'}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </SheetContent>
                    </Sheet>
                  ) : null}
                </div>
                {/* Desktop: full grid */}
                <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] xl:grid-cols-[320px_180px_180px_auto] gap-2 sm:gap-3 items-center min-h-[44px]">
                  <div className="relative w-full min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by title…"
                      className="pl-9 min-h-[44px] h-11 sm:h-10"
                    />
                  </div>
                  <Select
                    value={tab === 'offers' ? offerSortKey : sortKey}
                    onValueChange={(v) => (tab === 'offers' ? setOfferSortKey(v as OfferSortKey) : setSortKey(v as SortKey))}
                  >
                    <SelectTrigger className="min-h-[44px] h-11 sm:h-10 w-full sm:w-auto sm:min-w-[180px]">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      {tab === 'offers' ? (
                        <>
                          <SelectItem value="status">Sort: Offer status</SelectItem>
                          <SelectItem value="newest">Sort: Newest</SelectItem>
                          <SelectItem value="ending_soon">Sort: Ending soon</SelectItem>
                          <SelectItem value="highest_amount">Sort: Highest amount</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="ending_soon">Sort: Ending Soon</SelectItem>
                          <SelectItem value="newest">Sort: Newest</SelectItem>
                          <SelectItem value="highest_amount">Sort: Highest Amount</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <div className="w-full sm:min-w-[180px] min-h-[44px] flex items-center">
                    {tab === 'bids' ? (
                      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                        <SelectTrigger className="min-h-[44px] h-11 sm:h-10 w-full min-w-0">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Status: All</SelectItem>
                          <SelectItem value="winning">Status: Winning</SelectItem>
                          <SelectItem value="outbid">Status: Outbid</SelectItem>
                          <SelectItem value="accepted">Status: Won</SelectItem>
                          <SelectItem value="expired">Status: Lost</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : tab === 'offers' ? (
                      <Select value={offerStatusFilter} onValueChange={(v) => setOfferStatusFilter(v as OfferStatusFilter)}>
                        <SelectTrigger className="min-h-[44px] h-11 sm:h-10 w-full min-w-0">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Status: All ({offerCountByStatus.all})</SelectItem>
                          <SelectItem value="sent">You sent ({offerCountByStatus.sent})</SelectItem>
                          <SelectItem value="received">You received ({offerCountByStatus.received})</SelectItem>
                          <SelectItem value="open">Open ({offerCountByStatus.open})</SelectItem>
                          <SelectItem value="countered">Countered ({offerCountByStatus.countered})</SelectItem>
                          <SelectItem value="accepted">Accepted ({offerCountByStatus.accepted})</SelectItem>
                          <SelectItem value="declined">Declined ({offerCountByStatus.declined})</SelectItem>
                          <SelectItem value="expired">Expired ({offerCountByStatus.expired})</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                  <div className="min-w-0 min-h-[44px] flex items-center py-1">
                    {tab === 'bids' ? (
                      <div className="flex items-center gap-2 whitespace-nowrap min-h-[44px] py-2 sm:py-0">
                        <Switch
                          id="hide-removed"
                          checked={hideRemovedListings}
                          onCheckedChange={setHideRemovedListings}
                          className="data-[state=checked]:bg-primary"
                        />
                        <Label htmlFor="hide-removed" className="text-sm font-medium cursor-pointer select-none touch-manipulation">
                          Hide removed
                        </Label>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="py-10 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <TabsContent value="needs_action" className="mt-0 data-[state=inactive]:hidden" forceMount>
                  {needsAction.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">You’re all caught up.</div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Complete these steps to keep your deals on track—checkout or respond soon to move orders forward.
                      </p>
                      <div className="space-y-4">
                        {needsAction.map((r) =>
                          r.type === 'offer' ? (
                            /* Offer card — same layout as Offers tab (truncate meta, ghost View listing + menu) */
                            (() => {
                              const o = r as Extract<UnifiedRow, { type: 'offer' }>;
                              const raw = o.raw as OfferRow;
                              const sellerId = raw?.sellerId;
                              const metaTitle = [formatMoney(o.yourAmount), o.sellerName || getDisplaySeller(o) || '—', o.timeLeftMs != null && o.timeLeftMs > 0 && o.timeLeftMs <= 24 * 60 * 60 * 1000 ? `${Math.floor(o.timeLeftMs / (60 * 60 * 1000))}h left` : ''].filter(Boolean).join(' · ');
                              const oExpired = o.status === 'EXPIRED' || o.status === 'DECLINED';
                              const oAccepted = o.status === 'ACCEPTED';
                              return (
                                <div
                                  key={r.id}
                                  className={cn(
                                    'rounded-xl border-2 border-border bg-card shadow-warm p-3 sm:p-4 transition-shadow hover:shadow-lifted',
                                    'dark:bg-[hsl(75_8%_22%)] dark:border-[hsl(75_8%_28%)]',
                                    oExpired && 'border-l-4 border-l-muted dark:border-l-muted-foreground/40',
                                    oAccepted && 'border-l-4 border-l-primary',
                                    !oExpired && !oAccepted && 'border-l-4 border-l-primary/40'
                                  )}
                                >
                                  <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3 sm:gap-4">
                                    <div className="flex flex-1 min-w-0 items-start gap-2.5 sm:gap-3">
                                      <div className="h-20 w-20 sm:h-[5.5rem] sm:w-[5.5rem] rounded-lg overflow-hidden bg-muted flex-shrink-0 relative ring-1 ring-border/50">
                                        {o.listingImage ? <Image src={o.listingImage} alt="" fill className="object-cover" sizes="88px" /> : <div className="absolute inset-0 flex items-center justify-center"><Handshake className="h-7 w-7 text-muted-foreground/40" /></div>}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <Badge variant={oExpired ? 'secondary' : 'outline'} className={cn('text-[10px] sm:text-xs px-1.5 py-0', oExpired && 'text-muted-foreground border-muted-foreground/30')}>{offerStatusBanner(o.status)}</Badge>
                                          <span className="text-[10px] sm:text-xs text-muted-foreground">{o.direction === 'out' ? 'You sent' : 'Received'}</span>
                                        </div>
                                        <Link href={`/listing/${o.listingId}`} className="font-semibold text-sm sm:text-base leading-snug line-clamp-2 mt-0.5 hover:underline block text-foreground">{getDisplayTitle(o)}</Link>
                                        <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate font-medium tabular-nums" title={metaTitle}>
                                          <span className="text-foreground">{formatMoney(o.yourAmount)}</span>
                                          {o.sellerName ? ` · ${o.sellerName}` : ` · ${getDisplaySeller(o) || '—'}`}
                                          {o.timeLeftMs != null && o.timeLeftMs > 0 && (o.timeLeftMs <= 24 * 60 * 60 * 1000 ? ` · ${Math.floor(o.timeLeftMs / (60 * 60 * 1000))}h left` : '')}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center shrink-0 w-full sm:w-auto">
                                      {o.status === 'ACCEPTED' && o.direction === 'out' ? (
                                        <Button onClick={() => openOfferCheckout(o.raw)} variant="default" size="default" className="w-full sm:w-auto min-h-[44px] h-11 sm:h-10 font-semibold shadow-md hover:shadow-lg">Pay now<ArrowRight className="ml-1.5 h-4 w-4" /></Button>
                                      ) : (
                                        <Button
                                          asChild
                                          variant={o.status === 'COUNTERED' ? 'default' : 'outline'}
                                          size="default"
                                          className={cn(
                                            'w-full sm:w-auto min-h-[44px] h-11 sm:h-10 font-semibold',
                                            o.status === 'COUNTERED' && 'shadow-md hover:shadow-lg',
                                            o.status !== 'COUNTERED' && 'border-2 border-primary bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'
                                          )}
                                        >
                                          <Link href={`/dashboard/offers/${o.id}`}>{o.status === 'COUNTERED' ? 'Respond to offer' : 'View offer'}</Link>
                                        </Button>
                                      )}
                                      <div className="flex items-center gap-2 w-full sm:w-auto min-h-[44px]">
                                        <Button asChild variant="ghost" size="default" className="flex-1 sm:flex-initial justify-start min-h-[44px] h-11 sm:h-10 px-0 sm:px-4 text-muted-foreground hover:text-foreground">
                                          <Link href={`/listing/${o.listingId}`}>View listing</Link>
                                        </Button>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="icon" className="min-h-[44px] min-w-[44px] h-11 w-11 sm:h-10 sm:w-10 shrink-0">
                                              <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="w-56">
                                            <DropdownMenuLabel>Offer</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem asChild><Link href={`/listing/${o.listingId}`}><ArrowUpRight className="h-4 w-4 mr-2" />View listing</Link></DropdownMenuItem>
                                            <DropdownMenuItem asChild><Link href={`/dashboard/offers/${o.id}`}><Handshake className="h-4 w-4 mr-2" />Offer details</Link></DropdownMenuItem>
                                            {sellerId ? <DropdownMenuItem asChild><Link href={`/sellers/${sellerId}`}>Seller&apos;s other items</Link></DropdownMenuItem> : null}
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                          <div
                            key={r.id}
                            className={cn(
                              'rounded-xl border-2 border-border bg-card shadow-warm p-3 sm:p-4 transition-shadow hover:shadow-lifted relative',
                              'dark:bg-[hsl(75_8%_22%)] dark:border-[hsl(75_8%_28%)]',
                              (r as any).status === 'LOST' && 'border-l-4 border-l-muted dark:border-l-muted-foreground/40',
                              ((r as any).status === 'WINNING' || (r as any).status === 'WON') && 'border-l-4 border-l-primary',
                              (r as any).status === 'OUTBID' && 'border-l-4 border-l-primary/40'
                            )}
                          >
                            {/* Three-dot menu — top right */}
                            <div className="absolute top-3 right-3 z-10">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 min-w-8 rounded-full text-muted-foreground hover:text-foreground">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Bid actions</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  <DropdownMenuLabel>Auction</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem asChild>
                                    <Link href={`/listing/${(r as any).listingId}`}>
                                      <ArrowUpRight className="h-4 w-4 mr-2" />
                                      View listing
                                    </Link>
                                  </DropdownMenuItem>
                                  {isListingRemoved(r) && (
                                    <DropdownMenuItem onClick={() => dismissRemovedListing((r as any).listingId)}>
                                      <X className="h-4 w-4 mr-2" />
                                      Remove from list
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          <div className="flex flex-col sm:flex-row lg:items-center gap-3 sm:gap-4 justify-between pr-10 sm:pr-10">
                            <div className="flex flex-1 min-w-0 items-start gap-2.5 sm:gap-3">
                              <div className="h-20 w-20 sm:h-24 sm:w-24 lg:h-[8.5rem] lg:w-[8.5rem] rounded-lg overflow-hidden bg-muted flex-shrink-0 relative ring-1 ring-border/50">
                                {(r as any).listingImage ? <Image src={(r as any).listingImage} alt="" fill className="object-cover" sizes="136px" /> : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0">Auction</Badge>
                                  <Badge variant={badgeVariantForUnifiedStatus(r.status) as any} className="text-[10px] sm:text-xs px-1.5 py-0">{r.status}</Badge>
                                  {r.timeLeftMs !== null ? (
                                    <Badge variant="secondary" className={cn('text-[10px] sm:text-xs px-1.5 py-0', timeLeftTone(r.timeLeftMs))}>{formatTimeLeftFromMs(r.timeLeftMs)}</Badge>
                                  ) : null}
                                </div>
                                <div className="font-semibold text-sm sm:text-base leading-snug line-clamp-2 mt-0.5 sm:mt-1">{getDisplayTitle(r)}</div>
                                {getDisplayTitle(r) === 'Listing removed or deleted' && (
                                  <div className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 mt-0.5">Removed from catalog.</div>
                                )}
                                <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">Seller: {getDisplaySeller(r) || '—'}</div>
                                {r.status === 'OUTBID' && (
                                  <p className="text-[11px] sm:text-xs text-orange-700 dark:text-orange-400 mt-1 font-medium">Raise your max bid to stay in the running.</p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center shrink-0 w-full sm:w-auto">
                                {isListingRemoved(r) ? (
                                  <>
                                    <Button variant="outline" size="default" asChild className="w-full sm:w-auto min-h-[44px] h-11 sm:h-10">
                                      <Link href={`/listing/${(r as any).listingId}`}>View listing</Link>
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="default"
                                      className="text-muted-foreground hover:text-foreground w-full sm:w-auto min-h-[44px] h-11 sm:h-10"
                                      onClick={() => dismissRemovedListing((r as any).listingId)}
                                    >
                                      <X className="h-4 w-4 mr-1.5" />
                                      Remove from list
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="default"
                                      className="w-full sm:w-auto min-h-[44px] h-11 sm:h-10"
                                      onClick={() => {
                                        const b = r as any;
                                        setRaiseTarget({
                                          listingId: b.listingId,
                                          listingTitle: getDisplayTitle(r),
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
                                      Place bid again
                                    </Button>
                                    <Button variant="outline" size="default" asChild className="w-full sm:w-auto min-h-[44px] h-11 sm:h-10">
                                      <Link href={`/listing/${(r as any).listingId}`}>View listing</Link>
                                    </Button>
                                  </>
                                )}
                            </div>
                          </div>
                        </div>
                      ))}
                      </div>
                    </div>
                  )}
                  </TabsContent>

                  <TabsContent value="bids" className="mt-0 data-[state=inactive]:hidden" forceMount>
                  {bidRows.length === 0 ? (
                    <EmptyState
                      icon={Gavel}
                      title="No bids yet"
                      description="Place bids on auctions to see them here."
                      action={{ label: 'Browse auctions', href: '/browse?type=auction' }}
                      className="py-10"
                    />
                  ) : (
                    <div className="space-y-3 lg:space-y-4">
                      {bidRows.map((r) => (
                        <div
                          key={r.id}
                          className={cn(
                            'rounded-xl border-2 border-border bg-card shadow-warm p-3 sm:p-4 lg:p-6 transition-shadow hover:shadow-lifted relative',
                            'dark:bg-[hsl(75_8%_22%)] dark:border-[hsl(75_8%_28%)]',
                            r.status === 'LOST' && 'border-l-4 border-l-muted dark:border-l-muted-foreground/40',
                            (r.status === 'WINNING' || r.status === 'WON') && 'border-l-4 border-l-primary',
                            r.status === 'OUTBID' && 'border-l-4 border-l-primary/40'
                          )}
                        >
                          {/* Three-dot menu — top right */}
                          <div className="absolute top-3 right-3 z-10">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 min-w-8 rounded-full text-muted-foreground hover:text-foreground">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Bid actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>Auction</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link href={`/listing/${r.listingId}`}>
                                    <ArrowUpRight className="h-4 w-4 mr-2" />
                                    View listing
                                  </Link>
                                </DropdownMenuItem>
                                {(r.status === 'LOST' || (r.timeLeftMs != null && r.timeLeftMs <= 0)) && (
                                  <DropdownMenuItem onClick={() => dismissRemovedListing(r.listingId)}>
                                    <X className="h-4 w-4 mr-2" />
                                    Remove from list
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          {/* Mobile: stacked (content then buttons). sm: flex col. lg: grid */}
                          <div className="flex flex-col sm:flex-col lg:grid lg:grid-cols-[8.5rem_18rem_auto_auto] lg:items-center gap-3 sm:gap-4 lg:gap-8 w-full pr-10 sm:pr-10 lg:pr-10">
                            {/* Left: thumb + title/seller (mobile row; lg grid cells) */}
                            <div className="flex min-w-0 items-start gap-2.5 sm:gap-3 lg:contents">
                              <div className="h-20 w-20 sm:h-24 sm:w-24 lg:h-[8.5rem] lg:w-[8.5rem] rounded-lg overflow-hidden bg-muted flex-shrink-0 relative ring-1 ring-border/50">
                                {(r as any).listingImage ? <Image src={(r as any).listingImage} alt="" fill className="object-cover" sizes="136px" /> : null}
                              </div>
                              <div className="min-w-0 flex-1 lg:min-w-0 lg:overflow-hidden">
                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] sm:text-xs lg:text-sm px-1.5 py-0 lg:px-2">Auction</Badge>
                                  <Badge variant={badgeVariantForUnifiedStatus(r.status) as any} className="text-[10px] sm:text-xs lg:text-sm px-1.5 py-0 lg:px-2">
                                    {r.status}
                                  </Badge>
                                  {r.timeLeftMs !== null ? (
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        'text-[10px] sm:text-xs lg:text-sm px-1.5 py-0 lg:px-2 font-medium',
                                        r.status === 'LOST' && 'border border-amber-600/50 text-amber-800 dark:text-amber-300 dark:border-amber-500/50',
                                        r.status !== 'LOST' && timeLeftTone(r.timeLeftMs)
                                      )}
                                    >
                                      {formatTimeLeftFromMs(r.timeLeftMs)}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="font-semibold text-sm sm:text-base lg:text-lg leading-snug line-clamp-2 mt-0.5 sm:mt-1" title={getDisplayTitle(r)}>{getDisplayTitle(r)}</div>
                                {getDisplayTitle(r) === 'Listing removed or deleted' && (
                                  <div className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 mt-0.5">Removed from catalog.</div>
                                )}
                                <div className="text-[11px] sm:text-xs lg:text-sm text-muted-foreground mt-0.5 truncate">Seller: {getDisplaySeller(r) || '—'}</div>
                                {/* Mobile: single line for Current · Your max · Ends */}
                                <div className="sm:hidden text-[11px] text-muted-foreground mt-1">
                                  {isListingRemoved(r) ? '—' : formatMoney(r.currentHighestBid)} · Your max {formatMoney(r.myMaxBid)}
                                  {r.endsAt && !isListingRemoved(r) && (
                                    <> · Ends {new Date(r.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Stats — hidden on mobile (inline in left); visible sm+ */}
                            <div className="hidden sm:grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 shrink-0 w-full sm:w-auto sm:min-w-0 sm:pl-6 lg:pl-8 sm:border-l sm:border-border/60">
                              <div className="min-w-[3.5rem]">
                                <div className="text-xs text-muted-foreground uppercase tracking-wider">Current</div>
                                <div className="font-semibold tabular-nums">{isListingRemoved(r) ? '—' : formatMoney(r.currentHighestBid)}</div>
                              </div>
                              <div className="min-w-[3.5rem]">
                                <div className="text-xs text-muted-foreground uppercase tracking-wider">Your max</div>
                                <div className="font-semibold tabular-nums">{formatMoney(r.myMaxBid)}</div>
                              </div>
                              <div className="min-w-[2.5rem] hidden sm:block">
                                <div className="text-xs text-muted-foreground uppercase tracking-wider">Bids</div>
                                <div className="font-semibold tabular-nums">{r.myBidCount}</div>
                              </div>
                              <div className="min-w-[6.5rem]">
                                <div className="text-xs text-muted-foreground uppercase tracking-wider">Ends</div>
                                <div className="font-semibold text-sm tabular-nums" title={r.endsAt ? new Date(r.endsAt).toLocaleString() : undefined}>
                                  {isListingRemoved(r) ? '—' : (r.endsAt ? new Date(r.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')}
                                </div>
                              </div>
                            </div>

                            {/* Right: full-width stacked on mobile, row on desktop */}
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center shrink-0 w-full sm:w-auto sm:min-w-[8rem] lg:min-w-[10rem]">
                              {isListingRemoved(r) ? (
                                <>
                                  <Button variant="outline" size="default" asChild className="w-full sm:w-auto min-h-[44px] h-11 sm:h-10 border-2 border-primary bg-transparent text-primary hover:bg-primary/10 dark:bg-transparent dark:hover:bg-primary/10">
                                    <Link href={`/listing/${r.listingId}`}>View listing</Link>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="default"
                                    className="text-muted-foreground hover:text-foreground w-full sm:w-auto min-h-[44px] h-11 sm:h-10"
                                    onClick={() => dismissRemovedListing(r.listingId)}
                                  >
                                    <X className="h-4 w-4 mr-1.5" />
                                    Remove
                                  </Button>
                                </>
                              ) : r.status === 'LOST' || (r.timeLeftMs !== null && r.timeLeftMs <= 0) ? (
                                <Button variant="outline" size="default" asChild className="w-full sm:w-auto min-h-[44px] h-11 sm:h-10 border-2 border-primary bg-transparent text-primary hover:bg-primary/10 dark:bg-transparent dark:hover:bg-primary/10">
                                  <Link href={`/listing/${r.listingId}`}>View listing</Link>
                                </Button>
                              ) : (
                                <>
                                  <div className="flex gap-2 w-full sm:w-auto">
                                    {r.status === 'OUTBID' ? (
                                      <Button
                                        variant="default"
                                        className="flex-1 min-w-0 min-h-[44px] h-11 sm:flex-initial sm:h-10"
                                        onClick={() => {
                                          setRaiseTarget({
                                            listingId: r.listingId,
                                            listingTitle: getDisplayTitle(r),
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
                                        variant="default"
                                        className="flex-1 min-w-0 min-h-[44px] h-11 sm:flex-initial sm:h-10"
                                        onClick={() => {
                                          setRaiseTarget({
                                            listingId: r.listingId,
                                            listingTitle: getDisplayTitle(r),
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
                                    <Button
                                      variant="outline"
                                      size="default"
                                      asChild
                                      className="flex-1 min-w-0 min-h-[44px] h-11 sm:hidden border-2 border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary-foreground"
                                    >
                                      <Link href={`/listing/${r.listingId}`}>View</Link>
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </TabsContent>

                  <TabsContent value="offers" className="mt-0 data-[state=inactive]:hidden" forceMount>
                  {offerRows.length === 0 ? (
                    <EmptyState
                      icon={Handshake}
                      title="No offers yet"
                      description="Make an offer on a listing to see it here."
                      action={{ label: 'Browse listings', href: '/browse' }}
                      className="py-10"
                    />
                  ) : (
                    <div className="space-y-4 sm:space-y-3">
                      {offerRows.map((r) => {
                        const raw = r.raw as OfferRow;
                        const sellerId = raw?.sellerId;
                        const isExpiredOrDeclined = r.status === 'EXPIRED' || r.status === 'DECLINED';
                        const isAccepted = r.status === 'ACCEPTED';
                        return (
                          <div
                            key={r.id}
                            className={cn(
                              'rounded-xl border-2 border-border bg-card shadow-warm p-3 sm:p-4 transition-shadow hover:shadow-lifted relative',
                              'dark:bg-[hsl(75_8%_22%)] dark:border-[hsl(75_8%_28%)]',
                              isExpiredOrDeclined && 'border-l-4 border-l-muted dark:border-l-muted-foreground/40',
                              isAccepted && 'border-l-4 border-l-primary',
                              !isExpiredOrDeclined && !isAccepted && 'border-l-4 border-l-primary/40'
                            )}
                          >
                            {/* Three-dot menu — top right (mobile + desktop) */}
                            <div className="absolute top-3 right-3 z-10">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 min-w-8 rounded-full text-muted-foreground hover:text-foreground">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Offer actions</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  <DropdownMenuLabel>Offer</DropdownMenuLabel>
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
                                  {sellerId ? (
                                    <DropdownMenuItem asChild>
                                      <Link href={`/sellers/${sellerId}`}>Seller&apos;s other items</Link>
                                    </DropdownMenuItem>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3 sm:gap-4 pr-10 sm:pr-10">
                              {/* Left: image + title + meta */}
                              <div className="flex flex-1 min-w-0 items-start gap-2.5 sm:gap-3">
                                <div className="h-20 w-20 sm:h-[5.5rem] sm:w-[5.5rem] rounded-lg overflow-hidden bg-muted flex-shrink-0 relative ring-1 ring-border/50">
                                  {r.listingImage ? (
                                    <Image src={r.listingImage} alt="" fill className="object-cover" sizes="88px" />
                                  ) : (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <Handshake className="h-7 w-7 text-muted-foreground/40" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Badge
                                      variant={isExpiredOrDeclined ? 'secondary' : 'outline'}
                                      className={cn(
                                        'text-[10px] sm:text-xs px-1.5 py-0',
                                        isExpiredOrDeclined && 'text-muted-foreground border-muted-foreground/30'
                                      )}
                                    >
                                      {offerStatusBanner(r.status)}
                                    </Badge>
                                    <span className="text-[10px] sm:text-xs text-muted-foreground">
                                      {r.direction === 'out' ? 'You sent' : 'Received'}
                                    </span>
                                  </div>
                                  <Link href={`/listing/${r.listingId}`} className="font-semibold text-sm sm:text-base leading-snug line-clamp-2 mt-0.5 hover:underline block text-foreground">
                                    {r.listingTitle}
                                  </Link>
                                  <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate font-medium tabular-nums" title={[formatMoney(r.yourAmount), r.sellerName, r.timeLeftMs != null && r.timeLeftMs > 0 && r.timeLeftMs <= 24 * 60 * 60 * 1000 ? `${Math.floor(r.timeLeftMs / (60 * 60 * 1000))}h left` : ''].filter(Boolean).join(' · ')}>
                                    <span className="text-foreground">{formatMoney(r.yourAmount)}</span>
                                    {r.sellerName ? ` · ${r.sellerName}` : ''}
                                    {r.timeLeftMs != null && r.timeLeftMs > 0 && (
                                      r.timeLeftMs <= 24 * 60 * 60 * 1000
                                        ? ` · ${Math.floor(r.timeLeftMs / (60 * 60 * 1000))}h left`
                                        : ''
                                    )}
                                  </p>
                                </div>
                              </div>
                              {/* Right: primary action + View listing on same row (mobile); desktop row */}
                              <div className="flex flex-row sm:flex-row gap-2 sm:items-center shrink-0 w-full sm:w-auto">
                                {r.status === 'ACCEPTED' && r.direction === 'out' ? (
                                  <Button onClick={() => openOfferCheckout(r.raw)} variant="default" size="default" className="flex-1 min-w-0 min-h-[44px] h-11 sm:flex-initial sm:h-10 font-semibold shadow-md hover:shadow-lg">
                                    Pay now
                                    <ArrowRight className="ml-1.5 h-4 w-4" />
                                  </Button>
                                ) : r.status === 'EXPIRED' || r.status === 'DECLINED' ? (
                                  <Button
                                    asChild
                                    variant="default"
                                    size="default"
                                    className="flex-1 min-w-0 min-h-[44px] h-11 sm:flex-initial sm:h-10 font-semibold shadow-md hover:shadow-lg"
                                  >
                                    <Link href={`/listing/${r.listingId}`}>Make offer</Link>
                                  </Button>
                                ) : (
                                  <Button
                                    asChild
                                    variant={r.status === 'COUNTERED' ? 'default' : 'outline'}
                                    size="default"
                                    className={cn(
                                      'flex-1 min-w-0 min-h-[44px] h-11 sm:flex-initial sm:h-10 font-semibold',
                                      r.status === 'COUNTERED' && 'shadow-md hover:shadow-lg',
                                      r.status !== 'COUNTERED' && 'border-2 border-primary bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'
                                    )}
                                  >
                                    <Link href={`/dashboard/offers/${r.id}`}>
                                      {r.status === 'COUNTERED' ? 'Respond to offer' : 'View offer'}
                                    </Link>
                                  </Button>
                                )}
                                <Button
                                  asChild
                                  variant="outline"
                                  size="default"
                                  className="flex-1 min-w-0 min-h-[44px] h-11 sm:flex-initial sm:h-10 border-2 border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary-foreground"
                                >
                                  <Link href={`/listing/${r.listingId}`}>View listing</Link>
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </TabsContent>

                  <TabsContent value="history" className="mt-0 data-[state=inactive]:hidden" forceMount>
                  {filtered.length === 0 ? (
                    <EmptyState
                      icon={TrendingUp}
                      title="No history yet"
                      description="Your bid and offer activity will appear here."
                      action={{ label: 'Browse listings', href: '/browse' }}
                      className="py-10"
                    />
                  ) : (
                    <div className="space-y-3">
                      {filtered.map((r) => (
                        <div key={r.id} className="rounded-xl border border-border bg-card shadow-warm p-3 sm:p-4 transition-shadow hover:shadow-lifted hover:bg-card">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm sm:text-base truncate">{getDisplayTitle(r)}</div>
                              {getDisplayTitle(r) === 'Listing removed or deleted' && (
                                <div className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 mt-0.5">Removed from catalog.</div>
                              )}
                              <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{r.type === 'bid' ? 'Auction' : 'Offer'} · {r.status}</div>
                            </div>
                            <Button variant="outline" size="default" asChild className="w-full sm:w-auto shrink-0 min-h-[44px] h-11 sm:h-10">
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
                Proxy bidding: this sets your <span className="font-semibold">maximum</span>. The visible current bid may not change until someone bids against you. After you update, we’ll refresh so you see whether you’re winning or outbid.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm">
                <div className="font-semibold">{raiseTarget?.listingTitle || 'Auction'}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Current highest: {formatMoney(raiseTarget?.currentHighestBid || 0)} · Your max: {formatMoney(raiseTarget?.myMaxBid || 0)}
                </div>
                {raiseTarget && (() => {
                  const { minUsd, incrementUsd } = getMinRequiredForBidUsd(raiseTarget.currentHighestBid);
                  return (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Minimum to raise: {formatMoney(minUsd)} (current {formatMoney(raiseTarget.currentHighestBid)} + {formatMoney(incrementUsd)} required increment)
                    </p>
                  );
                })()}
              </div>
              <div className="space-y-2">
                <Label htmlFor="raiseMax">New max bid</Label>
                <Input
                  id="raiseMax"
                  inputMode="decimal"
                  value={raiseInput}
                  onChange={(e) => setRaiseInput(e.target.value)}
                  placeholder={`Min ${raiseTarget ? formatMoney(getMinRequiredForBidUsd(raiseTarget.currentHighestBid).minUsd) : '—'} (USD)`}
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
                  const { minUsd, incrementUsd } = raiseTarget ? getMinRequiredForBidUsd(raiseTarget.currentHighestBid) : { minUsd: 0, incrementUsd: 0 };
                  const minAllowed = raiseTarget ? suggestNextMaxUsd({ currentHighestBid: raiseTarget.currentHighestBid, myMaxBid: raiseTarget.myMaxBid }) : 0;
                  if (minAllowed > 0 && amount < minAllowed - 0.01) {
                    toast({
                      title: 'Bid too low',
                      description: `Your new max must be at least ${formatMoney(minUsd)} (current highest ${formatMoney(raiseTarget!.currentHighestBid)} + ${formatMoney(incrementUsd)} required increment).`,
                      variant: 'destructive',
                    });
                    return;
                  }
                  try {
                    setRaising(true);
                    const res = await placeBidServer({ listingId: raiseTarget.listingId, amount });
                    if (!res.ok) throw new Error(res.error);
                    setRaiseDialogOpen(false);
                    setBidSuccessResult({
                      listingTitle: raiseTarget.listingTitle || 'Auction',
                      yourMaxBid: res.yourMaxBid ?? amount,
                      newCurrentBid: res.newCurrentBid,
                      priceMoved: res.priceMoved,
                      newBidderId: res.newBidderId ?? null,
                    });
                    setBidSuccessOpen(true);
                    await load();
                  } catch (e: any) {
                    toast({ title: 'Couldn’t update bid', description: formatUserFacingError(e, 'Please try again.'), variant: 'destructive' });
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

        {/* Success modal after placing/raising bid */}
        <Dialog open={bidSuccessOpen} onOpenChange={setBidSuccessOpen}>
          <DialogContent className="sm:max-w-md border-2">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500" />
                Bid placed successfully
              </DialogTitle>
              <DialogDescription>
                {bidSuccessResult && (
                  <div className="space-y-2 pt-1 text-left">
                    <p className="font-semibold text-foreground">{bidSuccessResult.listingTitle}</p>
                    <ul className="text-sm space-y-1">
                      <li>Your max bid: {formatMoney(bidSuccessResult.yourMaxBid)}</li>
                      <li>Current bid: {formatMoney(bidSuccessResult.newCurrentBid)}</li>
                      <li className="font-medium">
                        {bidSuccessResult.newBidderId === user?.uid
                          ? "You're the high bidder."
                          : bidSuccessResult.priceMoved
                            ? 'The current bid was updated.'
                            : 'Your max is set; the visible bid may not change until someone bids against you.'}
                      </li>
                    </ul>
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => { setBidSuccessOpen(false); setBidSuccessResult(null); }}>
                Done
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

