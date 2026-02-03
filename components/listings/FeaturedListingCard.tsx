'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { MapPin, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Listing } from '@/lib/types';
import { getSoldSummary } from '@/lib/listings/sold';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { getDeliveryTimeframeLabel } from '@/components/browse/filters/constants';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { FavoriteButton } from '@/components/listings/FavoriteButton';
import { cn } from '@/lib/utils';
import { MOTION } from '@/lib/motion';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';

interface FeaturedListingCardProps {
  listing: Listing;
  className?: string;
  index?: number;
  /** When set, overrides per-listing aspect ratio for uniform card sizes in grids */
  fixedImageAspect?: number;
}

export const FeaturedListingCard = forwardRef<HTMLDivElement, FeaturedListingCardProps>(
  ({ listing, className, index = 0, fixedImageAspect }, ref) => {
  const router = useRouter();
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();
  const sold = getSoldSummary(listing);
  const sellerTxCount = typeof listing.sellerSnapshot?.completedSalesCount === 'number' ? listing.sellerSnapshot.completedSalesCount : null;
  const sellerBadges = Array.isArray(listing.sellerSnapshot?.badges) ? listing.sellerSnapshot!.badges! : [];
  const sellerName = listing.sellerSnapshot?.displayName || 'Seller';
  const sellerInitial = String(sellerName || 'S').trim().slice(0, 1).toUpperCase();
  const rawSellerPhoto = listing.sellerSnapshot?.photoURL ?? '';
  const sellerPhotoUrl = typeof rawSellerPhoto === 'string' && rawSellerPhoto.trim().startsWith('http') ? rawSellerPhoto.trim() : '';

  const priceDisplay = listing.type === 'auction'
    ? listing.currentBid
      ? `$${listing.currentBid.toLocaleString()}`
      : `Starting: $${listing.startingBid?.toLocaleString() || '0'}`
    : listing.type === 'fixed'
    ? `$${listing.price?.toLocaleString() || '0'}`
    : `$${listing.price?.toLocaleString() || 'Contact'}`;

  const endsAtMs = listing.endsAt instanceof Date ? listing.endsAt.getTime() : null;
  const auctionEnded = typeof endsAtMs === 'number' && endsAtMs <= Date.now();
  const isCurrentHighBidder = Boolean(
    user?.uid &&
    listing.type === 'auction' &&
    !sold.isSold &&
    !auctionEnded &&
    listing.currentBidderId === user.uid
  );

  const hasCountdown = !sold.isSold && listing.type === 'auction' && !!listing.endsAt;
  const cover = listing.photos?.[0];
  const coverUrl = cover?.url || listing.images?.[0] || '';
  const quantity = (() => {
    const q = (listing as any)?.attributes?.quantity;
    const n = typeof q === 'number' ? q : Number(q);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const coverObjectPosition =
    cover?.focalPoint && typeof cover.focalPoint.x === 'number' && typeof cover.focalPoint.y === 'number'
      ? `${Math.max(0, Math.min(1, cover.focalPoint.x)) * 100}% ${Math.max(0, Math.min(1, cover.focalPoint.y)) * 100}%`
      : undefined;
  const coverCropZoom =
    typeof (cover as any)?.cropZoom === 'number' && Number.isFinite((cover as any).cropZoom)
      ? Math.max(1, Math.min(3, Number((cover as any).cropZoom)))
      : 1;
  const coverAspect =
    typeof fixedImageAspect === 'number' && Number.isFinite(fixedImageAspect)
      ? fixedImageAspect
      : typeof (cover as any)?.cropAspect === 'number' && Number.isFinite((cover as any).cropAspect)
        ? (cover as any).cropAspect
        : 4 / 3;

  return (
    <motion.div
      ref={ref}
      initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { duration: MOTION.durationNormal, ease: MOTION.easeOut, delay: index < 12 ? index * 0.04 : 0 }
      }
      whileHover={reducedMotion ? undefined : { y: -8 }}
      // Mobile: allow vertical scrolling even when the gesture starts on the card/image.
      className={cn('group touch-manipulation md:touch-auto', className)}
    >
      <Link href={`/listing/${listing.id}`} className="block h-full">
        <Card className={cn(
          'overflow-hidden transition-all duration-300',
          'flex flex-col h-full',
          'border border-border/50 bg-card',
          'hover:border-border/70 hover:shadow-lifted hover:-translate-y-0.5',
          'relative',
          className
        )}>
          {/* Featured Badge - High Contrast for Light & Dark Mode */}
          <div className="hidden sm:block absolute top-3 left-3 z-20">
            <Badge 
              className={cn(
                // Light mode: Darker sage background (HSL 90, 18%, 35%) with white text for maximum contrast
                'bg-[hsl(90,18%,35%)] text-white',
                'border-2 border-[hsl(90,18%,35%)]',
                'font-bold px-3 py-1.5 shadow-lg shadow-black/40',
                'flex items-center gap-1.5',
                'backdrop-blur-sm',
                // Dark mode: Primary (Olive) with proper foreground
                'dark:bg-primary dark:text-primary-foreground dark:border-primary/80 dark:shadow-primary/40'
              )}
            >
              <Sparkles className="h-3.5 w-3.5 fill-current" />
              <span className="font-extrabold">Featured</span>
            </Badge>
          </div>

          {/* Image - aspect follows crop (portrait/landscape/square) so vertical photos fit whole animal */}
          <div
            className="relative w-full bg-muted overflow-hidden rounded-t-xl"
            style={{ aspectRatio: String(coverAspect) }}
          >
            {/* Subtle bottom overlay gradient - always visible for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-background/20 to-transparent z-10" />
            {sold.isSold && <div className="absolute inset-0 bg-black/25 z-[11]" />}

            {/* Action Buttons - Always visible and consistent with browse/home cards */}
            <div className="absolute top-2 right-2 z-30 flex gap-2 opacity-100 transition-opacity duration-300">
              <FavoriteButton listingId={listing.id} className="bg-card/95 backdrop-blur-sm border border-border/50" />
            </div>
            
            {coverUrl ? (
              <div className="absolute inset-0 overflow-hidden">
                <div
                  className="absolute inset-0 transition-transform duration-500"
                  style={{
                    transform: `scale(${coverCropZoom})`,
                    transformOrigin: coverObjectPosition || '50% 50%',
                  }}
                >
                  <Image
                    src={coverUrl}
                    alt={listing.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                    style={coverObjectPosition ? { objectPosition: coverObjectPosition } : undefined}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    priority={index < 2}
                  />
                </div>
              </div>
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 mx-auto rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">Premium Listing</span>
                </div>
              </div>
            )}

            {/* Real-time countdown timer for auctions - placed to avoid action buttons */}
            {hasCountdown && (
              <div className="absolute top-2 left-2 sm:top-14 sm:left-3 z-20">
                <CountdownTimer
                  endsAt={listing.endsAt}
                  variant="badge"
                  showIcon={true}
                  pulseWhenEndingSoon={true}
                  className="text-xs px-3 py-1.5"
                />
              </div>
            )}

            {/* Type badge - Enhanced */}
            <div className="hidden sm:block absolute bottom-3 right-3 z-20">
              <Badge 
                variant="outline" 
                className="backdrop-blur-sm bg-card/80 border-border/50 font-semibold text-xs px-3 py-1.5 shadow-warm"
              >
                {listing.type === 'auction' ? 'Auction' : listing.type === 'fixed' ? 'Buy Now' : 'Classified'}
              </Badge>
            </div>


            {/* Mobile: bids count (Protected moved to content next to delivery) */}
            {!sold.isSold && listing.type === 'auction' && (listing as any)?.metrics?.bidCount > 0 ? (
              <div className="sm:hidden absolute bottom-2 left-2 z-20">
                <Badge variant="secondary" className="bg-card/80 backdrop-blur-sm border-border/50 text-xs shadow-warm">
                  {(listing as any)?.metrics?.bidCount} bids
                </Badge>
              </div>
            ) : null}

            {/* Subtle shimmer effect - warm tones */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-parchment/8 to-transparent z-5" />
          </div>

          {/* Content with Premium Styling */}
          <div className="p-3 sm:p-5 flex-1 flex flex-col gap-2 sm:gap-4 min-w-0">
            {/* Title – line-clamp-4, flex-shrink-0 so longer titles aren’t cut off in gallery mode */}
            <h3
              className="font-bold text-base sm:text-lg leading-tight line-clamp-4 group-hover:text-primary transition-colors duration-300 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text min-w-0 break-words flex-shrink-0"
              title={listing.title}
            >
              {listing.title}
            </h3>

            {/* Location with enhanced icon */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="font-medium">{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</span>
            </div>

            {/* Reserved (offer accepted) - keep it under location for gallery cards */}
            {!sold.isSold && (listing as any)?.offerReservedByOfferId ? (
              <div className="hidden sm:block -mt-2">
                <Badge
                  variant="secondary"
                  className="bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30 text-xs font-semibold"
                  title="Reserved by an accepted offer"
                >
                  Reserved (offer accepted)
                </Badge>
              </div>
            ) : null}

            {/* Trust Badges + Protected - inline to avoid overlap in gallery (delivery 1-3 next to Protected 7 Days) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <TrustBadges
                verified={listing.trust?.verified}
                transport={!!(listing.trust?.transportReady || listing.trust?.sellerOffersDelivery || (listing as any).transportOption === 'SELLER_TRANSPORT')}
                deliveryWindowLabel={getDeliveryTimeframeLabel((listing as any).deliveryDetails?.deliveryTimeframe)}
                size="sm"
                className="flex-wrap gap-1.5"
              />
              {listing.protectedTransactionEnabled && listing.protectedTransactionDays && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-white text-[11px] font-semibold shadow-warm border-0',
                    listing.protectedTransactionDays === 3 && 'bg-blue-400 hover:bg-blue-400',
                    listing.protectedTransactionDays === 7 && 'bg-violet-400 hover:bg-violet-400',
                    listing.protectedTransactionDays === 14 && 'bg-violet-500 hover:bg-violet-500',
                    ![3, 7, 14].includes(listing.protectedTransactionDays) && 'bg-violet-400 hover:bg-violet-400'
                  )}
                  title="Protected Transaction"
                >
                  Protected {listing.protectedTransactionDays} Days
                </Badge>
              )}
            </div>

            {/* Price and Seller Info - Enhanced */}
            <div className="mt-auto pt-3 sm:pt-4 border-t border-border/50 overflow-hidden">
              <div className="flex items-center justify-between gap-3 min-w-0 overflow-hidden">
                <div className="space-y-1 flex-shrink-0 min-w-0 overflow-hidden sm:max-w-[65%]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={cn(
                        'font-bold truncate',
                        sold.isSold
                          ? 'text-sm sm:text-base text-emerald-600 dark:text-emerald-400'
                          : cn(
                              'text-2xl',
                              isCurrentHighBidder
                                ? 'text-primary dark:text-primary'
                                : 'text-foreground dark:text-white'
                            )
                      )}
                    >
                      {sold.isSold ? sold.soldPriceLabel : priceDisplay}
                    </span>
                    {!sold.isSold && isCurrentHighBidder && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary shrink-0" role="status">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        You're winning
                      </span>
                    )}
                  </div>
                  {sold.isSold && sold.soldDateLabel && (
                    <div className="text-[11px] text-muted-foreground font-medium">{sold.soldDateLabel}</div>
                  )}
                  {quantity && quantity >= 1 ? (
                    <div className="text-xs text-muted-foreground font-medium truncate">
                      Qty: {quantity}
                    </div>
                  ) : null}
                  {!sold.isSold && listing.type === 'auction' && listing.reservePrice ? (
                    <div className="text-xs text-muted-foreground font-medium truncate">
                      Reserve: ${listing.reservePrice.toLocaleString()}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1.5 min-w-0 flex-shrink overflow-hidden sm:max-w-[35%]">
                  <div className="hidden sm:flex items-center gap-2 flex-wrap justify-end max-w-full overflow-hidden">
                    {listing.sellerSnapshot?.verified && (
                      <Badge variant="secondary" className="text-[10px] font-semibold flex-shrink-0">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                    {sellerTxCount !== null && sellerTxCount > 0 && (
                      <Badge variant="outline" className="text-[10px] font-semibold flex-shrink-0">
                        {sellerTxCount} tx
                      </Badge>
                    )}
                    {sellerBadges.includes('Identity verified') && (
                      <Badge variant="outline" className="text-[10px] font-semibold flex-shrink-0">
                        ID verified
                      </Badge>
                    )}
                  </div>
                  <div className="w-full min-w-0 max-w-full overflow-hidden flex justify-end">
                    <button
                      type="button"
                      className="inline-flex items-center justify-end gap-2 text-xs text-muted-foreground font-medium text-right hover:underline overflow-hidden min-w-0 max-w-full"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const sellerId = listing.sellerId;
                        if (!sellerId) return;
                        router.push(`/sellers/${sellerId}?from=${encodeURIComponent(`/listing/${listing.id}`)}`);
                      }}
                      aria-label="View seller profile"
                    >
                      <Avatar className="h-6 w-6 border border-border/50 flex-shrink-0">
                        {sellerPhotoUrl ? <AvatarImage src={sellerPhotoUrl} alt={sellerName} referrerPolicy="no-referrer" /> : null}
                        <AvatarFallback className="text-[10px] font-bold">{sellerInitial}</AvatarFallback>
                      </Avatar>
                      <span className="truncate min-w-0">{sellerName}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* View Details CTA - Premium */}
            <motion.div
              whileHover={{ x: 4 }}
              className="hidden sm:flex items-center justify-between pt-2 mt-2 border-t border-border/30"
            >
              <span className="text-sm font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                View Details
              </span>
              <ArrowRight className="h-4 w-4 text-primary group-hover:translate-x-1 transition-transform" />
            </motion.div>
          </div>

          {/* Premium Glow Effect on Hover */}
          <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 rounded-lg blur-xl" />
          </div>
        </Card>
      </Link>
    </motion.div>
  );
});
FeaturedListingCard.displayName = 'FeaturedListingCard';
