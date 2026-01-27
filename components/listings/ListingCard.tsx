'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Heart, TrendingUp, Zap, CheckCircle2 } from 'lucide-react';
import { Listing, WildlifeAttributes, CattleAttributes, EquipmentAttributes, HorseAttributes, SportingWorkingDogAttributes } from '@/lib/types';
import { getSoldSummary } from '@/lib/listings/sold';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { FavoriteButton } from '@/components/listings/FavoriteButton';
import { cn } from '@/lib/utils';
import { SellerTierBadge } from '@/components/seller/SellerTierBadge';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ListingCardProps {
  listing: Listing;
  className?: string;
}

const ListingCardComponent = React.forwardRef<HTMLDivElement, ListingCardProps>(
  function ListingCardComponent({ listing, className }, ref) {
  const router = useRouter();
  // CRITICAL: Don't call useFavorites() here - it subscribes to state and causes re-renders
  // Access the ref directly from the module-level export to avoid subscribing to state
  const favoriteIdsRef = (globalThis as any).__favoritesRef as React.MutableRefObject<Set<string>> | undefined;
  const isFavoriteRef = useRef((listingId: string) => {
    return favoriteIdsRef?.current?.has(listingId) ?? false;
  });
  // Update the ref function to use the latest favoriteIdsRef
  if (favoriteIdsRef) {
    isFavoriteRef.current = (listingId: string) => favoriteIdsRef.current.has(listingId);
  }
  
  // Track this listing's favorite status locally - only check on mount, no polling
  // The FavoriteButton handles its own optimistic updates, so we don't need to poll here
  const [localIsFavorited] = useState(() => isFavoriteRef.current(listing.id));
  
  // Only check the ref once on mount - no polling to avoid re-renders
  // The FavoriteButton component will handle its own state updates
  
  // Don't memoize FavoriteButton - it's already memoized internally
  // Memoizing here with stale dependencies causes issues
  const favoriteButton = (
    <FavoriteButton key={listing.id} listingId={listing.id} className="bg-card/95 backdrop-blur-sm border border-border/50" />
  );
  // Phase 3A (A4): anon-safe trust signals come from listing.sellerSnapshot (copied at publish time).
  const sellerTxCount = typeof listing.sellerSnapshot?.completedSalesCount === 'number' ? listing.sellerSnapshot.completedSalesCount : null;
  const sellerBadges = Array.isArray(listing.sellerSnapshot?.badges) ? listing.sellerSnapshot!.badges! : [];
  const watchers = typeof listing.watcherCount === 'number' ? listing.watcherCount : listing.metrics?.favorites || 0;
  const bidCount = typeof listing.metrics?.bidCount === 'number' ? listing.metrics.bidCount : 0;
  const sold = useMemo(() => getSoldSummary(listing), [listing]);
  const sellerName = listing.sellerSnapshot?.displayName || listing.seller?.name || 'Seller';
  const sellerInitial = String(sellerName || 'S').trim().slice(0, 1).toUpperCase();
  const sellerPhotoUrl = listing.sellerSnapshot?.photoURL || '';

  const listingTypeLabel =
    listing.type === 'auction' ? 'Auction' : listing.type === 'fixed' ? 'Buy Now' : 'Classified';

  const hasLocation = listing.location?.city || listing.location?.state;
  const locationLabel = hasLocation
    ? `${listing.location?.city || 'Unknown'}, ${listing.location?.state || 'Unknown'}`
    : null;

  const mobileMetaParts: string[] = [];
  if (watchers > 0) mobileMetaParts.push(`${watchers} watching`);
  mobileMetaParts.push(listingTypeLabel);
  if (listing.type === 'auction' && bidCount > 0) {
    mobileMetaParts.push(`${bidCount} bids`);
  }
  const mobileMeta = mobileMetaParts.join(' • ');

  const priceDisplay = listing.type === 'auction'
    ? listing.currentBid
      ? `$${listing.currentBid.toLocaleString()}`
      : `Starting: $${listing.startingBid?.toLocaleString() || '0'}`
    : listing.type === 'fixed'
    ? `$${listing.price?.toLocaleString() || '0'}`
    : `$${listing.price?.toLocaleString() || 'Contact'}`;

  // Get key attributes to display on card
  const getKeyAttributes = () => {
    if (!listing.attributes) return null;
    
    if (listing.category === 'wildlife_exotics') {
      const attrs = listing.attributes as WildlifeAttributes;
      return [
        attrs.speciesId && `Species: ${attrs.speciesId}`,
        attrs.sex && `Sex: ${attrs.sex}`,
        attrs.quantity && `Qty: ${attrs.quantity}`,
      ].filter(Boolean).slice(0, 2);
    }
    
    if (listing.category === 'cattle_livestock') {
      const attrs = listing.attributes as CattleAttributes;
      return [
        attrs.breed && `Breed: ${attrs.breed}`,
        attrs.sex && `Sex: ${attrs.sex}`,
        attrs.registered && 'Registered',
      ].filter(Boolean).slice(0, 2);
    }
    
    if (listing.category === 'ranch_equipment' || listing.category === 'ranch_vehicles') {
      const attrs = listing.attributes as EquipmentAttributes;
      return [
        attrs.equipmentType && attrs.equipmentType,
        attrs.year && `Year: ${attrs.year}`,
        attrs.condition && attrs.condition,
      ].filter(Boolean).slice(0, 2);
    }

    if (listing.category === 'hunting_outfitter_assets') {
      const attrs = listing.attributes as EquipmentAttributes;
      return [
        attrs.equipmentType && attrs.equipmentType,
        attrs.year && `Year: ${attrs.year}`,
        attrs.condition && attrs.condition,
      ].filter(Boolean).slice(0, 2);
    }

    if (listing.category === 'horse_equestrian') {
      const attrs = listing.attributes as HorseAttributes;
      const sex =
        attrs.sex === 'stallion' ? 'Stallion' :
        attrs.sex === 'mare' ? 'Mare' :
        attrs.sex === 'gelding' ? 'Gelding' :
        attrs.sex ? String(attrs.sex) : null;
      return [
        sex && `Sex: ${sex}`,
        attrs.registered ? 'Registered' : null,
        attrs.age !== undefined && attrs.age !== null ? `Age: ${String(attrs.age)}` : null,
      ].filter(Boolean).slice(0, 2);
    }

    if (listing.category === 'sporting_working_dogs') {
      const attrs = listing.attributes as SportingWorkingDogAttributes;
      return [
        attrs.breed ? `Breed: ${attrs.breed}` : null,
        attrs.sex ? `Sex: ${attrs.sex}` : null,
        attrs.quantity ? `Qty: ${attrs.quantity}` : null,
      ].filter(Boolean).slice(0, 2);
    }
    
    return null;
  };

  const keyAttributes = getKeyAttributes();
  const cover = listing.photos?.[0];
  const coverUrl = cover?.url || listing.images?.[0] || '';
  const coverObjectPosition =
    cover?.focalPoint && typeof cover.focalPoint.x === 'number' && typeof cover.focalPoint.y === 'number'
      ? `${Math.max(0, Math.min(1, cover.focalPoint.x)) * 100}% ${Math.max(0, Math.min(1, cover.focalPoint.y)) * 100}%`
      : undefined;
  const coverCropZoom =
    typeof (cover as any)?.cropZoom === 'number' && Number.isFinite((cover as any).cropZoom)
      ? Math.max(1, Math.min(3, Number((cover as any).cropZoom)))
      : 1;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -4 }}
      // Mobile: allow vertical scrolling even when the gesture starts on the card/image.
      className={cn('group touch-manipulation md:touch-auto', className)}
    >
      <Link href={`/listing/${listing.id}`}>
        <Card className={cn(
          'overflow-hidden transition-all duration-300',
          'flex flex-col h-full',
          'border border-border/50 bg-card',
          'hover:border-border/70 hover:shadow-lifted hover:-translate-y-0.5',
          className
        )}>
          {/* Image */}
          <div className="relative aspect-[4/3] w-full bg-muted overflow-hidden rounded-t-xl">
            {/* Subtle bottom overlay gradient - always visible for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent z-10" />
            {sold.isSold && <div className="absolute inset-0 bg-black/25 z-[11]" />}
            
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
                    loading="lazy"
                    quality={85}
                  />
                </div>
              </div>
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <span className="text-muted-foreground text-sm font-medium">No Image</span>
              </div>
            )}
            
            {/* Action Buttons - Always visible (watchlist must be easy to find) */}
            {/* Use memoized FavoriteButton to prevent re-renders when other listings change */}
            <div className="absolute top-2 right-2 z-30 flex gap-2 opacity-100 transition-opacity duration-300">
              {favoriteButton}
            </div>
            
            {/* Top-left row: Trending (if applicable) + auction timer (same line) */}
            <div className="hidden sm:flex absolute top-2 left-2 z-20 items-center gap-1 flex-wrap">
              {!sold.isSold && (watchers >= 10 || (listing.metrics?.bidCount || 0) >= 8) ? (
                <Badge variant="default" className="text-xs shadow-warm">
                  <Zap className="h-3 w-3 mr-1" />
                  Trending
                </Badge>
              ) : null}
              {!sold.isSold && listing.type === 'auction' && listing.endsAt ? (
                <CountdownTimer
                  endsAt={listing.endsAt}
                  variant="badge"
                  showIcon={true}
                  pulseWhenEndingSoon={true}
                  className="text-xs"
                />
              ) : null}
            </div>

            {/* Mobile: show time left for auctions (bid count shown in price section below) */}
            {!sold.isSold && listing.type === 'auction' && listing.endsAt ? (
              <div className="sm:hidden absolute top-2 left-2 z-20 flex items-center gap-1 flex-wrap">
                <CountdownTimer
                  endsAt={listing.endsAt}
                  variant="badge"
                  showIcon={true}
                  pulseWhenEndingSoon={true}
                  className="text-xs"
                />
              </div>
            ) : null}

            {/* Type badge */}
            <div className="hidden sm:flex absolute bottom-2 right-2 z-20 flex-col gap-1 items-end">
              <Badge variant="outline" className="bg-card/80 backdrop-blur-sm border-border/50 font-semibold text-xs shadow-warm">
                {listing.type === 'auction' ? 'Auction' : listing.type === 'fixed' ? 'Buy Now' : 'Classified'}
              </Badge>
              {listing.transportOption === 'SELLER_TRANSPORT' && (
                <Badge variant="outline" className="bg-card/80 backdrop-blur-sm border-border/50 font-semibold text-xs shadow-warm" title="Seller delivers">
                  Seller Transport
                </Badge>
              )}
              {listing.transportOption === 'BUYER_TRANSPORT' && (
                <Badge variant="outline" className="bg-card/80 backdrop-blur-sm border-border/50 font-semibold text-xs shadow-warm" title="Buyer arranges pickup">
                  Buyer Transport
                </Badge>
              )}
              {/* Protected Transaction Badge */}
              {listing.protectedTransactionEnabled && listing.protectedTransactionDays && (
                <Badge 
                  variant="success" 
                  className="font-semibold text-xs shadow-warm"
                  title="Protected Transaction: Payments are processed through the platform and released according to marketplace confirmation and dispute rules. Evidence required for disputes."
                >
                  Protected {listing.protectedTransactionDays} Days
                </Badge>
              )}
            </div>

            {/* Mobile: transport + Protected badges */}
            <div className="sm:hidden absolute bottom-2 right-2 z-20 flex flex-col gap-1 items-end">
              {listing.transportOption === 'SELLER_TRANSPORT' && (
                <Badge variant="outline" className="bg-card/80 backdrop-blur-sm border-border/50 font-semibold text-xs shadow-warm">
                  Seller Transport
                </Badge>
              )}
              {listing.transportOption === 'BUYER_TRANSPORT' && (
                <Badge variant="outline" className="bg-card/80 backdrop-blur-sm border-border/50 font-semibold text-xs shadow-warm">
                  Buyer Transport
                </Badge>
              )}
              {listing.protectedTransactionEnabled && listing.protectedTransactionDays ? (
                <Badge variant="success" className="font-semibold text-xs shadow-warm" title="Protected Transaction">
                  Protected {listing.protectedTransactionDays} Days
                </Badge>
              ) : null}
            </div>

            {/* Social proof (watchers + bids) */}
            {/* Keep SOLD on mobile; hide other social proof on mobile */}
            {sold.isSold ? (
              <div className="absolute bottom-2 left-2 z-20">
                <Badge className="bg-destructive text-destructive-foreground text-xs shadow-warm">
                  SOLD
                </Badge>
              </div>
            ) : null}
            <div className="hidden sm:flex absolute bottom-2 left-2 z-20 items-center gap-1.5">
              {watchers > 0 && (
                <Badge variant="secondary" className="bg-card/80 backdrop-blur-sm border-border/50 text-xs shadow-warm">
                  <Heart className="h-3 w-3 mr-1" />
                  {watchers} watching
                </Badge>
              )}
              {!sold.isSold && (listing.metrics?.bidCount || 0) > 0 && listing.type === 'auction' && (
                <Badge variant="secondary" className="bg-card/80 backdrop-blur-sm border-border/50 text-xs shadow-warm">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  {listing.metrics.bidCount} bids
                </Badge>
              )}
            </div>
          </div>

          {/* Content – no overflow-hidden so flex won’t shrink and clip the title */}
          <div className="p-2.5 sm:p-4 flex-1 flex flex-col gap-1.5 sm:gap-3 min-w-0">
            {sold.isSold && (
              <div className="rounded-md border bg-muted/30 px-2.5 py-2 text-xs">
                <div className="font-semibold">{sold.soldPriceLabel}</div>
                {sold.soldDateLabel ? <div className="text-muted-foreground mt-0.5">{sold.soldDateLabel}</div> : null}
              </div>
            )}
            {/* Title – line-clamp-4, flex-shrink-0 so it’s never clipped in gallery mode */}
            <h3
              className="font-bold text-sm sm:text-base line-clamp-4 leading-snug sm:leading-snug group-hover:text-primary transition-colors duration-300 min-w-0 break-words flex-shrink-0"
              title={listing.title}
            >
              {listing.title}
            </h3>

            {/* Mobile: compact location + watchers/type/bids meta */}
            <div className="sm:hidden flex flex-col gap-0.5 text-[11px] text-muted-foreground">
              {locationLabel && (
                <div className="truncate">
                  {locationLabel}
                </div>
              )}
              {mobileMeta && (
                <div className="truncate">
                  {mobileMeta}
                </div>
              )}
            </div>

          {/* Key Attributes */}
          {keyAttributes && keyAttributes.length > 0 && (
            <div className="hidden sm:flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {keyAttributes.map((attr, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-muted rounded-md">
                  {attr}
                </span>
              ))}
            </div>
          )}

          {/* Reserved (offer accepted) - keep it in the content area for gallery cards */}
          {!sold.isSold && (listing as any)?.offerReservedByOfferId ? (
            <div className="hidden sm:flex items-center gap-2 flex-wrap -mt-1">
              <Badge
                variant="warning"
                className="text-xs"
                title="Reserved by an accepted offer"
              >
                Reserved (offer accepted)
              </Badge>
            </div>
          ) : null}

          {/* Trust Badges - Mobile optimized */}
          <div className="hidden sm:block">
            <TrustBadges
              verified={listing.trust?.verified || false}
              transport={listing.trust?.transportReady || false}
              size="sm"
              className="flex-wrap gap-1.5"
            />
          </div>

            {/* Price and Seller Info */}
            <div className="mt-auto pt-2 sm:pt-3 border-t border-border/50 overflow-hidden">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 min-w-0 overflow-hidden">
                {/* Price Section */}
                <div className="flex-shrink-0 min-w-0 overflow-hidden sm:max-w-[65%]">
                  <div className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent truncate">
                    {priceDisplay}
                  </div>
                  {listing.type === 'auction' && listing.reservePrice && (
                    <div className="hidden sm:block text-xs text-muted-foreground font-medium mt-0.5 truncate">
                      Reserve: ${listing.reservePrice.toLocaleString()}
                    </div>
                  )}
                </div>
                {/* Seller Section – must not overlap price; truncate name */}
                <div className="flex flex-col items-start sm:items-end gap-1.5 sm:gap-1.5 min-w-0 flex-shrink overflow-hidden sm:max-w-[35%]">
                  <div className="flex items-center gap-1.5 sm:gap-2 w-full min-w-0 max-w-full overflow-hidden">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-semibold text-muted-foreground min-w-0 hover:underline overflow-hidden flex-1 max-w-full text-left sm:text-right"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const sellerId = listing.sellerId;
                        if (!sellerId) return;
                        router.push(`/sellers/${sellerId}?from=${encodeURIComponent(`/listing/${listing.id}`)}`);
                      }}
                      aria-label="View seller profile"
                    >
                      <Avatar className="h-5 w-5 sm:h-6 sm:w-6 border border-border/50 flex-shrink-0">
                        <AvatarImage src={sellerPhotoUrl} alt={sellerName} />
                        <AvatarFallback className="text-[9px] sm:text-[10px] font-bold">{sellerInitial}</AvatarFallback>
                      </Avatar>
                      <span className="truncate min-w-0">{sellerName}</span>
                    </button>
                    {/* Seller Tier badge (Seller Tiers) */}
                    <div className="hidden sm:block flex-shrink-0">
                      <SellerTierBadge tier={(listing as any).sellerTier} />
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end max-w-full">
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
                </div>
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
});

// Memoize with custom comparison to prevent re-renders when favoriteIds changes
// Only re-render if listing ID or className changed (listing object reference may change but content is same)
// This prevents re-renders when other listings' favorite status changes
export const ListingCard = React.memo(ListingCardComponent, (prevProps, nextProps) => {
  // Only re-render if listing ID or className actually changed
  const listingIdSame = prevProps.listing.id === nextProps.listing.id;
  const classNameSame = prevProps.className === nextProps.className;
  
  return listingIdSame && classNameSame;
});
ListingCard.displayName = 'ListingCard';

