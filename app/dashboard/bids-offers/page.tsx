'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';
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
  ArrowRight,
  ArrowDownLeft,
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

const TAB_VALUES = ['needs_action', 'bids', 'offers', 'history'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function parseTabFromSearchParams(sp: URLSearchParams | null): TabValue {
  const t = sp?.get('tab')?.toLowerCase();
  if (t && TAB_VALUES.includes(t as TabValue)) return t as TabValue;
  return 'needs_action';
}

export default function BidsOffersPage() {
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [tab, setTabState] = useState<TabValue>('needs_action');
  const setTab = setTabState;

  // Sync tab from ?tab= when landing (e.g. Back from offer detail → ?tab=offers).
  useEffect(() => {
    const t = parseTabFromSearchParams(searchParams);
    setTabState(t);
  }, [searchParams]);
  const [unreadNeedsAction, setUnreadNeedsAction] = useState(0);
  const [unreadBids, setUnreadBids] = useState(0);
  const [unreadOffers, setUnreadOffers] = useState(0);
  const [unreadHistory, setUnreadHistory] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all'); // applies in Bids tab
  const [sortKey, setSortKey] = useState<SortKey>('ending_soon');
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
    } catch {}
  }, []);

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
    } catch {}
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
      const bidTypes: NotificationType[] = ['bid_outbid', 'bid_received', 'bid_placed', 'auction_high_bidder'];
      const offerTypes: NotificationType[] = ['offer_received', 'offer_countered', 'offer_accepted', 'offer_declined', 'offer_expired'];
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
        } catch {}
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
      if (r.type === 'bid') return r.status === 'OUTBID';
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
          <Button variant="outline" onClick={load} disabled={loading} className="min-h-9 h-9 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {/* Top summary — compact 2x2 on mobile, 4 cols on desktop */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 min-w-0">
          <Card className="rounded-xl border border-border/50 bg-card min-w-0">
            <CardContent className="p-3 sm:p-4 flex flex-row items-center justify-between gap-2 min-w-0">
              <span className="text-[11px] sm:text-xs text-muted-foreground truncate">Winning</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-base sm:text-xl font-extrabold tabular-nums">{stats.bidWinning}</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-primary hidden sm:block" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border/50 bg-card min-w-0">
            <CardContent className="p-3 sm:p-4 flex flex-row items-center justify-between gap-2 min-w-0">
              <span className="text-[11px] sm:text-xs text-muted-foreground truncate">Outbid</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-base sm:text-xl font-extrabold tabular-nums">{stats.bidOutbid}</span>
                <TrendingUp className="h-3.5 w-3.5 text-orange-600 hidden sm:block" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border/50 bg-card min-w-0">
            <CardContent className="p-3 sm:p-4 flex flex-row items-center justify-between gap-2 min-w-0">
              <span className="text-[11px] sm:text-xs text-muted-foreground truncate">Offers active</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-base sm:text-xl font-extrabold tabular-nums">{stats.offerActive}</span>
                <Handshake className="h-3.5 w-3.5 text-primary hidden sm:block" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border/50 bg-card min-w-0">
            <CardContent className="p-3 sm:p-4 flex flex-row items-center justify-between gap-2 min-w-0">
              <span className="text-[11px] sm:text-xs text-muted-foreground truncate">Accepted</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-base sm:text-xl font-extrabold tabular-nums">{stats.offerAccepted}</span>
                <Clock className="h-3.5 w-3.5 text-primary hidden sm:block" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-xl border border-border/50 bg-card">
          <CardContent className="pt-4 sm:pt-6 space-y-4">
            <Tabs
              value={tab}
              onValueChange={(v) => {
                const next = v as any;
                setTab(next);
                void clearTabNotifs(next);
              }}
            >
              <div className="flex flex-col xl:flex-row xl:items-center gap-3 justify-between">
                {/* Tabs: full-width pill row (like watchlist / orders filters) */}
                <TabsList className="w-full flex gap-1.5 sm:gap-2 p-0 h-auto bg-transparent">
                  <TabsTrigger
                    value="needs_action"
                    className="flex-1 min-w-0 py-2.5 px-2 sm:px-3 rounded-full text-sm font-medium transition-colors bg-muted/40 text-muted-foreground hover:bg-muted/60 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none min-h-[44px] justify-center gap-1.5"
                  >
                    Needs action
                    {unreadNeedsAction > 0 ? (
                      <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs">{unreadNeedsAction}</Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="bids"
                    className="flex-1 min-w-0 py-2.5 px-2 sm:px-3 rounded-full text-sm font-medium transition-colors bg-muted/40 text-muted-foreground hover:bg-muted/60 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none min-h-[44px] justify-center gap-1.5"
                  >
                    Bids
                    {unreadBids > 0 ? (
                      <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs">{unreadBids}</Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="offers"
                    className="flex-1 min-w-0 py-2.5 px-2 sm:px-3 rounded-full text-sm font-medium transition-colors bg-muted/40 text-muted-foreground hover:bg-muted/60 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none min-h-[44px] justify-center gap-1.5"
                  >
                    Offers
                    {unreadOffers > 0 ? (
                      <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs">{unreadOffers}</Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="history"
                    className="flex-1 min-w-0 py-2.5 px-2 sm:px-3 rounded-full text-sm font-medium transition-colors bg-muted/40 text-muted-foreground hover:bg-muted/60 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none min-h-[44px] justify-center gap-1.5"
                  >
                    History
                    {unreadHistory > 0 ? (
                      <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs">{unreadHistory}</Badge>
                    ) : null}
                  </TabsTrigger>
                </TabsList>

                {/* Mobile: horizontal scroll of filters */}
                <div className="sm:hidden overflow-x-auto overflow-y-hidden -mx-1 px-1 we-scrollbar-hover">
                  <div className="flex items-center gap-2 flex-nowrap min-w-0 py-1">
                    <div className="relative flex-shrink-0 w-[140px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search…"
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                      <SelectTrigger className="h-8 rounded-lg min-w-0 w-auto px-3 text-xs font-medium border-border/60 flex-shrink-0 [&>span]:max-w-[90px] [&>span]:truncate">
                        <SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ending_soon">Ending soon</SelectItem>
                        <SelectItem value="newest">Newest</SelectItem>
                        <SelectItem value="highest_amount">Highest amount</SelectItem>
                      </SelectContent>
                    </Select>
                    {tab === 'bids' ? (
                      <>
                        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                          <SelectTrigger className="h-8 rounded-lg min-w-0 w-auto px-3 text-xs font-medium border-border/60 flex-shrink-0 [&>span]:max-w-[80px] [&>span]:truncate">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="winning">Winning</SelectItem>
                            <SelectItem value="outbid">Outbid</SelectItem>
                            <SelectItem value="accepted">Won</SelectItem>
                            <SelectItem value="expired">Lost</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          onClick={() => setHideRemovedListings(!hideRemovedListings)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 h-8 text-xs font-medium flex-shrink-0 whitespace-nowrap',
                            hideRemovedListings
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-border/60 bg-muted/40 text-foreground'
                          )}
                        >
                          Hide removed
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* Desktop: filters row */}
                <div className="hidden sm:flex flex-col xl:flex-row gap-2 w-full xl:w-auto xl:items-center">
                  <div className="relative w-full xl:w-[320px]">
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
                    <>
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
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Switch
                          id="hide-removed"
                          checked={hideRemovedListings}
                          onCheckedChange={setHideRemovedListings}
                        />
                        <Label htmlFor="hide-removed" className="text-sm font-medium cursor-pointer">
                          Hide removed
                        </Label>
                      </div>
                    </>
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
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Complete these steps to keep your deals on track—checkout or respond soon to move orders forward.
                      </p>
                      <div className="space-y-3">
                        {needsAction.map((r) => (
                          <div
                            key={r.id}
                            className={cn(
                              'rounded-xl border border-border/50 bg-card p-3 sm:p-4 transition-colors hover:bg-muted/20',
                              r.type === 'offer' && r.status === 'ACCEPTED' && 'border-emerald-400/40 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20'
                            )}
                          >
                          <div className="flex flex-col lg:flex-row lg:items-center gap-3 sm:gap-4 justify-between">
                            <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                              <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                                {(r as any).listingImage ? <Image src={(r as any).listingImage} alt="" fill className="object-cover" /> : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0">
                                    {r.type === 'bid' ? 'Auction' : 'Offer'}
                                  </Badge>
                                  <Badge variant={badgeVariantForUnifiedStatus(r.status) as any} className="text-[10px] sm:text-xs px-1.5 py-0">
                                    {r.status}
                                  </Badge>
                                  {r.timeLeftMs !== null ? (
                                    <Badge variant="secondary" className={cn('text-[10px] sm:text-xs px-1.5 py-0', timeLeftTone(r.timeLeftMs))}>
                                      {formatTimeLeftFromMs(r.timeLeftMs)}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="font-semibold text-sm sm:text-base leading-snug line-clamp-2 mt-0.5 sm:mt-1">{getDisplayTitle(r)}</div>
                                {getDisplayTitle(r) === 'Listing removed or deleted' && (
                                  <div className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 mt-0.5">Removed from catalog.</div>
                                )}
                                <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">Seller: {getDisplaySeller(r) || '—'}</div>
                                {r.type === 'offer' && r.status === 'ACCEPTED' && (
                                  <p className="text-[11px] sm:text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-medium">
                                    Complete checkout to secure your purchase.
                                  </p>
                                )}
                                {r.type === 'offer' && r.status === 'COUNTERED' && (
                                  <p className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 mt-1 font-medium">
                                    Review and respond before the counter expires.
                                  </p>
                                )}
                                  {r.type === 'bid' && r.status === 'OUTBID' && (
                                  <p className="text-[11px] sm:text-xs text-orange-700 dark:text-orange-400 mt-1 font-medium">
                                    Raise your max bid to stay in the running.
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 justify-end flex-wrap mt-1 sm:mt-0">
                              {r.type === 'bid' ? (
                                isListingRemoved(r) ? (
                                  <>
                                    <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
                                      <Link href={`/listing/${(r as any).listingId}`}>View listing</Link>
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-muted-foreground hover:text-foreground w-full sm:w-auto"
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
                                      className="w-full sm:w-auto"
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
                                      Raise max bid
                                    </Button>
                                    <Button variant="outline" asChild className="w-full sm:w-auto">
                                      <Link href={`/listing/${(r as any).listingId}`}>View</Link>
                                    </Button>
                                  </>
                                )
                              ) : (
                                <>
                                  {r.status === 'ACCEPTED' ? (
                                    <Button
                                      onClick={() => openOfferCheckout((r as any).raw)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold w-full sm:w-auto"
                                    >
                                      Checkout now
                                      <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      asChild
                                      className={
                                        r.status === 'COUNTERED'
                                          ? 'bg-amber-600 hover:bg-amber-700 text-white font-semibold w-full sm:w-auto'
                                          : 'border-primary/40 text-primary hover:bg-primary/10 w-full sm:w-auto'
                                      }
                                      variant={r.status === 'COUNTERED' ? 'default' : 'outline'}
                                    >
                                      <Link href={`/dashboard/offers/${(r as any).id}`}>
                                        {r.status === 'COUNTERED' ? 'Review counter' : 'View offer'}
                                      </Link>
                                    </Button>
                                  )}
                                  <Button variant="outline" asChild className="w-full sm:w-auto">
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

                  <TabsContent value="bids" className="mt-0">
                  {bidRows.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">No bids match your filters.</div>
                  ) : (
                    <div className="space-y-3">
                      {bidRows.map((r) => (
                        <div key={r.id} className="rounded-xl border border-border/50 bg-card p-3 sm:p-4 transition-colors hover:bg-muted/20">
                          <div className="flex flex-col lg:flex-row lg:items-center gap-3 sm:gap-4 lg:gap-6 w-full">
                            {/* Thumb + title/seller — compact on mobile */}
                            <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                              <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                                {(r as any).listingImage ? <Image src={(r as any).listingImage} alt="" fill className="object-cover" /> : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0">Auction</Badge>
                                  <Badge variant={badgeVariantForUnifiedStatus(r.status) as any} className="text-[10px] sm:text-xs px-1.5 py-0">
                                    {r.status}
                                  </Badge>
                                  {r.timeLeftMs !== null ? (
                                    <Badge variant="secondary" className={cn('text-[10px] sm:text-xs px-1.5 py-0', timeLeftTone(r.timeLeftMs))}>
                                      {formatTimeLeftFromMs(r.timeLeftMs)}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="font-semibold text-sm sm:text-base leading-snug line-clamp-2 mt-0.5 sm:mt-1" title={getDisplayTitle(r)}>{getDisplayTitle(r)}</div>
                                {getDisplayTitle(r) === 'Listing removed or deleted' && (
                                  <div className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 mt-0.5">Removed from catalog.</div>
                                )}
                                <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">Seller: {getDisplaySeller(r) || '—'}</div>
                                {/* Mobile: single line for Current · Your max · Ends */}
                                <div className="sm:hidden text-[11px] text-muted-foreground mt-1">
                                  {isListingRemoved(r) ? '—' : formatMoney(r.currentHighestBid)} · Your max {formatMoney(r.myMaxBid)}
                                  {r.endsAt && !isListingRemoved(r) && (
                                    <> · Ends {new Date(r.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Stats — desktop only; mobile shown inline above */}
                            <div className="hidden sm:grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 shrink-0 w-full sm:w-auto sm:min-w-[fit-content] lg:order-2">
                              <div className="min-w-[4.5rem]">
                                <div className="text-xs text-muted-foreground uppercase tracking-wider">Current</div>
                                <div className="font-semibold tabular-nums">{isListingRemoved(r) ? '—' : formatMoney(r.currentHighestBid)}</div>
                              </div>
                              <div className="min-w-[4.5rem]">
                                <div className="text-xs text-muted-foreground uppercase tracking-wider">Your max</div>
                                <div className="font-semibold tabular-nums">{formatMoney(r.myMaxBid)}</div>
                              </div>
                              <div className="min-w-[3.5rem] hidden sm:block">
                                <div className="text-xs text-muted-foreground uppercase tracking-wider">Bids</div>
                                <div className="font-semibold tabular-nums">{r.myBidCount}</div>
                              </div>
                              <div className="min-w-0 sm:min-w-[7rem]">
                                <div className="text-xs text-muted-foreground uppercase tracking-wider">Ends</div>
                                <div className="font-semibold text-sm tabular-nums truncate" title={r.endsAt ? new Date(r.endsAt).toLocaleString() : undefined}>
                                  {isListingRemoved(r) ? '—' : (r.endsAt ? new Date(r.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')}
                                </div>
                              </div>
                            </div>

                            {/* Actions — full-width primary on mobile */}
                            <div className="flex items-center gap-2 justify-end shrink-0 lg:order-3 flex-wrap sm:flex-nowrap">
                              {isListingRemoved(r) ? (
                                <>
                                  <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-initial min-w-0">
                                    <Link href={`/listing/${r.listingId}`}>View listing</Link>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-foreground flex-1 sm:flex-initial"
                                    onClick={() => dismissRemovedListing(r.listingId)}
                                  >
                                    <X className="h-4 w-4 mr-1.5" />
                                    Remove
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {r.status === 'OUTBID' ? (
                                    <Button
                                      variant="default"
                                      className="flex-1 sm:flex-initial min-w-0"
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
                                      className="flex-1 sm:flex-initial min-w-0"
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

                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
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
                                </>
                              )}
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
                    <div className="space-y-4 sm:space-y-6">
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Sent</span> = your offers. <span className="font-medium text-foreground">Received</span> = offers on your listings.
                      </p>

                      {[
                        { title: 'Offers you sent', icon: ArrowRight, rows: offerRowsSent, emptyNote: 'You haven’t sent any offers.' },
                        { title: 'Offers you received', icon: ArrowDownLeft, rows: offerRowsReceived, emptyNote: 'No one has made offers on your listings.' },
                      ].map(({ title, icon: Icon, rows, emptyNote }) => (
                        <section key={title} className="space-y-3">
                          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            {title}
                            <span className="text-muted-foreground font-normal">({rows.length})</span>
                          </h3>
                          {rows.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 pl-6">{emptyNote}</p>
                          ) : (
                            <div className="space-y-3">
                              {rows.map((r) => (
                                <div
                                  key={r.id}
                                  className={cn(
                                    'rounded-xl border border-border/50 bg-card p-3 sm:p-4 transition-colors hover:bg-muted/20',
                                    r.status === 'ACCEPTED' && 'border-emerald-400/40 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20'
                                  )}
                                >
                                  <div className="flex flex-col lg:flex-row lg:items-center gap-3 sm:gap-4 lg:gap-6 w-full">
                                    {/* Thumb + title/seller — compact on mobile */}
                                    <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                                      <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                                        {r.listingImage ? <Image src={r.listingImage} alt="" fill className="object-cover" /> : null}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                          <Badge variant={badgeVariantForUnifiedStatus(r.status) as any} className="text-[10px] sm:text-xs px-1.5 py-0">
                                            {r.status}
                                          </Badge>
                                          {r.timeLeftMs !== null ? (
                                            <span className={cn('text-[10px] sm:text-xs', timeLeftTone(r.timeLeftMs))}>
                                              Expires {formatTimeLeftFromMs(r.timeLeftMs)}
                                            </span>
                                          ) : null}
                                        </div>
                                        <p className="font-semibold text-sm sm:text-base leading-snug line-clamp-2 mt-0.5 sm:mt-1 truncate" title={r.listingTitle}>
                                          {r.listingTitle}
                                        </p>
                                        {r.listingTitle === 'Listing removed or deleted' && (
                                          <div className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 mt-0.5">Removed from catalog</div>
                                        )}
                                        <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">Seller: {r.sellerName || '—'}</p>
                                        {/* Mobile: single line Amount · Seller · Type */}
                                        <div className="sm:hidden text-[11px] text-muted-foreground mt-1">
                                          {formatMoney(r.yourAmount)} · {r.sellerName || '—'} · {r.listingType || '—'}
                                        </div>
                                        {r.status === 'ACCEPTED' && r.direction === 'out' && (
                                          <p className="text-[11px] sm:text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-medium">
                                            Complete checkout to secure your purchase.
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Amounts — desktop only; mobile shown inline above */}
                                    <div className="hidden sm:grid grid-cols-[5.5rem_6.5rem_4.5rem] sm:grid-cols-[5.5rem_8rem_5rem] gap-x-4 gap-y-0 shrink-0 lg:order-2">
                                      <div className="min-w-[5.5rem]">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Amount</div>
                                        <div className="font-semibold tabular-nums">{formatMoney(r.yourAmount)}</div>
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Seller</div>
                                        <div className="font-medium text-sm truncate" title={r.sellerName || undefined}>{r.sellerName || '—'}</div>
                                      </div>
                                      <div className="min-w-[4.5rem] sm:min-w-[5rem]">
                                        <div className="text-xs text-muted-foreground uppercase tracking-wider">Listing</div>
                                        <div className="font-medium capitalize truncate">{r.listingType || '—'}</div>
                                      </div>
                                    </div>

                                    {/* Actions — full-width primary on mobile */}
                                    <div className="flex items-center gap-2 justify-end shrink-0 lg:order-3 flex-wrap sm:flex-nowrap">
                                      {r.status === 'ACCEPTED' && r.direction === 'out' ? (
                                        <Button
                                          onClick={() => openOfferCheckout(r.raw)}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex-1 sm:flex-initial min-w-0"
                                        >
                                          Checkout now
                                          <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                      ) : (
                                        <Button
                                          asChild
                                          className={
                                            r.status === 'COUNTERED'
                                              ? 'bg-amber-600 hover:bg-amber-700 text-white flex-1 sm:flex-initial min-w-0'
                                              : 'border-primary/40 text-primary hover:bg-primary/10 flex-1 sm:flex-initial min-w-0'
                                          }
                                          variant={r.status === 'COUNTERED' ? 'default' : 'outline'}
                                        >
                                          <Link href={`/dashboard/offers/${r.id}`}>{r.status === 'COUNTERED' ? 'Review counter' : 'View offer'}</Link>
                                        </Button>
                                      )}
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
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
                        </section>
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
                        <div key={r.id} className="rounded-xl border border-border/50 bg-card p-3 sm:p-4 transition-colors hover:bg-muted/20">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm sm:text-base truncate">{getDisplayTitle(r)}</div>
                              {getDisplayTitle(r) === 'Listing removed or deleted' && (
                                <div className="text-[11px] sm:text-xs text-amber-700 dark:text-amber-400 mt-0.5">Removed from catalog.</div>
                              )}
                              <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{r.type === 'bid' ? 'Auction' : 'Offer'} · {r.status}</div>
                            </div>
                            <Button variant="outline" size="sm" asChild className="w-full sm:w-auto shrink-0">
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

