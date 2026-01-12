'use client';

import { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ImageGallery } from '@/components/listing/ImageGallery';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { insuranceTiers } from '@/lib/mock-data';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/use-favorites';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { BidHistory } from '@/components/auction/BidHistory';
import { BidIncrementCalculator } from '@/components/auction/BidIncrementCalculator';
import { EnhancedSellerProfile } from '@/components/listing/EnhancedSellerProfile';
import { KeyFactsPanel } from '@/components/listing/KeyFactsPanel';
import { RelatedListings } from '@/components/listing/RelatedListings';
import { ListingActivityMetrics } from '@/components/listing/ListingActivityMetrics';
import { Share2, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getListingById } from '@/lib/firebase/listings';
import { Listing } from '@/lib/types';

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;
  
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [selectedInsurance, setSelectedInsurance] = useState<string>('');
  const [includeVerification, setIncludeVerification] = useState(false);
  const [showBidDialog, setShowBidDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const { toast } = useToast();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { addToListing: addToRecentlyViewed } = useRecentlyViewed();
  const isFavorited = listing ? isFavorite(listing.id) : false;

  // Fetch listing from Firestore
  useEffect(() => {
    async function fetchListing() {
      if (!listingId) return;
      try {
        setLoading(true);
        setError(null);
        const data = await getListingById(listingId);
        if (!data) {
          setError('Listing not found');
          return;
        }
        setListing(data);
      } catch (err: any) {
        console.error('Error fetching listing:', err);
        // Handle permission denied gracefully
        if (err?.code === 'permission-denied' || err?.message?.includes('permission')) {
          setError('This listing is not available. You may not have permission to view it.');
        } else {
          setError(err?.message || 'Failed to load listing');
        }
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [listingId]);

  // Track recently viewed listing (only when listingId changes)
  useEffect(() => {
    if (listingId && listing) {
      addToRecentlyViewed(listingId);
    }
  }, [listingId, listing, addToRecentlyViewed]);

  // Loading State
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

  // Error State
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

  const handlePlaceBid = async () => {
    if (!bidAmount || isNaN(parseFloat(bidAmount))) {
      toast({
        title: 'Invalid bid amount',
        description: 'Please enter a valid bid amount.',
        variant: 'destructive',
      });
      return;
    }

    setIsPlacingBid(true);
    // TODO: Implement bid placement in Phase 2
    setTimeout(() => {
      toast({
        title: 'Bid placed successfully',
        description: `Your bid of $${parseFloat(bidAmount).toLocaleString()} has been placed.`,
      });
      setShowBidDialog(false);
      setShowConfirmDialog(false);
      setBidAmount('');
      setIsPlacingBid(false);
    }, 1000);
  };

  const handleBuyNow = () => {
    // TODO: Implement buy now in Phase 2 (orders/payments)
    toast({
      title: 'Coming soon',
      description: 'Buy now functionality will be available soon.',
    });
  };

  const handleAddToWatchlist = () => {
    toggleFavorite(listing.id);
    toast({
      title: isFavorited ? 'Removed from watchlist' : 'Added to watchlist',
      description: isFavorited 
        ? 'This listing has been removed from your watchlist.'
        : 'This listing has been added to your watchlist.',
    });
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: listing.title,
        text: listing.description,
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

  const currentPrice = listing.type === 'auction' 
    ? (listing.currentBid || listing.startingBid || 0)
    : (listing.price || 0);

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

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Hero Section - Full Width Image Gallery */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <ImageGallery images={listing.images} title={listing.title} />
        </motion.div>

        {/* Main Content Grid - Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Main Content (8 columns on desktop, full width on mobile) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Header Section - Title, Badges, Actions */}
            <div className="space-y-4">
            {/* Title Row */}
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-3 leading-tight break-words">{listing.title}</h1>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <Badge variant="outline" className="text-sm font-medium">{listing.category}</Badge>
                  <Badge variant="outline" className="text-sm font-medium capitalize">{listing.type}</Badge>
                  {listing.featured && (
                    <Badge variant="default" className="gap-1 font-medium">
                      <Sparkles className="h-3 w-3" />
                      Featured
                    </Badge>
                  )}
                  {/* Social Proof Badges */}
                  <Badge variant="secondary" className="text-xs">
                    <Eye className="h-3 w-3 mr-1" />
                    {listing.metrics?.views || 0} views
                  </Badge>
                  {listing.metrics?.favorites > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      <Heart className="h-3 w-3 mr-1" />
                      {listing.metrics.favorites} watching
                    </Badge>
                  )}
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
                  className={cn('h-10 w-10', isFavorited && 'text-destructive border-destructive')}
                  title={isFavorited ? 'Remove from watchlist' : 'Add to watchlist'}
                >
                  <Heart className={cn('h-4 w-4', isFavorited && 'fill-current')} />
                </Button>
              </div>
            </div>

            {/* Price - Prominent Display */}
            <Card className="border-2 bg-gradient-to-br from-primary/5 via-card to-card">
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {listing.type === 'auction' ? 'Current Bid' : 'Price'}
                  </div>
                  <div className="flex items-baseline gap-2 sm:gap-3 flex-wrap">
                    <span className="text-4xl sm:text-5xl md:text-6xl font-extrabold">
                      ${currentPrice.toLocaleString()}
                    </span>
                    {listing.type === 'auction' && listing.currentBid && (
                      <span className="text-lg text-muted-foreground">
                        ({listing.currentBid ? 'Current' : 'Starting'} Bid)
                      </span>
                    )}
                  </div>
                  {listing.type === 'auction' && listing.startingBid && (
                    <div className="text-sm text-muted-foreground">
                      Starting bid: <span className="font-semibold">${listing.startingBid.toLocaleString()}</span>
                      {listing.reservePrice && (
                        <span className="ml-2">• Reserve: ${listing.reservePrice.toLocaleString()}</span>
                      )}
                    </div>
                  )}
                  {listing.type === 'fixed' && listing.price && (
                    <div className="text-sm text-muted-foreground">
                      Fixed price listing
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Bidding Section - Below Price (Mobile Only) */}
            <div className="lg:hidden">
              {listing.type === 'auction' && listing.endsAt && new Date(listing.endsAt) > new Date() && (
                <Card className="border-2">
                  <CardHeader className="pb-4 border-b">
                    <CardTitle className="text-lg font-bold">Place Your Bid</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    {/* Countdown Timer - Prominent */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        ⏰ Time Remaining
                      </div>
                      <CountdownTimer endDate={listing.endsAt} variant="default" />
                    </div>

                    <Separator />

                    {/* Bid Calculator */}
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Quick Bid Amounts
                      </div>
                      <BidIncrementCalculator
                        currentBid={listing.currentBid || listing.startingBid || 0}
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
                          Minimum bid: ${((listing.currentBid || listing.startingBid || 0) + 100).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="auto-bid-mobile"
                          checked={includeVerification}
                          onCheckedChange={(checked) => setIncludeVerification(checked as boolean)}
                        />
                        <Label htmlFor="auto-bid-mobile" className="text-sm cursor-pointer">
                          Enable auto-bidding (max bid)
                        </Label>
                      </div>
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
              {listing.type !== 'auction' && (
                <Card className="border-2">
                  <CardContent className="pt-6">
                    {listing.type === 'fixed' && (
                      <Button 
                        size="lg" 
                        onClick={handleBuyNow} 
                        className="w-full min-h-[52px] text-base font-bold shadow-lg"
                      >
                        <ShoppingCart className="mr-2 h-5 w-5" />
                        Buy Now - ${listing.price?.toLocaleString()}
                      </Button>
                    )}
                    {listing.type === 'classified' && (
                      <Button 
                        size="lg" 
                        variant="outline" 
                        className="w-full min-h-[52px] text-base font-bold border-2"
                      >
                        <MessageCircle className="mr-2 h-5 w-5" />
                        Contact Seller
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Bid History - For Auctions (Mobile Only, Below Bidding Section) */}
              {listing.type === 'auction' && (
                <BidHistory
                  currentBid={listing.currentBid || listing.startingBid || 0}
                  startingBid={listing.startingBid || 0}
                />
              )}
            </div>
          </div>

          {/* Key Facts - Quick Reference */}
          <KeyFactsPanel listing={listing} />

          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-foreground leading-relaxed text-base">
                {listing.description}
              </p>
            </CardContent>
          </Card>

          {/* Seller Profile - Trust & Credibility */}
          <EnhancedSellerProfile listing={listing} />

          {/* Activity Metrics - Social Proof */}
          <ListingActivityMetrics 
            views={listing.metrics?.views || 0}
            favorites={listing.metrics?.favorites || 0}
            bids={listing.metrics?.bidCount || 0}
            watchers={Math.floor((listing.metrics?.favorites || 0) * 0.3)}
            inquiries={0}
          />

          {/* Location & Trust Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Location & Trust</CardTitle>
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
                    <div className="font-medium">{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</div>
                    {listing.location?.zip && (
                      <div className="text-sm text-muted-foreground">ZIP: {listing.location.zip}</div>
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
                  verified={listing.trust?.verified || false}
                  insurance={listing.trust?.insuranceAvailable || false}
                  transport={listing.trust?.transportReady || false}
                  size="md"
                />
              </div>
            </CardContent>
          </Card>

          {/* Shipping & Payment Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shipping & Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="shipping">
                  <AccordionTrigger className="text-sm">Shipping Options</AccordionTrigger>
                  <AccordionContent className="text-sm">
                    <div className="space-y-2">
                      <p className="text-muted-foreground">
                        Shipping options will be discussed with the seller after purchase.
                      </p>
                      {listing.trust?.transportReady && (
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-primary" />
                          <span>Seller can help arrange transport</span>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="payment">
                  <AccordionTrigger className="text-sm">Payment Methods</AccordionTrigger>
                  <AccordionContent className="text-sm">
                    <p className="text-muted-foreground">
                      Payment methods will be discussed with the seller. Common methods include wire transfer, check, or escrow services.
                    </p>
                  </AccordionContent>
                </AccordionItem>
                {listing.trust?.insuranceAvailable && (
                  <AccordionItem value="insurance">
                    <AccordionTrigger className="text-sm">Insurance Options</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        {insuranceTiers.map((tier) => (
                          <div key={tier.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium text-sm">{tier.name}</p>
                              <p className="text-xs text-muted-foreground">{tier.description}</p>
                            </div>
                            <span className="font-semibold">${tier.price}</span>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            </CardContent>
          </Card>

          {/* Right Sidebar - Desktop Only (4 columns, Sticky) */}
          <div className="hidden lg:block lg:col-span-4">
            <div className="lg:sticky lg:top-24 space-y-4 sm:space-y-6">
                  {/* Desktop Action Card */}
                  <Card className="border-2 shadow-xl bg-card">
                    <CardHeader className="pb-4 border-b">
                      <CardTitle className="text-lg font-bold">Purchase Options</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                      {/* Price Summary */}
                      <div className="space-y-2 pb-4 border-b">
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            {listing.type === 'auction' ? 'Current Bid' : 'Price'}
                          </span>
                          <span className="text-3xl font-bold">
                            ${currentPrice.toLocaleString()}
                          </span>
                        </div>
                        {listing.type === 'auction' && listing.startingBid && (
                          <div className="text-xs text-muted-foreground">
                            Starting: ${listing.startingBid.toLocaleString()}
                          </div>
                        )}
                      </div>

                      {/* Countdown - Very Prominent for Auctions */}
                      {listing.type === 'auction' && listing.endsAt && (
                        <div className="space-y-3 pb-4 border-b">
                          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                            ⏰ Time Remaining
                          </div>
                          <CountdownTimer endDate={listing.endsAt} variant="default" />
                        </div>
                      )}

                      {/* Primary CTA Button - Large & Prominent */}
                      {listing.type === 'auction' && listing.endsAt && new Date(listing.endsAt) > new Date() && (
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
                                Enter your bid amount. Minimum bid: ${((listing.currentBid || listing.startingBid || 0) + 100).toLocaleString()}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="bid-amount">Bid Amount</Label>
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
                                currentBid={listing.currentBid || listing.startingBid || 0}
                                onBidChange={(amount) => setBidAmount(amount.toString())}
                              />
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id="auto-bid"
                                  checked={includeVerification}
                                  onCheckedChange={(checked) => setIncludeVerification(checked as boolean)}
                                />
                                <Label htmlFor="auto-bid" className="text-sm cursor-pointer">
                                  Enable auto-bidding (max bid)
                                </Label>
                              </div>
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

                      {listing.type === 'fixed' && (
                        <Button 
                          size="lg" 
                          onClick={handleBuyNow} 
                          className="w-full min-h-[52px] sm:min-h-[60px] text-base sm:text-lg font-bold shadow-lg hover:shadow-xl transition-all bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
                        >
                          <ShoppingCart className="mr-2 h-5 w-5" />
                          Buy Now
                        </Button>
                      )}

                      {listing.type === 'classified' && (
                        <Button 
                          size="lg" 
                          variant="outline" 
                          className="w-full min-h-[52px] sm:min-h-[60px] text-base sm:text-lg font-bold border-2"
                        >
                          <MessageCircle className="mr-2 h-5 w-5" />
                          Contact Seller
                        </Button>
                      )}

                      {/* Watch Button - Secondary Action */}
                      <Button
                        variant="outline"
                        onClick={handleAddToWatchlist}
                        className={cn('w-full', isFavorited && 'border-destructive text-destructive')}
                      >
                        <Heart className={cn('mr-2 h-4 w-4', isFavorited && 'fill-current')} />
                        {isFavorited ? 'Watching' : 'Watch This Listing'}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
          </div>
        </div>

      </div>

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
              <p className="font-semibold">{listing.title}</p>
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
