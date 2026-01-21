'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { MapPin, Heart, TrendingUp, Zap, CheckCircle2 } from 'lucide-react';
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

export const ListingCard = React.forwardRef<HTMLDivElement, ListingCardProps>(
  ({ listing, className }, ref) => {
  const router = useRouter();
  // Phase 3A (A4): anon-safe trust signals come from listing.sellerSnapshot (copied at publish time).
  const sellerTxCount = typeof listing.sellerSnapshot?.completedSalesCount === 'number' ? listing.sellerSnapshot.completedSalesCount : null;
  const sellerBadges = Array.isArray(listing.sellerSnapshot?.badges) ? listing.sellerSnapshot!.badges! : [];
  const watchers = typeof listing.watcherCount === 'number' ? listing.watcherCount : listing.metrics?.favorites || 0;
  const sold = useMemo(() => getSoldSummary(listing), [listing]);
  const sellerName = listing.sellerSnapshot?.displayName || listing.seller?.name || 'Seller';
  const sellerInitial = String(sellerName || 'S').trim().slice(0, 1).toUpperCase();
  const sellerPhotoUrl = listing.sellerSnapshot?.photoURL || '';

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

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -4 }}
      className={cn('group touch-none md:touch-auto', className)}
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
              <Image
                src={coverUrl}
                alt={listing.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-110"
                style={coverObjectPosition ? { objectPosition: coverObjectPosition } : undefined}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                unoptimized
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <span className="text-muted-foreground text-sm font-medium">No Image</span>
              </div>
            )}
            
            {/* Action Buttons - Always visible (watchlist must be easy to find) */}
            <div className="absolute top-2 right-2 z-30 flex gap-2 opacity-100 transition-opacity duration-300">
              <FavoriteButton listingId={listing.id} className="bg-card/95 backdrop-blur-sm border border-border/50" />
            </div>
            
            {/* Top-left row: Trending (if applicable) + auction timer (same line) */}
            <div className="absolute top-2 left-2 z-20 flex items-center gap-1 flex-wrap">
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
            {/* Type badge */}
            <div className="absolute bottom-2 right-2 z-20 flex flex-col gap-1 items-end">
              <Badge variant="outline" className="bg-card/80 backdrop-blur-sm border-border/50 font-semibold text-xs shadow-warm">
                {listing.type === 'auction' ? 'Auction' : listing.type === 'fixed' ? 'Buy Now' : 'Classified'}
              </Badge>
              {/* Protected Transaction Badge */}
              {listing.protectedTransactionEnabled && listing.protectedTransactionDays && (
                <Badge 
                  variant="default" 
                  className="bg-green-600 text-white font-semibold text-xs shadow-warm"
                  title="Protected Transaction: Funds held for payout release until protection period ends or buyer accepts early. Evidence required for disputes."
                >
                  Protected {listing.protectedTransactionDays} Days
                </Badge>
              )}
            </div>

            {/* Social proof (watchers + bids) */}
            <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1.5">
              {sold.isSold && (
                <Badge className="bg-destructive text-destructive-foreground text-xs shadow-warm">
                  SOLD
                </Badge>
              )}
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

          {/* Content */}
          <div className="p-4 flex-1 flex flex-col gap-3">
            {sold.isSold && (
              <div className="rounded-md border bg-muted/30 px-2.5 py-2 text-xs">
                <div className="font-semibold">{sold.soldPriceLabel}</div>
                {sold.soldDateLabel ? <div className="text-muted-foreground mt-0.5">{sold.soldDateLabel}</div> : null}
              </div>
            )}
            {/* Title */}
            <h3 className="font-bold text-base line-clamp-2 leading-snug group-hover:text-primary transition-colors duration-300">
              {listing.title}
            </h3>

          {/* Key Attributes */}
          {keyAttributes && keyAttributes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              {keyAttributes.map((attr, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-muted rounded-md">
                  {attr}
                </span>
              ))}
            </div>
          )}

          {/* Location */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</span>
          </div>

          {/* Reserved (offer accepted) - keep it in the content area for gallery cards */}
          {!sold.isSold && (listing as any)?.offerReservedByOfferId ? (
            <div className="flex items-center gap-2 flex-wrap -mt-1">
              <Badge
                variant="secondary"
                className="bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30 text-xs"
                title="Reserved by an accepted offer"
              >
                Reserved (offer accepted)
              </Badge>
            </div>
          ) : null}

          {/* Trust Badges - Mobile optimized */}
          <TrustBadges
            verified={listing.trust?.verified || false}
            transport={listing.trust?.transportReady || false}
            size="sm"
            className="flex-wrap gap-1.5"
          />

            {/* Price and Seller Info */}
            <div className="mt-auto pt-3 border-t border-border/50 flex items-center justify-between">
              <div>
                <div className="text-xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                  {priceDisplay}
                </div>
                {listing.type === 'auction' && listing.reservePrice && (
                  <div className="text-xs text-muted-foreground font-medium mt-0.5">
                    Reserve: ${listing.reservePrice.toLocaleString()}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground max-w-[200px] truncate hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const sellerId = listing.sellerId;
                      if (!sellerId) return;
                      router.push(`/sellers/${sellerId}?from=${encodeURIComponent(`/listing/${listing.id}`)}`);
                    }}
                    aria-label="View seller profile"
                  >
                    <Avatar className="h-6 w-6 border border-border/50">
                      <AvatarImage src={sellerPhotoUrl} alt={sellerName} />
                      <AvatarFallback className="text-[10px] font-bold">{sellerInitial}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{sellerName}</span>
                  </button>
                  {/* Seller Tier badge (Seller Tiers) */}
                  <SellerTierBadge tier={(listing as any).sellerTier} />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
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
                  {sellerBadges.includes('TPWD breeder permit') && (
                    <Badge variant="outline" className="text-[10px] font-semibold">
                      TPWD permit
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
});
ListingCard.displayName = 'ListingCard';
