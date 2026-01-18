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
import { RelatedListings } from '@/components/listing/RelatedListings';
import { OfferPanel } from '@/components/offers/OfferPanel';
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
import { getEligiblePaymentMethods } from '@/lib/payments/gating';

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
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;
  
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [selectedInsurance, setSelectedInsurance] = useState<string>('');
  const [showBidDialog, setShowBidDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const [isWinningBidder, setIsWinningBidder] = useState(false);
  const [winningBidAmount, setWinningBidAmount] = useState<number | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<{ amountUsd: number } | null>(null);
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

  const watchingCount = useMemo(() => {
    const n = Number(listing?.watcherCount ?? listing?.metrics?.favorites ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [listing?.watcherCount, listing?.metrics?.favorites]);

  const checkoutAmountUsd = useMemo(() => {
    if (pendingCheckout?.amountUsd && Number.isFinite(pendingCheckout.amountUsd)) return pendingCheckout.amountUsd;
    if (!listing) return 0;
    if (listing.type === 'fixed') return Number(listing.price || 0) || 0;
    if (listing.type === 'auction') return Number(winningBidAmount || listing.currentBid || listing.startingBid || 0) || 0;
    return 0;
  }, [pendingCheckout?.amountUsd, listing, winningBidAmount]);

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

  const minBidUsd = useMemo(() => {
    if (!listing) return 0;
    const base = Number(listing.currentBid || listing.startingBid || 0) || 0;
    if (base <= 0) return Number(listing.startingBid || 0) || 0;
    const inc = Math.max(base * 0.05, 50);
    return Math.ceil(base + inc);
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

    // Validate bid is higher than current bid
    const currentBid = listing!.currentBid || listing!.startingBid || 0;
    if (amount <= currentBid) {
      toast({
        title: 'Bid too low',
        description: `Your bid must be higher than the current bid of $${currentBid.toLocaleString()}.`,
        variant: 'destructive',
      });
      return;
    }

    setIsPlacingBid(true);

    try {
      const result = await placeBidServer({ listingId, amount });
      if (!result.ok) {
        throw new Error(result.error);
      }

      // Success - update local state optimistically
      setListing({
        ...listing!,
        currentBid: result.newCurrentBid,
        metrics: {
          ...listing!.metrics,
          bidCount: (listing!.metrics.bidCount || 0) + 1,
        },
      });

      toast({
        title: 'Bid placed successfully',
        description: `Your bid of $${amount.toLocaleString()} has been placed.`,
      });

      setShowBidDialog(false);
      setShowConfirmDialog(false);
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

    // Do NOT check seller Stripe status client-side.
    // Buyers cannot read seller `/users/{uid}` (private fields like stripeAccountId), and `publicProfiles`
    // intentionally excludes Stripe IDs. The server-side checkout route (Admin SDK) is the source of truth.
    const price = Number(listing!.price || 0);
    setPendingCheckout({ amountUsd: Number.isFinite(price) ? price : 0 });
    setPaymentDialogOpen(true);
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
    if (listing!.status !== 'active' && listing!.status !== 'sold') {
      toast({
        title: 'Listing not available',
        description: `This listing is ${listing!.status} and cannot be purchased.`,
        variant: 'destructive',
      });
      return;
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
      setPaymentDialogOpen(true);
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
    try {
      setPaymentDialogOpen(false);
      setIsPlacingBid(true);
      // Client-side eligibility guard for nicer UX (server also enforces).
      if (method !== 'card' && !eligiblePaymentMethods.includes(method as any)) {
        throw new Error(
          method === 'ach_debit'
            ? 'ACH debit is only available for eligible orders (verified email + minimum total).'
            : 'Wire transfer is only available for eligible orders (verified email + minimum total).'
        );
      }
      if (method === 'wire') {
        const { createWireIntent } = await import('@/lib/stripe/api');
        const out = await createWireIntent(listing.id);
        setWireData(out);
        setWireDialogOpen(true);
      } else {
        const { createCheckoutSession } = await import('@/lib/stripe/api');
        const { url } = await createCheckoutSession(listing.id, undefined, method);
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
      setIsPlacingBid(false);
    } finally {
      setPendingCheckout(null);
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
      router.push(`/dashboard/messages?listingId=${listing.id}&sellerId=${listing.sellerId}`);
    } catch (error: any) {
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
    <div className="min-h-screen bg-background">
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
        <div className="mb-5 md:mb-6">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="outline" className="text-sm font-medium">{listing!.category}</Badge>
                <Badge variant="outline" className="text-sm font-medium capitalize">{listing!.type}</Badge>
                {listing!.featured && (
                  <Badge variant="default" className="gap-1 font-medium">
                    <Sparkles className="h-3 w-3" />
                    Featured
                  </Badge>
                )}
                {listing!.protectedTransactionEnabled && listing!.protectedTransactionDays && (
                  <Badge
                    variant="default"
                    className="bg-green-600 text-white font-medium gap-1"
                    title="Protected Transaction: Funds held in escrow until protection period ends or buyer accepts early. Evidence required for disputes."
                  >
                    <Shield className="h-3 w-3" />
                    Protected {listing!.protectedTransactionDays} Days
                  </Badge>
                )}
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
                {listing!.category === 'ranch_equipment' && (listing!.attributes as any)?.condition ? (
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
                className="h-10 w-10"
                title="Share listing"
              >
                <Share2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleAddToWatchlist}
                className={cn('h-10 w-10', isFavorite(listing!.id) && 'text-destructive border-destructive')}
                title={isFavorite(listing!.id) ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                <Heart className={cn('h-4 w-4', isFavorite(listing!.id) && 'fill-current')} />
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content Grid - Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Column - Main Content (7 columns on desktop, full width on mobile) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Image Gallery */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <ImageGallery images={listing!.images} title={listing!.title} />
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
                    {/* Countdown Timer - Prominent */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        ⏰ Time Remaining
                      </div>
                      <CountdownTimer endDate={endsAtDate || undefined} variant="default" />
                    </div>

                    <Separator />

                    {/* Bid Calculator */}
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Quick Bid Amounts
                      </div>
                      <BidIncrementCalculator
                        currentBid={listing!.currentBid || listing!.startingBid || 0}
                        onBidChange={(amount) => setBidAmount(amount.toString())}
                      />
                    </div>

                    <Separator />

                    {/* Bid Input & Button */}
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="bid-amount-mobile" className="text-sm font-semibold mb-2 block">
                          Enter Your Bid Amount
                        </Label>
                        <Input
                          id="bid-amount-mobile"
                          type="number"
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          placeholder="0.00"
                          className="text-lg h-12"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Minimum bid: ${minBidUsd.toLocaleString()}
                        </p>
                      </div>
                      <AutoBidPanel
                        auctionId={listing!.id}
                        currentBidUsd={listing!.currentBid || listing!.startingBid || 0}
                        currentHighBidderId={listing!.currentBidderId || null}
                      />
                      <Button
                        onClick={() => {
                          setShowBidDialog(false);
                          setShowConfirmDialog(true);
                        }}
                        className="w-full min-h-[52px] text-base font-bold shadow-lg"
                        disabled={!bidAmount || isNaN(parseFloat(bidAmount))}
                        size="lg"
                      >
                        <Gavel className="mr-2 h-5 w-5" />
                        Place Bid
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Buy Now / Contact Seller - For Fixed/Classified (Mobile Only) */}
              {!isSold && listing!.type !== 'auction' && (
                <Card className="border-2">
                  <CardContent className="pt-6">
                    {listing!.type === 'fixed' && (
                      <Button 
                        size="lg" 
                        onClick={handleBuyNow}
                        disabled={isPlacingBid || listing!.status !== 'active' || !!(listing as any).offerReservedByOfferId}
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
                            {(listing as any).offerReservedByOfferId ? 'Reserved' : `Buy Now - $${listing!.price?.toLocaleString()}`}
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
                  {listing!.category === 'ranch_equipment' && (
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
                    {listing!.type === 'auction' && listing!.startingBid ? (
                      <div className="text-xs text-muted-foreground">
                        Starting bid: ${listing!.startingBid.toLocaleString()}
                      </div>
                    ) : null}
                    {(listing as any)?.offerReservedByOfferId ? (
                      <div className="text-xs font-semibold text-destructive">
                        Reserved by an accepted offer
                      </div>
                    ) : null}
                  </div>

                  {/* eBay-style details: condition / location / transport / payments */}
                  <div className="space-y-2.5 text-sm">
                    {listing!.category === 'ranch_equipment' && (listing!.attributes as any)?.condition ? (
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
                          {listing!.trust?.transportReady
                            ? 'Seller can help coordinate transport. Buyer & seller arrange logistics after purchase.'
                            : 'Buyer & seller arrange logistics after purchase.'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold">Payments</div>
                        <div className="text-xs text-muted-foreground">
                          Checkout supports card payments; for high-ticket purchases we recommend bank transfer. Funds are held until delivery confirmation.
                        </div>
                      </div>
                    </div>

                    {listing!.protectedTransactionEnabled && listing!.protectedTransactionDays ? (
                      <div className="flex items-start gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold">Protected Transaction</div>
                          <div className="text-xs text-muted-foreground">
                            Enabled ({listing!.protectedTransactionDays} days). Funds release after delivery/acceptance requirements are met.
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <Separator />

                      {/* Countdown - Very Prominent for Auctions */}
                      {!isSold && listing!.type === 'auction' && endsAtDate && (
                        <div className="space-y-3">
                          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Time remaining</div>
                          <CountdownTimer endDate={endsAtDate} variant="default" />
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
                            disabled={isPlacingBid}
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
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Place Your Bid</DialogTitle>
                              <DialogDescription>
                                Enter your max bid (proxy bidding). Minimum: ${minBidUsd.toLocaleString()}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="bid-amount">Max Bid</Label>
                                <Input
                                  id="bid-amount"
                                  type="number"
                                  value={bidAmount}
                                  onChange={(e) => setBidAmount(e.target.value)}
                                  placeholder="0.00"
                                  className="mt-1 text-lg"
                                />
                              </div>
                              <BidIncrementCalculator
                                currentBid={listing!.currentBid || listing!.startingBid || 0}
                                onBidChange={(amount) => setBidAmount(amount.toString())}
                              />
                              <AutoBidPanel
                                auctionId={listing!.id}
                                currentBidUsd={listing!.currentBid || listing!.startingBid || 0}
                                currentHighBidderId={listing!.currentBidderId || null}
                              />
                              <Button
                                onClick={() => {
                                  setShowBidDialog(false);
                                  setShowConfirmDialog(true);
                                }}
                                className="w-full"
                                disabled={!bidAmount || isNaN(parseFloat(bidAmount))}
                                size="lg"
                              >
                                Continue to Confirmation
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}

                      {!isSold && listing!.type === 'fixed' && (
                        <Button 
                          size="lg" 
                          onClick={handleBuyNow}
                          disabled={isPlacingBid || listing!.status !== 'active' || !!(listing as any).offerReservedByOfferId}
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
                              {(listing as any).offerReservedByOfferId ? 'Reserved' : 'Buy Now'}
                            </>
                          )}
                        </Button>
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
                    <Heart className={cn('mr-2 h-4 w-4', isFavorite(listing!.id) && 'fill-current')} />
                    {isFavorite(listing!.id) ? 'Watching' : 'Watch This Listing'}
                  </Button>

                  {watchingCount > 0 ? (
                    <div className="text-xs text-muted-foreground text-center -mt-1">
                      {watchingCount === 1
                        ? '1 person is watching this listing.'
                        : `${watchingCount.toLocaleString()} people are watching this listing.`}
                    </div>
                  ) : null}
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
                        This is a live, captive-bred whitetail breeder animal offered by the seller (not Wildlife Exchange).
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
                        <span className="font-semibold">Escrow & payout gating:</span>{' '}
                        Funds are held in escrow. Payout is released only after delivery/acceptance requirements are met, and after TPWD Transfer Approval is uploaded and verified.
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
                      Wildlife Exchange is a marketplace platform. Wildlife Exchange does not own, sell, transport, or transfer animals.
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
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      📍 Location
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-medium">{listing!.location?.city || 'Unknown'}, {listing!.location?.state || 'Unknown'}</div>
                        {listing!.location?.zip && (
                          <div className="text-sm text-muted-foreground">ZIP: {listing!.location.zip}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Trust Badges */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      🛡️ Trust & Safety
                    </div>
                    <TrustBadges
                      verified={listing!.trust?.verified || false}
                      transport={listing!.trust?.transportReady || false}
                      size="md"
                    />
                  </div>

                  {/* Compliance Badges (for animal listings) */}
                  {['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock'].includes(listing!.category) && (
                    <div className="pt-4 border-t">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        ✅ Compliance Status
                      </div>
                      <ComplianceBadges listing={listing!} />
                    </div>
                  )}
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
                          {listing!.trust?.transportReady && (
                            <div className="flex items-center gap-2">
                              <Truck className="h-4 w-4 text-primary" />
                              <span>
                                {listing!.category === 'whitetail_breeder'
                                  ? 'Seller can help coordinate delivery/transport (buyer & seller arranged)'
                                  : 'Seller can help arrange transport'}
                              </span>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="payment">
                      <AccordionTrigger className="text-sm">Payment Methods</AccordionTrigger>
                      <AccordionContent className="text-sm">
                        <p className="text-muted-foreground">
                          Checkout supports card payments, and for high-ticket purchases we recommend bank transfer. Funds are held until delivery confirmation.
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

      </div>

      {/* High-ticket: Choose payment method (shown only when amount >= $20k) */}
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

      {/* Bid Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Your Bid</DialogTitle>
            <DialogDescription>
              You are about to place a bid of ${bidAmount ? parseFloat(bidAmount).toLocaleString() : '0'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Listing</p>
              <p className="font-semibold">{listing!.title}</p>
              <p className="text-sm text-muted-foreground mt-2 mb-1">Your Bid</p>
              <p className="text-2xl font-bold">${bidAmount ? parseFloat(bidAmount).toLocaleString() : '0'}</p>
            </div>
            <Button
              onClick={handlePlaceBid}
              className="w-full"
              disabled={isPlacingBid}
              size="lg"
            >
              {isPlacingBid ? 'Placing Bid...' : 'Confirm Bid'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              className="w-full"
              disabled={isPlacingBid}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
