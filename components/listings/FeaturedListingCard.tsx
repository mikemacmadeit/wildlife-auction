'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { MapPin, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Listing } from '@/lib/types';
import { getSoldSummary } from '@/lib/listings/sold';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { FavoriteButton } from '@/components/listings/FavoriteButton';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface FeaturedListingCardProps {
  listing: Listing;
  className?: string;
  index?: number;
}

export const FeaturedListingCard = forwardRef<HTMLDivElement, FeaturedListingCardProps>(
  ({ listing, className, index = 0 }, ref) => {
  const router = useRouter();
  const sold = getSoldSummary(listing);
  const sellerTxCount = typeof listing.sellerSnapshot?.completedSalesCount === 'number' ? listing.sellerSnapshot.completedSalesCount : null;
  const sellerBadges = Array.isArray(listing.sellerSnapshot?.badges) ? listing.sellerSnapshot!.badges! : [];

  const priceDisplay = listing.type === 'auction'
    ? listing.currentBid
      ? `$${listing.currentBid.toLocaleString()}`
      : `Starting: $${listing.startingBid?.toLocaleString() || '0'}`
    : listing.type === 'fixed'
    ? `$${listing.price?.toLocaleString() || '0'}`
    : `$${listing.price?.toLocaleString() || 'Contact'}`;

  const hasCountdown = !sold.isSold && listing.type === 'auction' && !!listing.endsAt;
  const cover = listing.photos?.[0];
  const coverUrl = cover?.url || listing.images?.[0] || '';
  const coverObjectPosition =
    cover?.focalPoint && typeof cover.focalPoint.x === 'number' && typeof cover.focalPoint.y === 'number'
      ? `${Math.max(0, Math.min(1, cover.focalPoint.x)) * 100}% ${Math.max(0, Math.min(1, cover.focalPoint.y)) * 100}%`
      : undefined;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      whileHover={{ y: -8 }}
      className={cn('group touch-none md:touch-auto', className)}
    >
      <Link href={`/listing/${listing.id}`}>
        <Card className={cn(
          'overflow-hidden transition-all duration-300',
          'flex flex-col h-full',
          'border border-border/50 bg-card',
          'hover:border-border/70 hover:shadow-lifted hover:-translate-y-0.5',
          'relative',
          className
        )}>
          {/* Featured Badge - High Contrast for Light & Dark Mode */}
          <div className="absolute top-3 left-3 z-20">
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

          {/* Image with Premium Overlay */}
          <div className="relative aspect-[16/9] w-full bg-muted overflow-hidden rounded-t-xl">
            {/* Subtle bottom overlay gradient - always visible for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-background/20 to-transparent z-10" />
            {sold.isSold && <div className="absolute inset-0 bg-black/25 z-[11]" />}

            {/* Action Buttons - Always visible and consistent with browse/home cards */}
            <div className="absolute top-2 right-2 z-30 flex gap-2 opacity-100 transition-opacity duration-300">
              <FavoriteButton listingId={listing.id} className="bg-card/95 backdrop-blur-sm border border-border/50" />
            </div>
            
            {coverUrl ? (
              <Image
                src={coverUrl}
                alt={listing.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-110"
                style={coverObjectPosition ? { objectPosition: coverObjectPosition } : undefined}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                unoptimized
                priority={index < 2}
              />
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
              <div className="absolute top-14 left-3 z-20">
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
            <div className="absolute bottom-3 right-3 z-20">
              <Badge 
                variant="outline" 
                className="backdrop-blur-sm bg-card/80 border-border/50 font-semibold text-xs px-3 py-1.5 shadow-warm"
              >
                {listing.type === 'auction' ? 'Auction' : listing.type === 'fixed' ? 'Buy Now' : 'Classified'}
              </Badge>
            </div>

            {sold.isSold && (
              <div className="absolute bottom-3 left-3 z-20">
                <Badge className="bg-destructive text-destructive-foreground font-extrabold px-3 py-1.5 shadow-lg">
                  SOLD
                </Badge>
              </div>
            )}

            {/* Subtle shimmer effect - warm tones */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-parchment/8 to-transparent z-5" />
          </div>

          {/* Content with Premium Styling */}
          <div className="p-5 flex-1 flex flex-col gap-4">
            {sold.isSold && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <div className="font-semibold">{sold.soldPriceLabel}</div>
                {sold.soldDateLabel ? <div className="text-muted-foreground mt-0.5">{sold.soldDateLabel}</div> : null}
              </div>
            )}
            {/* Title with gradient text effect */}
            <h3 className="font-bold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors duration-300 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
              {listing.title}
            </h3>

            {/* Location with enhanced icon */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="font-medium">{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</span>
            </div>

            {/* Trust Badges - Premium styling */}
            <TrustBadges
              verified={listing.trust.verified}
              transport={listing.trust.transportReady}
              size="sm"
              className="flex-wrap gap-2"
            />

            {/* Price and Seller Info - Enhanced */}
            <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                  {priceDisplay}
                </div>
                {listing.type === 'auction' && listing.reservePrice && (
                  <div className="text-xs text-muted-foreground font-medium">
                    Reserve: ${listing.reservePrice.toLocaleString()}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {listing.sellerSnapshot?.verified && (
                    <Badge variant="secondary" className="text-[10px] font-semibold">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                  {sellerTxCount !== null && sellerTxCount > 0 && (
                    <Badge variant="outline" className="text-[10px] font-semibold">
                      {sellerTxCount} tx
                    </Badge>
                  )}
                  {sellerBadges.includes('Identity verified') && (
                    <Badge variant="outline" className="text-[10px] font-semibold">
                      ID verified
                    </Badge>
                  )}
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground font-medium max-w-[180px] truncate text-right hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const sellerId = listing.sellerId;
                    if (!sellerId) return;
                    router.push(`/sellers/${sellerId}?from=${encodeURIComponent(`/listing/${listing.id}`)}`);
                  }}
                  aria-label="View seller profile"
                >
                  {listing.sellerSnapshot?.displayName || 'Seller'}
                </button>
              </div>
            </div>

            {/* View Details CTA - Premium */}
            <motion.div
              whileHover={{ x: 4 }}
              className="flex items-center justify-between pt-2 mt-2 border-t border-border/30"
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
