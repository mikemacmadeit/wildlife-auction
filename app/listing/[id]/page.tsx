'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, 
  Clock, 
  Star, 
  CheckCircle2,
  Shield,
  Truck,
  Gavel,
  ShoppingCart,
  MessageCircle,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Hash,
  CreditCard,
  FileText,
  Eye,
  HelpCircle,
  Apple,
  Link2,
  Landmark,
  Banknote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ImageGallery } from '@/components/listing/ImageGallery';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/use-favorites';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { BidHistory } from '@/components/auction/BidHistory';
import { BidIncrementCalculator } from '@/components/auction/BidIncrementCalculator';
import { AutoBidPanel } from '@/components/auction/AutoBidPanel';
import { EnhancedSellerProfile } from '@/components/listing/EnhancedSellerProfile';
import { ComplianceBadges } from '@/components/compliance/TrustBadges';
import { KeyFactsPanel } from '@/components/listing/KeyFactsPanel';
import { OfferPanel } from '@/components/offers/OfferPanel';
import { BottomNav } from '@/components/navigation/BottomNav';
import { Share2, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getListingById, subscribeToListing } from '@/lib/firebase/listings';
import { Listing, WildlifeAttributes, CattleAttributes, EquipmentAttributes } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { getWinningBidder } from '@/lib/firebase/bids';
import { placeBidServer } from '@/lib/api/bids';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PaymentMethodDialog, type PaymentMethodChoice } from '@/components/payments/PaymentMethodDialog';
import { CheckoutStartErrorDialog } from '@/components/payments/CheckoutStartErrorDialog';
import { WireInstructionsDialog } from '@/components/payments/WireInstructionsDialog';
import {
  AmexBadge,
  ApplePayBadge,
  AchBadge,
  GooglePayBadge,
  LinkBadge,
  MastercardBadge,
  VisaBadge,
  WireBadge,
} from '@/components/payments/PaymentBrandBadges';
import { getEligiblePaymentMethods } from '@/lib/payments/gating';
import { isAnimalCategory } from '@/lib/compliance/requirements';
import { AnimalRiskAcknowledgmentDialog } from '@/components/legal/AnimalRiskAcknowledgmentDialog';

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      if (d instanceof Date && Number.isFinite(d.getTime())) return d;
    } catch {
      // ignore
    }
  }
  if (typeof value?.seconds === 'number') {
    const d = new Date(value.seconds * 1000);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function toMillisSafe(value: any): number | null {
  const d = toDateSafe(value);
  return d ? d.getTime() : null;
}

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const listingId = typeof params?.id === 'string' ? params.id : '';
  
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [selectedInsurance, setSelectedInsurance] = useState<string>('');
  const [showBidDialog, setShowBidDialog] = useState(false);
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const [bidInFlight, setBidInFlight] = useState(false);
  const [checkoutInFlight, setCheckoutInFlight] = useState(false);
  const [isWinningBidder, setIsWinningBidder] = useState(false);
  const [winningBidAmount, setWinningBidAmount] = useState<number | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<{ amountUsd: number } | null>(null);
  const [buyQuantity, setBuyQuantity] = useState<number>(1);
  const [checkoutErrorOpen, setCheckoutErrorOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<{
    attemptedMethod: PaymentMethodChoice;
    message: string;
    technical?: string;
  } | null>(null);
  const [wireDialogOpen, setWireDialogOpen] = useState(false);
  const [wireData, setWireData] = useState<null | {
    orderId: string;
    paymentIntentId: string;
    instructions: { reference: string; financialAddresses: Array<{ type: string; address: any }> };
  }>(null);
  const [animalAckOpen, setAnimalAckOpen] = useState(false);
  const [animalRiskAcked, setAnimalRiskAcked] = useState(false);
  const { toast } = useToast();
  const { user, initialized: authInitialized } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { addToListing: addToRecentlyViewed } = useRecentlyViewed();
  const isSold = listing?.status === 'sold';
  const endsAtRaw = (listing as any)?.endsAt;
  const soldAtRaw = (listing as any)?.soldAt;
  const endsAtDate = useMemo(() => toDateSafe(endsAtRaw), [endsAtRaw]);
  const endsAtMs = useMemo(() => (endsAtDate ? endsAtDate.getTime() : null), [endsAtDate]);
  const soldAtDate = useMemo(() => toDateSafe(soldAtRaw), [soldAtRaw]);

  // Per-user: show "You're the highest bidder" only when the signed-in viewer is the current high bidder on an active auction.
  const isCurrentHighBidder = useMemo(() => {
    if (!user?.uid || !listing || listing.type !== 'auction' || isSold) return false;
    const ended = typeof endsAtMs === 'number' ? endsAtMs <= Date.now() : false;
    if (ended) return false;
    return (listing as any)?.currentBidderId === user.uid;
  }, [user?.uid, listing?.id, listing?.type, (listing as any)?.currentBidderId, isSold, endsAtMs]);

  // Use photo focal points (selected during upload) to match object-cover crop on the listing page gallery.
  const focalPointsByUrl = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    const photos = Array.isArray((listing as any)?.photos) ? ((listing as any).photos as any[]) : [];
    for (const p of photos) {
      const url = typeof p?.url === 'string' ? String(p.url) : '';
      const fp = p?.focalPoint;
      if (!url || !fp) continue;
      if (typeof fp?.x === 'number' && typeof fp?.y === 'number') {
        m[url] = { x: fp.x, y: fp.y };
      }
    }
    return m;
  }, [listing]);

  // Determine winner client-side for UX (server is authoritative at checkout).
  // This enables the "Complete Purchase" CTA after finalization flips listing.status -> 'expired'.
  useEffect(() => {
    if (!listing || listing.type !== 'auction') {
      setIsWinningBidder(false);
      setWinningBidAmount(null);
      return;
    }
    if (!user?.uid) {
      setIsWinningBidder(false);
      setWinningBidAmount(null);
      return;
    }
    const ended = typeof endsAtMs === 'number' ? endsAtMs <= Date.now() : false;
    if (!ended) {
      setIsWinningBidder(false);
      setWinningBidAmount(null);
      return;
    }
    const winner = listing.currentBidderId && listing.currentBidderId === user.uid;
    setIsWinningBidder(Boolean(winner));
    if (winner) {
      const amt = Number(listing.currentBid || listing.startingBid || 0);
      setWinningBidAmount(Number.isFinite(amt) ? amt : null);
    } else {
      setWinningBidAmount(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.id, listing?.type, listing?.currentBidderId, listing?.currentBid, listing?.startingBid, user?.uid, endsAtMs]);

  // Sold comps (price discovery)
  const [compsWindowDays, setCompsWindowDays] = useState<30 | 90>(90);
  const [soldComps, setSoldComps] = useState<
    Array<{
      listingId: string;
      title: string;
      soldAt: string;
      soldPriceCents: number;
      location: { city: string; state: string };
      primaryImageUrl: string;
      urlSlug?: string;
    }>
  >([]);
  const [soldCompsStats, setSoldCompsStats] = useState<null | {
    count: number;
    medianCents: number;
    p25Cents: number;
    p75Cents: number;
  }>(null);
  const [soldCompsLoading, setSoldCompsLoading] = useState(false);

  const watchingCount = useMemo(() => {
    const n = Number(listing?.watcherCount ?? listing?.metrics?.favorites ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [listing?.watcherCount, listing?.metrics?.favorites]);

  const checkoutAmountUsd = useMemo(() => {
    if (pendingCheckout?.amountUsd && Number.isFinite(pendingCheckout.amountUsd)) return pendingCheckout.amountUsd;
    if (!listing) return 0;
    if (listing.type === 'fixed') {
      const unit = Number(listing.price || 0) || 0;
      const q = Number.isFinite(buyQuantity) ? Math.max(1, Math.floor(buyQuantity)) : 1;
      return unit * q;
    }
    if (listing.type === 'auction') return Number(winningBidAmount || listing.currentBid || listing.startingBid || 0) || 0;
    return 0;
  }, [pendingCheckout?.amountUsd, listing, winningBidAmount, buyQuantity]);

  const buyNowAvailability = useMemo(() => {
    if (!listing) return { total: 1, available: 1, canChooseQuantity: false, isGroupListing: false };
    const attrsQty = Number((listing as any)?.attributes?.quantity ?? 1) || 1;
    const total =
      typeof (listing as any)?.quantityTotal === 'number' && Number.isFinite((listing as any).quantityTotal)
        ? Math.max(1, Math.floor((listing as any).quantityTotal))
        : Math.max(1, Math.floor(attrsQty));
    const available =
      typeof (listing as any)?.quantityAvailable === 'number' && Number.isFinite((listing as any).quantityAvailable)
        ? Math.max(0, Math.floor((listing as any).quantityAvailable))
        : total;
    const isGroupListing = (listing as any)?.attributes?.quantityMode === 'group';
    const canChooseQuantity = listing.type === 'fixed' && available > 1 && !isGroupListing;
    return { total, available, canChooseQuantity, isGroupListing };
  }, [listing]);

  // Keep quantity selection valid when listing loads/updates. For group listings, always use full quantity.
  useEffect(() => {
    const max = buyNowAvailability.available || 1;
    setBuyQuantity((prev) => {
      if (buyNowAvailability.isGroupListing) return Math.max(1, max);
      const next = Number.isFinite(prev) ? Math.max(1, Math.floor(prev)) : 1;
      return Math.min(next, Math.max(1, max));
    });
  }, [buyNowAvailability.available, buyNowAvailability.isGroupListing]);

  const isAnimalListing = useMemo(() => {
    if (!listing?.category) return false;
    return isAnimalCategory(listing.category as any);
  }, [listing?.category]);

  const eligiblePaymentMethods = useMemo(() => {
    return getEligiblePaymentMethods({
      totalUsd: checkoutAmountUsd,
      isAuthenticated: !!user,
      isEmailVerified: !!user?.emailVerified,
    });
  }, [checkoutAmountUsd, user]);

  const similarBrowseUrl = useMemo(() => {
    if (!listing) return '/browse';
    const p = new URLSearchParams();
    p.set('status', 'active');
    if (listing.category) p.set('category', listing.category);
    if (listing.type) p.set('type', listing.type);
    if (listing.location?.state) p.set('state', listing.location.state);
    if ((listing.attributes as any)?.speciesId) p.set('speciesId', String((listing.attributes as any).speciesId));
    return `/browse?${p.toString()}`;
  }, [listing]);

  const soldBrowseUrl = useMemo(() => {
    if (!listing) return '/browse?status=sold';
    const p = new URLSearchParams();
    p.set('status', 'sold');
    if (listing.category) p.set('category', listing.category);
    if (listing.location?.state) p.set('state', listing.location.state);
    if ((listing.attributes as any)?.speciesId) p.set('speciesId', String((listing.attributes as any).speciesId));
    return `/browse?${p.toString()}`;
  }, [listing]);

  useEffect(() => {
    if (!listing?.id) return;
    if (!listing.category || !listing.location?.state) return;

    let cancelled = false;
    setSoldCompsLoading(true);
    fetch(`/api/listings/comps?listingId=${encodeURIComponent(listing.id)}&windowDays=${compsWindowDays}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const comps = Array.isArray(data?.comps) ? data.comps : [];
        setSoldComps(comps);
        setSoldCompsStats(data?.stats && typeof data.stats === 'object' ? data.stats : null);
      })
      .catch(() => {
        if (cancelled) return;
        setSoldComps([]);
        setSoldCompsStats(null);
      })
      .finally(() => {
        if (cancelled) return;
        setSoldCompsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [listing?.id, listing?.category, listing?.location?.state, compsWindowDays]);

  const minBidUsd = useMemo(() => {
    if (!listing) return 0;
    const starting = Number((listing as any).startingBid ?? 0) || 0;
    const current = Number((listing as any).currentBid ?? (listing as any).startingBid ?? 0) || 0;
    const hasAnyBids =
      Boolean((listing as any).currentBidderId) || Number((listing as any)?.metrics?.bidCount || 0) > 0;

    // Match server behavior:
    // - First bid can be the starting bid (no increment required)
    // - Once any bids exist, minimum is current + increment (5% / $50 min), rounded to nearest $1.
    if (!hasAnyBids) return Math.max(0, starting);

    const inc = Math.max(current * 0.05, 50);
    return Math.ceil(current + inc);
  }, [listing]);

  // Scroll to top when listing ID changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [listingId]);

  // Subscribe to real-time listing updates
  useEffect(() => {
    if (!listingId) return;
    // IMPORTANT: wait until auth is initialized.
    // Otherwise, owner-only listings (draft/pending/removed) can incorrectly fail with permission-denied
    // before the auth token is attached, and we never resubscribe.
    if (!authInitialized) return;

    setLoading(true);
    setError(null);

    // Subscribe to real-time updates
    const unsubscribe = subscribeToListing(
      listingId,
      (data) => {
      if (!data) {
        setError('Listing not found or you do not have access.');
        setLoading(false);
        return;
      }
      setListing(data);
      setLoading(false);
      },
      {
        onError: (err: any) => {
          const code = String(err?.code || '');
          // If this is an owner-only listing and we are signed out, give a clear message.
          if (code === 'permission-denied' && !user) {
            setError('This listing isn’t public yet. Sign in to view your own draft/pending listings.');
          }
        },
      }
    );

    return () => {
      unsubscribe();
    };
  }, [listingId, authInitialized, user]);

  // Track recently viewed listing (only when listingId changes)
  useEffect(() => {
    if (listingId && listing) {
      addToRecentlyViewed(listingId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId, listing]);

  // Record a listing view (server-side counter) with simple client-side de-dupe
  useEffect(() => {
    if (!listingId || !listing) return;
    // Only count views for public/active listings to avoid inflating drafts.
    if (listing.status !== 'active') return;

    try {
      const key = `wx:viewed:${listingId}`;
      const now = Date.now();
      const last = Number(localStorage.getItem(key) || 0) || 0;
      // Count at most once per 6 hours per browser.
      if (last && now - last < 6 * 60 * 60 * 1000) return;
      localStorage.setItem(key, String(now));

      fetch(`/api/listings/${listingId}/view`, { method: 'POST' }).catch(() => {
        // best-effort; ignore failures
      });
    } catch {
      // ignore storage errors
    }
  }, [listingId, listing]);

  // Define all handlers first (before early returns)
  const handlePlaceBid = async () => {
    // Client-side de-dupe: prevent double-submits from rapid clicks / key repeat.
    if (bidInFlight) return;
    // Check authentication
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'You must be signed in to place a bid.',
        variant: 'destructive',
      });
      setShowBidDialog(false);
      return;
    }

    // P0: Check listing status (server-side enforced, but UX check here)
    if (listing!.status !== 'active') {
      toast({
        title: 'Listing not available',
        description: `This listing is ${listing!.status} and cannot be bid on.`,
        variant: 'destructive',
      });
      setShowBidDialog(false);
      return;
    }

    // Prevent seller from bidding on own listing
    if (listing!.sellerId === user.uid) {
      toast({
        title: 'Cannot bid on your own listing',
        description: 'You cannot place a bid on a listing you created.',
        variant: 'destructive',
      });
      setShowBidDialog(false);
      return;
    }

    // Check if auction has ended (endsAt may be a Firestore Timestamp shape)
    const endsAtMs = toMillisSafe((listing as any)?.endsAt);
    if (endsAtMs && endsAtMs <= Date.now()) {
      toast({
        title: 'Auction ended',
        description: 'This auction has ended. Bidding is no longer available.',
        variant: 'destructive',
      });
      setShowBidDialog(false);
      return;
    }

    // Validate bid amount
    if (!bidAmount || isNaN(parseFloat(bidAmount))) {
      toast({
        title: 'Invalid bid amount',
        description: 'Please enter a valid bid amount.',
        variant: 'destructive',
      });
      return;
    }

    const amount = parseFloat(bidAmount);
    if (amount <= 0) {
      toast({
        title: 'Invalid bid amount',
        description: 'Bid amount must be greater than zero.',
        variant: 'destructive',
      });
      return;
    }

    // Validate minimum bid (matches server rules)
    if (amount < minBidUsd) {
      toast({
        title: 'Bid too low',
        description: `Enter $${minBidUsd.toLocaleString()} or more.`,
        variant: 'destructive',
      });
      return;
    }

    setIsPlacingBid(true);
    setBidInFlight(true);

    try {
      const result = await placeBidServer({ listingId, amount });
      if (!result.ok) {
        throw new Error(result.error);
      }

      // Success - update local state optimistically (proxy bidding aware)
      const nextBidCount =
        (listing!.metrics?.bidCount || 0) + (Number.isFinite(result.bidCountDelta) ? result.bidCountDelta : 0);
      setListing({
        ...listing!,
        currentBid: result.newCurrentBid,
        currentBidderId: result.newBidderId || listing!.currentBidderId,
        metrics: {
          ...listing!.metrics,
          bidCount: nextBidCount,
        },
      });

      toast({
        title: 'Bid placed successfully',
        description: result.priceMoved
          ? `Max bid $${amount.toLocaleString()} placed. Current bid is now $${Number(result.newCurrentBid).toLocaleString()}.`
          : `Max bid $${amount.toLocaleString()} placed. Current bid stays $${Number(result.newCurrentBid).toLocaleString()} (proxy bidding).`,
      });

      setShowBidDialog(false);
      setBidAmount('');
    } catch (error: any) {
      // Handle specific error messages
      let errorMessage = 'Failed to place bid. Please try again.';
      
      if (error.message) {
        if (error.message.includes('must be higher')) {
          errorMessage = error.message;
        } else if (error.message.includes('ended')) {
          errorMessage = 'This auction has ended.';
        } else if (error.message.includes('active')) {
          errorMessage = 'This listing is no longer active.';
        } else if (error.message.includes('auction')) {
          errorMessage = 'Bids can only be placed on auction listings.';
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: 'Bid failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsPlacingBid(false);
      setBidInFlight(false);
    }
  };

  const handleBuyNow = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'You must be signed in to purchase this listing.',
        variant: 'destructive',
      });
      return;
    }

    if (user.uid === listing!.sellerId) {
      toast({
        title: 'You can’t purchase your own listing',
        description: 'To test checkout, sign in with a separate buyer account and purchase this listing from that account.',
        variant: 'destructive',
      });
      return;
    }

    // P0: Check listing status (server-side enforced, but UX check here)
    if (listing!.status !== 'active') {
      toast({
        title: 'Listing not available',
        description: `This listing is ${listing!.status} and cannot be purchased.`,
        variant: 'destructive',
      });
      return;
    }

    if ((listing as any)?.offerReservedByOfferId) {
      toast({
        title: 'Listing reserved',
        description: 'This listing is reserved by an accepted offer right now.',
        variant: 'destructive',
      });
      return;
    }

    if ((listing as any)?.purchaseReservedByOrderId || (listing as any)?.purchaseReservedUntil) {
      const until = (listing as any)?.purchaseReservedUntil as any;
      const untilStr =
        until instanceof Date && Number.isFinite(until.getTime())
          ? ` until ${format(until, 'MMM d, h:mm a')}`
          : '';
      toast({
        title: 'Listing reserved',
        description: `This listing is reserved pending payment confirmation${untilStr}. Please try again later.`,
        variant: 'destructive',
      });
      return;
    }

    // Do NOT check seller Stripe status client-side.
    // Buyers cannot read seller `/users/{uid}` (private fields like stripeAccountId), and `publicProfiles`
    // intentionally excludes Stripe IDs. The server-side checkout route (Admin SDK) is the source of truth.
    if (listing!.type === 'fixed' && buyNowAvailability.available <= 0) {
      toast({
        title: 'Sold out',
        description: 'This listing is currently out of available quantity.',
        variant: 'destructive',
      });
      return;
    }
    setPendingCheckout({ amountUsd: Number.isFinite(checkoutAmountUsd) ? checkoutAmountUsd : 0 });
    // Animal categories require an explicit buyer acknowledgment before checkout (server-enforced).
    if (isAnimalListing && !animalRiskAcked) setAnimalAckOpen(true);
    else setPaymentDialogOpen(true);
    return;
  };

  const handleCompleteAuctionPurchase = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'You must be signed in to complete your purchase.',
        variant: 'destructive',
      });
      return;
    }

    if (user.uid === listing!.sellerId) {
      toast({
        title: 'You can’t purchase your own listing',
        description: 'To test checkout, sign in with a separate buyer account and purchase this listing from that account.',
        variant: 'destructive',
      });
      return;
    }

    // P0: Check listing status (server-side enforced, but UX check here)
    // Auctions may be status=expired after backend finalization.
    if (listing!.type !== 'auction') {
      if (listing!.status !== 'active' && listing!.status !== 'sold') {
        toast({
          title: 'Listing not available',
          description: `This listing is ${listing!.status} and cannot be purchased.`,
          variant: 'destructive',
        });
        return;
      }
    } else {
      if (listing!.status !== 'active' && listing!.status !== 'sold' && listing!.status !== 'expired') {
        toast({
          title: 'Listing not available',
          description: `This listing is ${listing!.status} and cannot be purchased.`,
          variant: 'destructive',
        });
        return;
      }
    }

    // Verify user is still the winning bidder
    try {
      const winningBid = await getWinningBidder(listingId);
      if (!winningBid || winningBid.bidderId !== user.uid) {
        toast({
          title: 'Not the Winner',
          description: 'You are not the winning bidder for this auction.',
          variant: 'destructive',
        });
        setIsWinningBidder(false);
        return;
      }

      const amt = Number(winningBidAmount || listing!.currentBid || listing!.startingBid || 0);
      setPendingCheckout({ amountUsd: Number.isFinite(amt) ? amt : 0 });
      if (isAnimalListing && !animalRiskAcked) setAnimalAckOpen(true);
      else setPaymentDialogOpen(true);
      return;
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      toast({
        title: 'Checkout Failed',
        description: error.message || 'Failed to start checkout. Please try again.',
        variant: 'destructive',
      });
      setIsPlacingBid(false);
    }
  };

  const handleAddToWatchlist = async () => {
    try {
      const action = await toggleFavorite(listing!.id);
      toast({
        title: action === 'added' ? 'Added to watchlist' : 'Removed from watchlist',
        description: action === 'added'
          ? 'This listing has been added to your watchlist.'
          : 'This listing has been removed from your watchlist.',
      });
    } catch (error) {
      // Error toast is handled in the hook
    }
  };

  const handleSelectPaymentMethod = async (method: PaymentMethodChoice) => {
    if (!listing) return;
    // FIX-001: Prevent double-submit on checkout
    if (checkoutInFlight) {
      return;
    }
    
    try {
      setCheckoutInFlight(true);
      setPaymentDialogOpen(false);

      // Animal listings require explicit acknowledgment (server-enforced).
      // If we got here without it (e.g. retry buttons), route back through the ack dialog.
      if (isAnimalListing && !animalRiskAcked) {
        setCheckoutInFlight(false); // Reset before early return
        setAnimalAckOpen(true);
        return;
      }

      setIsPlacingBid(true);
      const qty = listing.type === 'fixed' ? Math.max(1, Math.min(buyQuantity, buyNowAvailability.available || 1)) : 1;

      // Client-side eligibility guard for nicer UX (server also enforces).
      if (method !== 'card' && !eligiblePaymentMethods.includes(method as any)) {
        throw new Error(
          method === 'ach_debit'
            ? 'ACH debit requires a verified email address.'
            : 'Wire transfer requires a verified email address.'
        );
      }
      if (method === 'wire') {
        const { createWireIntent } = await import('@/lib/stripe/api');
        const out = await createWireIntent(listing.id, undefined, qty, { buyerAcksAnimalRisk: isAnimalListing ? animalRiskAcked : undefined });
        setWireData(out);
        setWireDialogOpen(true);
      } else {
        const { createCheckoutSession } = await import('@/lib/stripe/api');
        const { url } = await createCheckoutSession(listing.id, undefined, method, qty, {
          buyerAcksAnimalRisk: isAnimalListing ? animalRiskAcked : undefined,
        });
        window.location.href = url;
      }
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      setCheckoutError({
        attemptedMethod: method,
        message: error?.message ? String(error.message) : 'Checkout could not be started.',
        technical: error?.message ? String(error.message) : String(error),
      });
      setCheckoutErrorOpen(true);
    } finally {
      setIsPlacingBid(false);
      setPendingCheckout(null);
      setCheckoutInFlight(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: listing!.title,
        text: listing!.description,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: 'Link copied',
        description: 'Listing link has been copied to clipboard.',
      });
    }
  };

  const handleContactSeller = async () => {
    if (!user || !listing) {
      toast({
        title: 'Sign in required',
        description: 'You must be signed in to contact the seller.',
        variant: 'destructive',
      });
      return;
    }

    if (user.uid === listing.sellerId) {
      toast({
        title: 'Cannot contact yourself',
        description: 'You cannot message yourself about your own listing.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Navigate to messages page with thread creation
      // Use router.push which works on both mobile and desktop
      await router.push(`/dashboard/messages?listingId=${encodeURIComponent(listing.id)}&sellerId=${encodeURIComponent(listing.sellerId)}`);
    } catch (error: any) {
      console.error('[ContactSeller] Navigation error:', error);
      toast({
        title: 'Error',
        description: 'Failed to open messaging. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Early returns for loading and error states
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-muted-foreground">Loading listing...</p>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-2">Listing Unavailable</h1>
          <p className="text-muted-foreground mb-4">
            {error || 'The listing you\'re looking for doesn\'t exist or is not available.'}
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push('/browse')}>Browse Listings</Button>
            <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-bottom-nav-safe md:pb-0">
      {/* Back Navigation */}
      <div className="border-b border-border/50 bg-card/50 sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 md:py-6 max-w-7xl">
        {/* eBay-style top header (title/meta/actions above the gallery + buy box) */}
        <Card className="mb-5 md:mb-6 border-2 bg-card">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {listing!.featured ? (
                    <Badge variant="default" className="gap-1 font-medium">
                      <Sparkles className="h-3 w-3" />
                      Featured
                    </Badge>
                  ) : null}
                  {listing!.protectedTransactionEnabled && listing!.protectedTransactionDays ? (
                    <Badge
                      variant="success"
                      className="font-medium gap-1"
                      title="Protected Transaction: Payments are processed by Stripe. Agchange does not hold funds or condition payouts on delivery. Optional dispute window after delivery; evidence required for disputes."
                    >
                      <Shield className="h-3 w-3" />
                      Protected {listing!.protectedTransactionDays} Days
                    </Badge>
                  ) : null}
                </div>

                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight break-words">
                  {listing!.title}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {listing!.location?.city || listing!.location?.state ? (
                    <span>
                      {listing!.location?.city ? `${listing!.location.city}, ` : ''}
                      {listing!.location?.state || ''}
                    </span>
                  ) : null}
                  {(listing!.category === 'ranch_equipment' || listing!.category === 'ranch_vehicles') && (listing!.attributes as any)?.condition ? (
                    <span className="capitalize">Condition: {String((listing!.attributes as any).condition).replaceAll('_', ' ')}</span>
                  ) : null}
                  {listing!.type === 'auction' && !isSold && endsAtDate ? (
                    <span>
                      Ends{' '}
                      <span className="font-medium text-foreground">
                        {format(endsAtDate, 'MMM d, h:mm a')}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleShare}
                  title="Share listing"
                  aria-label="Share listing"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleAddToWatchlist}
                  className={cn(isFavorite(listing!.id) && 'text-destructive border-destructive')}
                  title={isFavorite(listing!.id) ? 'Remove from watchlist' : 'Add to watchlist'}
                  aria-label={isFavorite(listing!.id) ? 'Remove from watchlist' : 'Add to watchlist'}
                >
                  <Heart className={cn('h-4 w-4 transition-colors duration-200', isFavorite(listing!.id) && 'fill-current')} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Grid - Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Column - Main Content (7 columns on desktop, full width on mobile) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Image Gallery */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 relative"
            >
              <ImageGallery
                images={listing!.images}
                title={listing!.title}
                focalPointsByUrl={focalPointsByUrl}
                // Slightly taller hero to better match perceived crop and improve visual impact.
                className="aspect-[4/3]"
              />

              {/* Watchers (public metric): top-right overlay on the photo */}
              {watchingCount > 0 ? (
                <div className="pointer-events-none absolute top-3 right-3 z-20">
                  <div className="flex items-center gap-1.5 rounded-full bg-card/90 backdrop-blur-sm border border-border/60 shadow-warm px-2.5 py-1.5">
                    <Heart className="h-4 w-4 text-destructive fill-destructive" />
                    <span className="text-xs font-extrabold tabular-nums text-foreground">
                      {watchingCount.toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : null}
            </motion.div>

            {/* Price - Prominent Display (Mobile only; desktop price lives in the buy box) */}
            <div className="lg:hidden">
              <Card className="border-2 bg-gradient-to-br from-primary/5 via-card to-card shadow-lg">
                <CardContent className="pt-6 pb-6">
                  <div className="space-y-3">
                    <div className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {listing!.type === 'auction' ? 'Current Bid' : 'Price'}
                    </div>
                    <div className="flex items-baseline gap-2 sm:gap-3 flex-wrap">
                      <span className="text-3xl sm:text-4xl font-extrabold text-foreground">
                        ${(listing!.type === 'auction'
                          ? (listing!.currentBid || listing!.startingBid || 0)
                          : (listing!.price || 0)).toLocaleString()}
                      </span>
                      {listing!.type === 'auction' && listing!.currentBid && (
                        <span className="text-base text-muted-foreground">(Current Bid)</span>
                      )}
                    </div>
                    {isCurrentHighBidder && (
                      <div
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-2 font-semibold text-sm',
                          'bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary border border-primary/30'
                        )}
                        role="status"
                        aria-live="polite"
                      >
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden />
                        <span>You&apos;re the highest bidder</span>
                      </div>
                    )}
                    {listing!.type === 'auction' && listing!.startingBid && (
                      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                        <span>
                          Starting: <span className="font-semibold text-foreground">${listing!.startingBid.toLocaleString()}</span>
                        </span>
                        {listing!.reservePrice && (
                          <>
                            <span className="text-border">•</span>
                            <span>
                              Reserve: <span className="font-semibold text-foreground">${listing!.reservePrice.toLocaleString()}</span>
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    {listing!.type === 'fixed' && listing!.price && (
                      <div className="text-sm text-muted-foreground">Fixed price listing</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Bidding Section - Below Price (Mobile Only) */}
            <div className="lg:hidden">
              {isSold && (
                <Card className="border-2 border-destructive/30 bg-destructive/5 mb-4">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="font-extrabold">This listing has ended</div>
                        <div className="text-sm text-muted-foreground">
                          {typeof listing!.soldPriceCents === 'number'
                            ? `Sold for $${(Math.round(listing!.soldPriceCents) / 100).toLocaleString()}`
                            : null}
                          {soldAtDate ? ` • Sold on ${format(soldAtDate, 'MMM d, yyyy')}` : null}
                        </div>
                      </div>
                      <Badge className="bg-destructive text-destructive-foreground font-extrabold">SOLD</Badge>
                    </div>
                    <Button asChild variant="outline" className="w-full min-h-[52px] text-base font-bold border-2">
                      <Link href={similarBrowseUrl}>View similar listings</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}

              {!isSold && listing!.type === 'auction' && endsAtMs && endsAtMs > Date.now() && (
                <Card className="border-2 shadow-lg bg-card">
                  <CardHeader className="pb-4 border-b">
                    <CardTitle className="text-lg font-bold">Place Your Bid</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-5">
                    {isCurrentHighBidder && (
                      <div
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-2.5 font-semibold text-sm',
                          'bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary border border-primary/30'
                        )}
                        role="status"
                        aria-live="polite"
                      >
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden />
                        <span>You&apos;re the highest bidder</span>
                      </div>
                    )}
                    {/* Countdown Timer - Prominent */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        ⏰ Time Remaining
                      </div>
                      <CountdownTimer endDate={endsAtDate || undefined} variant="default" />
                    </div>

                    <Separator />

                    {/* eBay-style: open a compact bid modal (same as desktop) */}
                    <Button
                      onClick={() => setShowBidDialog(true)}
                      className="w-full min-h-[52px] text-base font-bold shadow-lg"
                      size="lg"
                    >
                      <Gavel className="mr-2 h-5 w-5" />
                      Place bid
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Buy Now / Contact Seller - For Fixed/Classified (Mobile Only) */}
              {!isSold && listing!.type !== 'auction' && (
                <Card className="border-2">
                  <CardContent className="pt-6">
                    {listing!.type === 'fixed' && buyNowAvailability.canChooseQuantity ? (
                      <div className="mb-4 space-y-2">
                        <Label className="text-sm font-semibold">Quantity</Label>
                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={Math.max(1, buyNowAvailability.available)}
                            value={buyQuantity}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              setBuyQuantity(Math.max(1, Math.min(Math.floor(n), Math.max(1, buyNowAvailability.available))));
                            }}
                            className="w-28"
                          />
                          <div className="text-xs text-muted-foreground">
                            {buyNowAvailability.available} available
                          </div>
                        </div>
                      </div>
                    ) : listing!.type === 'fixed' && buyNowAvailability.isGroupListing && buyNowAvailability.available >= 1 ? (
                      <div className="mb-4 rounded-lg border bg-muted/30 p-3">
                        <p className="text-sm font-medium text-foreground">
                          This is a group listing. All {buyNowAvailability.available} will be purchased for the listed price.
                        </p>
                      </div>
                    ) : null}
                    {listing!.type === 'fixed' && (
                      <Button 
                        size="lg" 
                        onClick={handleBuyNow}
                        disabled={
                          isPlacingBid ||
                          checkoutInFlight ||
                          listing!.status !== 'active' ||
                          !!(listing as any).offerReservedByOfferId ||
                          buyNowAvailability.available <= 0
                        }
                        className="w-full min-h-[52px] text-base font-bold shadow-lg"
                      >
                        {isPlacingBid ? (
                          <>
                            <div className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="mr-2 h-5 w-5" />
                            {(listing as any).offerReservedByOfferId
                              ? 'Reserved'
                              : buyQuantity > 1
                              ? `Buy ${buyQuantity} — $${checkoutAmountUsd.toLocaleString()}`
                              : `Buy Now — $${checkoutAmountUsd.toLocaleString()}`}
                          </>
                        )}
                      </Button>
                    )}
                    {listing!.type === 'classified' && (
                      <Button 
                        size="lg" 
                        variant="outline" 
                        onClick={handleContactSeller}
                        className="w-full min-h-[52px] text-base font-bold border-2"
                      >
                        <MessageCircle className="mr-2 h-5 w-5" />
                        Contact Seller
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Best Offer (Mobile) */}
              {!isSold ? <OfferPanel listing={listing!} /> : null}

              {/* Bid History - For Auctions (Mobile Only, Below Bidding Section) */}
              {listing!.type === 'auction' && (
                <BidHistory
                  listingId={listing!.id}
                  currentBid={listing!.currentBid || listing!.startingBid || 0}
                  startingBid={listing!.startingBid || 0}
                />
              )}
            </div>

            {/* Description */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-xl font-bold">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-foreground leading-relaxed text-base">
                  {listing!.description}
                </p>
              </CardContent>
            </Card>

            {/* Category-Specific Specifications */}
            {listing!.attributes && (
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="text-xl font-bold">Specifications</CardTitle>
                </CardHeader>
                <CardContent>
                  {listing!.category === 'wildlife_exotics' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {(listing!.attributes as WildlifeAttributes).speciesId && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Species</div>
                          <div className="text-base font-semibold">{(listing!.attributes as WildlifeAttributes).speciesId}</div>
                        </div>
                      )}
                      {(listing!.attributes as WildlifeAttributes).sex && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sex</div>
                          <div className="text-base font-semibold capitalize">{(listing!.attributes as WildlifeAttributes).sex}</div>
                        </div>
                      )}
                      {((listing!.attributes as WildlifeAttributes).age !== undefined &&
                        (listing!.attributes as WildlifeAttributes).age !== null) ? (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Age</div>
                          <div className="text-base font-semibold">
                            {typeof (listing!.attributes as WildlifeAttributes).age === 'number'
                              ? `${(listing!.attributes as WildlifeAttributes).age} yr${(listing!.attributes as WildlifeAttributes).age === 1 ? '' : 's'}`
                              : String((listing!.attributes as WildlifeAttributes).age)}
                          </div>
                        </div>
                      ) : null}
                      {(listing!.attributes as WildlifeAttributes).quantity && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Quantity</div>
                          <div className="text-base font-semibold">{(listing!.attributes as WildlifeAttributes).quantity}</div>
                        </div>
                      )}
                      {(listing!.attributes as WildlifeAttributes).locationType && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Location Type</div>
                          <div className="text-base font-semibold capitalize">{(listing!.attributes as WildlifeAttributes).locationType?.replace('_', ' ')}</div>
                        </div>
                      )}
                      {(listing!.attributes as WildlifeAttributes).healthNotes && (
                        <div className="sm:col-span-2">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Health Notes</div>
                          <div className="text-base">{(listing!.attributes as WildlifeAttributes).healthNotes}</div>
                        </div>
                      )}
                    </div>
                  )}
                  {listing!.category === 'cattle_livestock' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {(listing!.attributes as CattleAttributes).breed && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Breed</div>
                          <div className="text-base font-semibold">{(listing!.attributes as CattleAttributes).breed}</div>
                        </div>
                      )}
                      {(listing!.attributes as CattleAttributes).sex && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sex</div>
                          <div className="text-base font-semibold capitalize">{(listing!.attributes as CattleAttributes).sex}</div>
                        </div>
                      )}
                      {((listing!.attributes as CattleAttributes).age !== undefined &&
                        (listing!.attributes as CattleAttributes).age !== null) ? (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Age</div>
                          <div className="text-base font-semibold">
                            {typeof (listing!.attributes as CattleAttributes).age === 'number'
                              ? `${(listing!.attributes as CattleAttributes).age} yr${(listing!.attributes as CattleAttributes).age === 1 ? '' : 's'}`
                              : String((listing!.attributes as CattleAttributes).age)}
                          </div>
                        </div>
                      ) : null}
                      {(listing!.attributes as CattleAttributes).registered !== undefined && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Registered</div>
                          <div className="text-base font-semibold">{(listing!.attributes as CattleAttributes).registered ? 'Yes' : 'No'}</div>
                          {(listing!.attributes as CattleAttributes).registrationNumber && (
                            <div className="text-sm text-muted-foreground mt-1">#{(listing!.attributes as CattleAttributes).registrationNumber}</div>
                          )}
                        </div>
                      )}
                      {(listing!.attributes as CattleAttributes).weightRange && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Weight Range</div>
                          <div className="text-base font-semibold">{(listing!.attributes as CattleAttributes).weightRange}</div>
                        </div>
                      )}
                      {(listing!.attributes as CattleAttributes).pregChecked !== undefined && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Pregnancy Checked</div>
                          <div className="text-base font-semibold">{(listing!.attributes as CattleAttributes).pregChecked ? 'Yes' : 'No'}</div>
                        </div>
                      )}
                      {(listing!.attributes as CattleAttributes).quantity && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Quantity</div>
                          <div className="text-base font-semibold">{(listing!.attributes as CattleAttributes).quantity} head</div>
                        </div>
                      )}
                      {(listing!.attributes as CattleAttributes).healthNotes && (
                        <div className="sm:col-span-2">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Health Notes</div>
                          <div className="text-base">{(listing!.attributes as CattleAttributes).healthNotes}</div>
                        </div>
                      )}
                    </div>
                  )}
                  {(listing!.category === 'ranch_equipment' || listing!.category === 'ranch_vehicles') && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {(listing!.attributes as EquipmentAttributes).equipmentType && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Equipment Type</div>
                          <div className="text-base font-semibold">{(listing!.attributes as EquipmentAttributes).equipmentType}</div>
                        </div>
                      )}
                      {(listing!.attributes as EquipmentAttributes).make && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Make</div>
                          <div className="text-base font-semibold">{(listing!.attributes as EquipmentAttributes).make}</div>
                        </div>
                      )}
                      {(listing!.attributes as EquipmentAttributes).model && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Model</div>
                          <div className="text-base font-semibold">{(listing!.attributes as EquipmentAttributes).model}</div>
                        </div>
                      )}
                      {(listing!.attributes as EquipmentAttributes).year && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Year</div>
                          <div className="text-base font-semibold">{(listing!.attributes as EquipmentAttributes).year}</div>
                        </div>
                      )}
                      {(listing!.attributes as EquipmentAttributes).hours && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Hours</div>
                          <div className="text-base font-semibold">{(listing!.attributes as EquipmentAttributes).hours?.toLocaleString()}</div>
                        </div>
                      )}
                      {(listing!.attributes as EquipmentAttributes).condition && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Condition</div>
                          <div className="text-base font-semibold capitalize">{(listing!.attributes as EquipmentAttributes).condition.replace('_', ' ')}</div>
                        </div>
                      )}
                      {(listing!.attributes as EquipmentAttributes).serialNumber && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Serial Number</div>
                          <div className="text-base font-semibold">{(listing!.attributes as EquipmentAttributes).serialNumber}</div>
                        </div>
                      )}
                      {(listing!.attributes as EquipmentAttributes).quantity && (
                        <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Quantity</div>
                          <div className="text-base font-semibold">{(listing!.attributes as EquipmentAttributes).quantity}</div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Key Facts - Quick Reference */}
            <KeyFactsPanel listing={listing} />

            {/* Seller Profile - Trust & Credibility */}
            <EnhancedSellerProfile listing={listing} />
          </div>

          {/* Right Sidebar - Desktop Only (5 columns, Sticky) */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-20 space-y-6">

              {/* Desktop Action Card - Purchase & Bidding */}
              <Card className="border-2 shadow-lg bg-card">
                <CardContent className="pt-6 space-y-5">
                  {/* eBay-style: seller line + quick action */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sold by</div>
                      <Link
                        href={`/sellers/${listing!.sellerId}`}
                        className="font-semibold hover:underline underline-offset-4 truncate block"
                      >
                        {(listing as any)?.sellerSnapshot?.displayName || (listing as any)?.seller?.name || 'Seller'}
                      </Link>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleContactSeller}
                      className="h-9 px-3 font-semibold"
                    >
                      Contact seller
                    </Button>
                  </div>

                  <Separator />

                  {/* eBay-style buy box: price-first header */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {listing!.type === 'auction' ? 'Current Bid' : listing!.type === 'fixed' ? 'Price' : 'Asking'}
                    </div>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-3xl sm:text-[34px] font-extrabold tracking-tight text-foreground">
                        ${(
                          listing!.type === 'auction'
                            ? (listing!.currentBid || listing!.startingBid || 0)
                            : (listing!.price || 0)
                        ).toLocaleString()}
                      </span>
                      {listing!.type === 'fixed' && !!((listing as any)?.bestOfferEnabled || (listing as any)?.bestOfferSettings?.enabled) ? (
                        <span className="text-sm text-muted-foreground">or Best Offer</span>
                      ) : null}
                    </div>
                    {isCurrentHighBidder && (
                      <div
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-2 mt-2 font-semibold text-sm',
                          'bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary border border-primary/30'
                        )}
                        role="status"
                        aria-live="polite"
                      >
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden />
                        <span>You&apos;re the highest bidder</span>
                      </div>
                    )}
                    {listing!.type === 'auction' && listing!.startingBid ? (
                      <div className="text-xs text-muted-foreground">
                        Starting bid: ${listing!.startingBid.toLocaleString()}
                      </div>
                    ) : null}
                    {!isSold && listing!.type === 'auction' && endsAtDate ? (
                      <div className="text-xs text-muted-foreground">
                        {typeof (listing as any)?.metrics?.bidCount === 'number'
                          ? `${Number((listing as any).metrics.bidCount).toLocaleString()} bids`
                          : 'Auction'}{' '}
                        • Ends in {formatDistanceToNow(endsAtDate)}
                      </div>
                    ) : null}
                    {(listing as any)?.offerReservedByOfferId ? (
                      <div className="text-xs font-semibold text-destructive">
                        Reserved by an accepted offer
                      </div>
                    ) : null}
                  </div>

                  {/* eBay-style details: condition / location / transport / payments */}
                  {listing!.type !== 'auction' ? (
                    <div className="space-y-2.5 text-sm">
                      {(listing!.category === 'ranch_equipment' || listing!.category === 'ranch_vehicles') && (listing!.attributes as any)?.condition ? (
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Condition:</span>
                          <span className="font-medium capitalize text-right">
                            {String((listing!.attributes as any).condition).replaceAll('_', ' ')}
                          </span>
                        </div>
                      ) : null}

                      <div className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground">Located in:</span>
                        <span className="font-medium text-right">
                          {listing!.location?.city || 'Unknown'}
                          {listing!.location?.state ? `, ${listing!.location.state}` : ''}
                        </span>
                      </div>

                      <div className="flex items-start gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold">Delivery / pickup</div>
                          <div className="text-xs text-muted-foreground">
                            {listing!.trust?.sellerOffersDelivery
                              ? 'Seller indicates they may offer delivery. Buyer & seller arrange logistics directly after purchase.'
                              : listing!.trust?.transportReady
                              ? 'Seller has provided delivery/pickup details. Buyer & seller arrange logistics directly after purchase.'
                              : 'Buyer & seller arrange logistics directly after purchase.'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold">Payments</div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {/* Card brands */}
                            <VisaBadge />
                            <MastercardBadge />
                            <AmexBadge />
                            {/* Wallets */}
                            <ApplePayBadge />
                            <GooglePayBadge />
                            <LinkBadge />
                            {/* High-ticket rails */}
                            <AchBadge
                              disabled={!eligiblePaymentMethods.includes('ach_debit')}
                              title={!eligiblePaymentMethods.includes('ach_debit') ? 'Requires verified email (and eligibility)' : 'Bank (ACH)'}
                            />
                            <WireBadge
                              disabled={!eligiblePaymentMethods.includes('wire')}
                              title={!eligiblePaymentMethods.includes('wire') ? 'Requires verified email (and eligibility)' : 'Wire'}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Checkout supports card and bank transfer. Payments are processed by Stripe. Agchange does not hold funds or condition payouts on delivery.
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold">Returns</div>
                          <div className="text-xs text-muted-foreground">
                            No returns. If the item/animal isn&rsquo;t as described, you can open a dispute after purchase.
                          </div>
                        </div>
                      </div>

                      {listing!.protectedTransactionEnabled && listing!.protectedTransactionDays ? (
                        <div className="flex items-start gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold">Protected Transaction</div>
                            <div className="text-xs text-muted-foreground">
                              Verified listing window ({listing!.protectedTransactionDays} days). Dispute window after delivery. Agchange does not hold funds or condition payouts on delivery.
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <Separator />

                      {/* Countdown - Very Prominent for Auctions */}
                      {!isSold && listing!.type === 'auction' && endsAtDate && (
                        <div className="space-y-3">
                          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Time remaining</div>
                          <CountdownTimer endDate={endsAtDate} variant="default" />
                        </div>
                      )}

                      {/* You're the highest bidder - prominent strip directly above Place a Bid */}
                      {isCurrentHighBidder && (
                        <div
                          className={cn(
                            'flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-sm',
                            'bg-primary/20 text-primary dark:bg-primary/25 dark:text-primary border-2 border-primary/40'
                          )}
                          role="status"
                          aria-live="polite"
                        >
                          <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden />
                          <span>You&apos;re the highest bidder</span>
                        </div>
                      )}

                      {/* Primary CTA Button - Large & Prominent */}
                      {/* Auction Winner - Complete Purchase */}
                      {!isSold && listing!.type === 'auction' && endsAtMs && endsAtMs <= Date.now() && isWinningBidder && (
                        <div className="space-y-3">
                          <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4 text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                              <span className="font-bold text-green-900">You Won This Auction!</span>
                            </div>
                            <p className="text-sm text-green-700 mb-2">
                              Winning Bid: <span className="font-bold">{winningBidAmount ? `$${winningBidAmount.toLocaleString()}` : 'N/A'}</span>
                            </p>
                            <p className="text-xs text-green-600">
                              Complete your purchase to secure this item
                            </p>
                          </div>
                          <Button 
                            size="lg" 
                            onClick={handleCompleteAuctionPurchase}
                            disabled={isPlacingBid || checkoutInFlight}
                            className="w-full min-h-[52px] sm:min-h-[60px] text-base sm:text-lg font-bold shadow-lg hover:shadow-xl transition-all bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                          >
                            {isPlacingBid ? (
                              <>
                                <div className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <CreditCard className="mr-2 h-5 w-5" />
                                Complete Purchase
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      {/* Auction Active - Place Bid */}
                      {!isSold && listing!.type === 'auction' && endsAtMs && endsAtMs > Date.now() && (
                        <Dialog open={showBidDialog} onOpenChange={setShowBidDialog}>
                          <DialogTrigger asChild>
                            <Button 
                              size="lg" 
                              className="w-full min-h-[52px] sm:min-h-[60px] text-base sm:text-lg font-bold shadow-lg hover:shadow-xl transition-all bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
                            >
                              <Gavel className="mr-2 h-5 w-5" />
                              Place a Bid
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md border-2">
                            <DialogHeader>
                              <DialogTitle>Place bid</DialogTitle>
                              <DialogDescription className="sr-only">
                                Enter your max bid (proxy bidding). Minimum: ${minBidUsd.toLocaleString()}
                              </DialogDescription>
                            </DialogHeader>

                            {(() => {
                              const currentBid = listing!.currentBid || listing!.startingBid || 0;
                              const bidCount = Number((listing as any)?.metrics?.bidCount || 0) || 0;
                              const hasAnyBids = Boolean((listing as any)?.currentBidderId) || bidCount > 0;
                              const current = Number(currentBid) || 0;
                              const inc = Math.max(current * 0.05, 50);
                              const q1 = Math.max(0, minBidUsd);
                              const q2 = Math.ceil(q1 + inc);
                              const q3 = Math.ceil(q1 + inc * 2);
                              const timeLeft = endsAtDate ? formatDistanceToNow(endsAtDate) : null;

                              return (
                                <div className="space-y-4">
                                  {/* Header summary (eBay-like) */}
                                  <div className="rounded-lg border bg-muted/20 p-3">
                                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Current bid</div>
                                    <div className="text-2xl font-extrabold tracking-tight">
                                      ${Number(currentBid || 0).toLocaleString()}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {bidCount.toLocaleString()} bids{timeLeft ? ` • ${timeLeft} left` : ''}
                                    </div>
                                  </div>

                                  {/* Quick bids */}
                                  <div className="space-y-2">
                                    <div className="grid grid-cols-3 gap-2">
                                      {[q1, q2, q3].map((amt) => (
                                        <Button
                                          key={amt}
                                          type="button"
                                          variant="outline"
                                          className="font-bold"
                                          onClick={() => setBidAmount(String(amt))}
                                        >
                                          Bid ${amt.toLocaleString()}
                                        </Button>
                                      ))}
                                    </div>
                                    <div className="text-center text-xs text-muted-foreground">or</div>
                                  </div>

                                  {/* Max bid input */}
                                  <div className="space-y-2">
                                    <Label htmlFor="bid-amount" className="text-sm font-semibold">
                                      Your max bid
                                    </Label>
                                    <div className="flex items-center gap-2">
                                      <div className="text-sm font-semibold text-muted-foreground">$</div>
                                      <Input
                                        id="bid-amount"
                                        type="number"
                                        inputMode="decimal"
                                        value={bidAmount}
                                        onChange={(e) => setBidAmount(e.target.value)}
                                        placeholder={String(minBidUsd)}
                                        className="text-lg"
                                      />
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Enter ${minBidUsd.toLocaleString()} or more.
                                    </div>
                                  </div>

                                  <Button
                                    onClick={handlePlaceBid}
                                    className="w-full min-h-[48px] text-base font-bold"
                                    disabled={!bidAmount || isNaN(parseFloat(bidAmount)) || parseFloat(bidAmount) < minBidUsd || isPlacingBid}
                                    size="lg"
                                  >
                                    {isPlacingBid ? 'Placing bid…' : 'Bid'}
                                  </Button>

                                  {/* Payment & delivery (collapsed by default) */}
                                  <Accordion type="single" collapsible className="w-full">
                                    <AccordionItem value="pay">
                                      <AccordionTrigger className="text-sm">Payment &amp; delivery</AccordionTrigger>
                                      <AccordionContent className="text-sm">
                                        <div className="space-y-3">
                                          <div>
                                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pay with</div>
                                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                              <VisaBadge />
                                              <MastercardBadge />
                                              <AmexBadge />
                                              <ApplePayBadge />
                                              <GooglePayBadge />
                                              <LinkBadge />
                                              <AchBadge
                                                disabled={!eligiblePaymentMethods.includes('ach_debit')}
                                                title={!eligiblePaymentMethods.includes('ach_debit') ? 'Requires verified email (and eligibility)' : 'Bank (ACH)'}
                                              />
                                              <WireBadge
                                                disabled={!eligiblePaymentMethods.includes('wire')}
                                                title={!eligiblePaymentMethods.includes('wire') ? 'Requires verified email (and eligibility)' : 'Wire'}
                                              />
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivery</div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                              Delivery / pickup is coordinated with the seller after the auction ends.
                                            </div>
                                          </div>
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  </Accordion>

                                  <div className="text-[11px] text-muted-foreground">
                                    By clicking <span className="font-semibold">Bid</span>, you authorize Agchange to bid up to your max bid and,
                                    if you win, charge your payment method. You agree to our{' '}
                                    <Link href="/terms" className="underline underline-offset-4">Terms</Link> and acknowledge our{' '}
                                    <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>.
                                  </div>
                                </div>
                              );
                            })()}
                          </DialogContent>
                        </Dialog>
                      )}

                      {!isSold && listing!.type === 'fixed' && (
                        <div className="space-y-3">
                          {buyNowAvailability.canChooseQuantity ? (
                            <div className="space-y-2">
                              <Label className="text-sm font-semibold">Quantity</Label>
                              <div className="flex items-center gap-3">
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={Math.max(1, buyNowAvailability.available)}
                                  value={buyQuantity}
                                  onChange={(e) => {
                                    const n = Number(e.target.value);
                                    if (!Number.isFinite(n)) return;
                                    setBuyQuantity(Math.max(1, Math.min(Math.floor(n), Math.max(1, buyNowAvailability.available))));
                                  }}
                                  className="w-32"
                                />
                                <div className="text-xs text-muted-foreground">
                                  {buyNowAvailability.available} available
                                </div>
                              </div>
                            </div>
                          ) : buyNowAvailability.isGroupListing && buyNowAvailability.available >= 1 ? (
                            <div className="mb-4 rounded-lg border bg-muted/30 p-3">
                              <p className="text-sm font-medium text-foreground">
                                This is a group listing. All {buyNowAvailability.available} will be purchased for the listed price.
                              </p>
                            </div>
                          ) : null}
                        <Button 
                          size="lg" 
                          onClick={handleBuyNow}
                          disabled={
                            isPlacingBid ||
                            checkoutInFlight ||
                            listing!.status !== 'active' ||
                            !!(listing as any).offerReservedByOfferId ||
                            buyNowAvailability.available <= 0
                          }
                          className="w-full min-h-[52px] sm:min-h-[60px] text-base sm:text-lg font-bold shadow-lg hover:shadow-xl transition-all bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
                        >
                          {isPlacingBid ? (
                            <>
                              <div className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="mr-2 h-5 w-5" />
                              {(listing as any).offerReservedByOfferId
                                ? 'Reserved'
                                : buyQuantity > 1
                                ? `Buy ${buyQuantity} — $${checkoutAmountUsd.toLocaleString()}`
                                : `Buy Now — $${checkoutAmountUsd.toLocaleString()}`}
                            </>
                          )}
                        </Button>
                        </div>
                      )}

                      {!isSold && listing!.type === 'classified' && (
                        <Button 
                          size="lg" 
                          variant="outline" 
                          onClick={handleContactSeller}
                          className="w-full min-h-[52px] sm:min-h-[60px] text-base sm:text-lg font-bold border-2"
                        >
                          <MessageCircle className="mr-2 h-5 w-5" />
                          Contact Seller
                        </Button>
                      )}

                      {/* Best Offer (Desktop sidebar) */}
                      {!isSold ? <OfferPanel listing={listing!} /> : null}

                  {/* Watch Button - Secondary Action */}
                  <Button
                    variant="outline"
                    onClick={handleAddToWatchlist}
                    className={cn('w-full', isFavorite(listing!.id) && 'border-destructive text-destructive')}
                  >
                    <Heart className={cn('mr-2 h-4 w-4 transition-colors duration-200', isFavorite(listing!.id) && 'fill-current')} />
                    {isFavorite(listing!.id) ? 'Watching' : 'Watch This Listing'}
                  </Button>

                  {/* For auctions: show details AFTER the urgency/actions block (time remaining + bid + watch). */}
                  {listing!.type === 'auction' ? (
                    <>
                      <Separator />
                      <div className="space-y-2.5 text-sm">
                        {(listing!.category === 'ranch_equipment' || listing!.category === 'ranch_vehicles') && (listing!.attributes as any)?.condition ? (
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-muted-foreground">Condition:</span>
                            <span className="font-medium capitalize text-right">
                              {String((listing!.attributes as any).condition).replaceAll('_', ' ')}
                            </span>
                          </div>
                        ) : null}

                        <div className="flex items-start justify-between gap-3">
                          <span className="text-muted-foreground">Located in:</span>
                          <span className="font-medium text-right">
                            {listing!.location?.city || 'Unknown'}
                            {listing!.location?.state ? `, ${listing!.location.state}` : ''}
                          </span>
                        </div>

                        <div className="flex items-start gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold">Delivery / transport</div>
                            <div className="text-xs text-muted-foreground">
                              {listing!.trust?.sellerOffersDelivery
                                ? 'Seller indicates they may offer delivery. Buyer & seller arrange logistics directly after purchase.'
                                : listing!.trust?.transportReady
                                ? 'Seller has provided delivery/pickup details. Buyer & seller arrange logistics directly after purchase.'
                                : 'Buyer & seller arrange logistics directly after purchase.'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold">Payments</div>
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <VisaBadge />
                              <MastercardBadge />
                              <AmexBadge />
                              <ApplePayBadge />
                              <GooglePayBadge />
                              <LinkBadge />
                              <AchBadge
                                disabled={!eligiblePaymentMethods.includes('ach_debit')}
                                title={!eligiblePaymentMethods.includes('ach_debit') ? 'Requires verified email (and eligibility)' : 'Bank (ACH)'}
                              />
                              <WireBadge
                                disabled={!eligiblePaymentMethods.includes('wire')}
                                title={!eligiblePaymentMethods.includes('wire') ? 'Requires verified email (and eligibility)' : 'Wire'}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Checkout supports card and bank transfer. Payments are processed by Stripe. Agchange does not hold funds or condition payouts on delivery.
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="font-semibold">Returns</div>
                            <div className="text-xs text-muted-foreground">
                              No returns. If the item/animal isn&rsquo;t as described, you can open a dispute after purchase.
                            </div>
                          </div>
                        </div>

                        {listing!.protectedTransactionEnabled && listing!.protectedTransactionDays ? (
                          <div className="flex items-start gap-2">
                            <Shield className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="font-semibold">Protected Transaction</div>
                              <div className="text-xs text-muted-foreground">
                                Verified listing window ({listing!.protectedTransactionDays} days). Dispute window after delivery. Agchange does not hold funds or condition payouts on delivery.
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {/* watcher count is shown on the photo overlay (do not duplicate here) */}
                </CardContent>
              </Card>

              {/* Whitetail Breeder: Transfer & Legal Requirements (separate card so the buy box stays clean) */}
              {listing!.category === 'whitetail_breeder' && (
                <Card className="border-2">
                  <CardContent className="pt-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-semibold text-sm">Transfer & Legal Requirements</div>
                          <div className="text-xs text-muted-foreground">Captive-bred breeder deer (TPWD-permitted)</div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">Texas-only</Badge>
                    </div>

                    <ul className="space-y-2 text-sm">
                      <li>
                        <span className="font-semibold">Seller-listed animal:</span>{' '}
                        This is a live, captive-bred whitetail breeder animal offered by the seller (not Agchange).
                      </li>
                      <li>
                        <span className="font-semibold">Payment ≠ legal transfer:</span>{' '}
                        Payment does <span className="font-semibold">not</span> authorize transfer or movement.
                      </li>
                      <li>
                        <span className="font-semibold">TPWD Transfer Approval required</span>{' '}
                        before the animal can be legally transferred.
                        <TooltipProvider>
                          <Tooltip delayDuration={200}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center ml-1 align-middle text-muted-foreground hover:text-foreground"
                                aria-label="What is Transfer Approval?"
                              >
                                <HelpCircle className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">
                                Transfer Approval is a TPWD-required document for lawful movement/transfer of breeder deer.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </li>
                      <li>
                        <span className="font-semibold">Pre-listing verification + seller eligibility:</span>{' '}
                        Payments are processed through the platform. Seller verification and listing review apply; after TPWD Transfer Approval is uploaded and verified, buyer and seller coordinate transfer.
                      </li>
                      <li>
                        <span className="font-semibold">Coordination:</span>{' '}
                        Buyer and seller coordinate pickup/transfer after approval.
                      </li>
                    </ul>

                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold">No hunting rights/tags/licenses</span> are included or sold on this platform.
                      {' '}
                      <Link href="/trust#whitetail" className="underline underline-offset-4 text-foreground/90 hover:text-foreground">
                        Learn more
                      </Link>
                    </div>

                    <div className="text-xs text-muted-foreground border-t pt-3">
                      <span className="font-semibold">Marketplace disclaimer:</span>{' '}
                      Agchange is a marketplace platform. Agchange does not own, sell, transport, or transfer animals.
                      Listings are created by independent sellers who are responsible for complying with Texas law.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bid History - For Auctions (Desktop) */}
              {listing!.type === 'auction' && (
                <BidHistory
                  listingId={listing!.id}
                  currentBid={listing!.currentBid || listing!.startingBid || 0}
                  startingBid={listing!.startingBid || 0}
                />
              )}

              {/* Location & Trust Info Card */}
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="text-base font-bold">Location & Trust</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Location */}
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</div>
                        <div className="font-semibold mt-1 break-words">
                          {listing!.location?.city || 'Unknown'}
                          {listing!.location?.state ? `, ${listing!.location.state}` : ''}
                        </div>
                        {listing!.location?.zip ? (
                          <div className="text-xs text-muted-foreground mt-1">ZIP {listing!.location.zip}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Trust strip: verified, transport, protected */}
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trust &amp; safety</div>
                      <Link href="/trust" className="text-xs font-semibold underline underline-offset-4">
                        Trust &amp; Compliance
                      </Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TrustBadges
                        verified={listing!.trust?.verified || false}
                        transport={listing!.trust?.transportReady || false}
                        size="sm"
                        showTooltips={true}
                        showIcons={true}
                      />
                      {listing!.transportOption !== 'BUYER_TRANSPORT' && (
                        <Badge variant="outline" className="text-xs font-medium" title="Seller schedules delivery; buyer confirms receipt">
                          Seller arranges delivery
                        </Badge>
                      )}
                      {listing!.protectedTransactionEnabled && listing!.protectedTransactionDays ? (
                        <Badge
                          variant="success"
                          className="text-xs font-medium gap-1"
                          title="Protected Transaction: Payments are processed by Stripe. Agchange does not hold funds or condition payouts on delivery. Optional dispute window after delivery; evidence required for disputes."
                        >
                          <Shield className="h-3 w-3" />
                          Protected {listing!.protectedTransactionDays} Days
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {/* Compliance (animals only) */}
                  {isAnimalCategory(listing!.category as any) ? (
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Compliance</div>
                      <div className="mt-2">
                        <ComplianceBadges listing={listing!} variant="inline" />
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* Shipping & Payment Info */}
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="text-base font-bold">
                    {listing!.category === 'whitetail_breeder' ? 'Transfer & Payment' : 'Shipping & Payment'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isAnimalCategory(listing!.category as any) ? (
                    <div className="mb-4 rounded-lg border bg-amber-50/40 dark:bg-amber-950/10 p-4">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Animal listing disclaimer
                      </div>
                      <ul className="mt-2 list-disc ml-5 text-sm text-muted-foreground space-y-1">
                        <li>Agchange does not take custody, possession, or control of animals.</li>
                        <li>Health and legality representations are made solely by the seller.</li>
                        <li>Risk transfers upon delivery or pickup; buyer and seller handle logistics.</li>
                      </ul>
                      <div className="mt-2 text-xs text-muted-foreground">
                        See{' '}
                        <Link href="/legal/buyer-acknowledgment" className="underline underline-offset-4">
                          Buyer Acknowledgment
                        </Link>{' '}
                        and{' '}
                        <Link href="/terms" className="underline underline-offset-4">
                          Terms
                        </Link>
                        .
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 rounded-lg border bg-muted/20 p-4">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Equipment / vehicles disclaimer
                      </div>
                      <ul className="mt-2 list-disc ml-5 text-sm text-muted-foreground space-y-1">
                        <li>Listings are “AS-IS, WHERE-IS.” Agchange provides no warranties.</li>
                        <li>Buyer and seller handle inspection, title/VIN verification, liens, and transfer paperwork.</li>
                      </ul>
                      <div className="mt-2 text-xs text-muted-foreground">
                        See{' '}
                        <Link href="/legal/marketplace-policies" className="underline underline-offset-4">
                          Marketplace Policies
                        </Link>
                        .
                      </div>
                    </div>
                  )}

                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="shipping">
                      <AccordionTrigger className="text-sm">
                        {listing!.category === 'whitetail_breeder' ? 'Transfer & Pickup' : 'Shipping Options'}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm">
                        <div className="space-y-2">
                          <p className="text-muted-foreground">
                            {listing!.category === 'whitetail_breeder'
                              ? 'Transfer/pickup details will be coordinated directly with the seller after purchase and required approvals.'
                              : 'Shipping options will be discussed with the seller after purchase.'}
                          </p>
                          {(listing!.trust?.transportReady || listing!.trust?.sellerOffersDelivery || (listing as any).transportOption === 'SELLER_TRANSPORT') && (
                            <div className="flex items-center gap-2">
                              <Truck className="h-4 w-4 text-primary flex-shrink-0" />
                              <span>
                                {(listing!.trust?.sellerOffersDelivery || (listing as any).transportOption === 'SELLER_TRANSPORT')
                                  ? 'Seller arranges delivery (buyer & seller coordinate directly)'
                                  : 'Delivery/pickup details available (buyer & seller coordinate directly)'}
                              </span>
                            </div>
                          )}
                          {(listing as any).deliveryDetails && ((listing as any).deliveryDetails.maxDeliveryRadiusMiles != null || ((listing as any).deliveryDetails.deliveryTimeframe || '').trim() || ((listing as any).deliveryDetails.deliveryNotes || '').trim()) && (
                            <div className="mt-3 rounded-lg border bg-muted/20 p-3 space-y-1.5">
                              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Seller delivery details</div>
                              {(listing as any).deliveryDetails.maxDeliveryRadiusMiles != null && (
                                <div><span className="text-muted-foreground">Max radius:</span> <span className="font-medium">{(listing as any).deliveryDetails.maxDeliveryRadiusMiles} miles</span></div>
                              )}
                              {((listing as any).deliveryDetails.deliveryTimeframe || '').trim() && (
                                <div><span className="text-muted-foreground">Timeframe:</span> <span className="font-medium">{(listing as any).deliveryDetails.deliveryTimeframe.trim()}</span></div>
                              )}
                              {((listing as any).deliveryDetails.deliveryNotes || '').trim() && (
                                <div><span className="text-muted-foreground">Notes:</span> <span className="font-medium whitespace-pre-wrap">{(listing as any).deliveryDetails.deliveryNotes.trim()}</span></div>
                              )}
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="payment">
                      <AccordionTrigger className="text-sm">Payment Methods</AccordionTrigger>
                      <AccordionContent className="text-sm">
                        <p className="text-muted-foreground">
                          Agchange is a software marketplace. We verify sellers and review required documentation and listings before they go live. Payments are processed by Stripe. Agchange does not hold funds, provide escrow, or condition payouts on delivery.
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Recent sold comps (price discovery loop) - bottom of listing page */}
        <div className="mt-8">
          <Card className="border-2">
            <CardHeader className="pb-4 border-b">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-xl font-bold">Recent sold comps</CardTitle>
                  <div className="text-sm text-muted-foreground mt-1">
                    Similar sold listings in {listing!.location?.state}. Use this to price confidently.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={compsWindowDays === 30 ? 'default' : 'outline'}
                    onClick={() => setCompsWindowDays(30)}
                    className="min-h-[36px] font-semibold"
                  >
                    30d
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={compsWindowDays === 90 ? 'default' : 'outline'}
                    onClick={() => setCompsWindowDays(90)}
                    className="min-h-[36px] font-semibold"
                  >
                    90d
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {soldCompsStats && typeof soldCompsStats.count === 'number' ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comps</div>
                    <div className="text-lg font-extrabold">${(soldCompsStats.count || 0).toLocaleString()}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Median</div>
                    <div className="text-lg font-extrabold">
                      ${(Math.round(soldCompsStats.medianCents) / 100).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">25th</div>
                    <div className="text-lg font-extrabold">
                      ${(Math.round(soldCompsStats.p25Cents) / 100).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">75th</div>
                    <div className="text-lg font-extrabold">
                      ${(Math.round(soldCompsStats.p75Cents) / 100).toLocaleString()}
                    </div>
                  </div>
                </div>
              ) : null}

              {soldCompsLoading ? (
                <div className="text-sm text-muted-foreground">Loading comps…</div>
              ) : soldComps.length === 0 ? (
                <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Not enough sold data yet for this area. Check back soon.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {soldComps.slice(0, 12).map((c) => (
                    <Link
                      key={c.listingId}
                      href={`/listing/${c.listingId}`}
                      className="rounded-lg border hover:bg-muted/20 transition-colors overflow-hidden"
                    >
                      <div className="flex gap-3 p-3">
                        <div className="relative h-16 w-20 rounded-md overflow-hidden bg-muted flex-shrink-0">
                          {c.primaryImageUrl ? (
                            <Image
                              src={c.primaryImageUrl}
                              alt={c.title}
                              fill
                              className="object-cover"
                              sizes="80px"
                              unoptimized
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate">{c.title}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Sold for{' '}
                            <span className="font-semibold text-foreground">
                              ${(Math.round(c.soldPriceCents) / 100).toLocaleString()}
                            </span>
                            {c.soldAt ? (
                              <span>
                                {' '}
                                • {format(new Date(c.soldAt), 'MMM d, yyyy')}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 truncate">
                            {(c.location?.city || '').trim() ? `${c.location.city}, ` : ''}
                            {c.location?.state || ''}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              <div className="flex justify-between gap-2 flex-wrap">
                <Button asChild variant="outline" className="font-semibold">
                  <Link href={soldBrowseUrl}>View more sold</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* High-ticket: Choose payment method (shown only when amount >= $20k) */}
      <AnimalRiskAcknowledgmentDialog
        open={animalAckOpen}
        onOpenChange={setAnimalAckOpen}
        onConfirm={() => {
          setAnimalRiskAcked(true);
          setAnimalAckOpen(false);
          setPaymentDialogOpen(true);
        }}
      />

      <PaymentMethodDialog
        open={paymentDialogOpen}
        onOpenChange={(open) => {
          setPaymentDialogOpen(open);
          if (!open) setPendingCheckout(null);
        }}
        amountUsd={checkoutAmountUsd}
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
        canSwitchBank={eligiblePaymentMethods.includes('ach_debit')}
        canSwitchWire={eligiblePaymentMethods.includes('wire')}
        onRetryCard={() => handleSelectPaymentMethod('card')}
        onSwitchBank={() => handleSelectPaymentMethod('ach_debit')}
        onSwitchWire={() => handleSelectPaymentMethod('wire')}
      />

      <WireInstructionsDialog open={wireDialogOpen} onOpenChange={setWireDialogOpen} data={wireData} />

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      {/* eBay-style bid modal is handled inline in the auction CTA block above */}
    </div>
  );
}
