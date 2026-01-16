'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { MapPin, Star } from 'lucide-react';
import { Listing, WildlifeAttributes, CattleAttributes, EquipmentAttributes } from '@/lib/types';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { FavoriteButton } from '@/components/listings/FavoriteButton';
import { ShareButton } from '@/components/listings/ShareButton';
import { cn } from '@/lib/utils';
import { SellerTierBadge } from '@/components/seller/SellerTierBadge';

interface ListingCardProps {
  listing: Listing;
  className?: string;
}

export const ListingCard = React.forwardRef<HTMLDivElement, ListingCardProps>(
  ({ listing, className }, ref) => {

  const priceDisplay = listing.type === 'auction'
    ? listing.currentBid
      ? `$${listing.currentBid.toLocaleString()}`
      : `Starting: $${listing.startingBid?.toLocaleString() || '0'}`
    : listing.type === 'fixed'
    ? `$${listing.price?.toLocaleString() || '0'}`
    : `$${listing.price?.toLocaleString() || 'Contact'}`;

  // Get category display name
  const getCategoryName = (category: string) => {
    switch (category) {
      case 'wildlife_exotics':
        return 'Wildlife & Exotics';
      case 'cattle_livestock':
        return 'Cattle & Livestock';
      case 'ranch_equipment':
        return 'Ranch Equipment';
      default:
        return category;
    }
  };

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
    
    if (listing.category === 'ranch_equipment') {
      const attrs = listing.attributes as EquipmentAttributes;
      return [
        attrs.equipmentType && attrs.equipmentType,
        attrs.year && `Year: ${attrs.year}`,
        attrs.condition && attrs.condition,
      ].filter(Boolean).slice(0, 2);
    }
    
    return null;
  };

  const keyAttributes = getKeyAttributes();

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
            
            {listing.images[0] ? (
              <Image
                src={listing.images[0]}
                alt={listing.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-110"
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
              <ShareButton listingId={listing.id} listingTitle={listing.title} className="bg-card/95 backdrop-blur-sm border border-border/50" />
            </div>
            
            {/* Real-time countdown timer for auctions */}
            {listing.type === 'auction' && listing.endsAt && (
              <div className="absolute top-2 left-2 z-20">
                <CountdownTimer
                  endsAt={listing.endsAt}
                  variant="badge"
                  showIcon={true}
                  pulseWhenEndingSoon={true}
                  className="text-xs"
                />
              </div>
            )}
            {/* Category and Type badges */}
            <div className="absolute bottom-2 right-2 z-20 flex flex-col gap-1 items-end">
              <Badge variant="outline" className="bg-card/80 backdrop-blur-sm border-border/50 font-semibold text-xs shadow-warm">
                {getCategoryName(listing.category)}
              </Badge>
              <Badge variant="outline" className="bg-card/80 backdrop-blur-sm border-border/50 font-semibold text-xs shadow-warm">
                {listing.type === 'auction' ? 'Auction' : listing.type === 'fixed' ? 'Buy Now' : 'Classified'}
              </Badge>
              {/* Protected Transaction Badge */}
              {listing.protectedTransactionEnabled && listing.protectedTransactionDays && (
                <Badge 
                  variant="default" 
                  className="bg-green-600 text-white font-semibold text-xs shadow-warm"
                  title="Protected Transaction: Funds held in escrow until protection period ends or buyer accepts early. Evidence required for disputes."
                >
                  Protected {listing.protectedTransactionDays} Days
                </Badge>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-4 flex-1 flex flex-col gap-3">
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
                  <span className="text-xs font-semibold text-muted-foreground max-w-[160px] truncate">
                    {listing.sellerSnapshot?.displayName || listing.seller?.name || 'Seller'}
                  </span>
                  {/* Seller Tier badge (Exposure Plans) */}
                  <SellerTierBadge tier={(listing as any).sellerTier} />
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/50 border border-border/40">
                  <Star className="h-4 w-4 fill-primary/20 text-primary" />
                  <span className="font-bold text-sm">{listing.seller?.rating ?? 0}</span>
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
