'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { MapPin, CheckCircle2 } from 'lucide-react';
import { Listing } from '@/lib/types';
import { getSoldSummary } from '@/lib/listings/sold';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { FavoriteButton } from '@/components/listings/FavoriteButton';
import { ShareButton } from '@/components/listings/ShareButton';
interface ListItemProps {
  listing: Listing;
}

export const ListItem = React.forwardRef<HTMLDivElement, ListItemProps>(
  ({ listing }, ref) => {
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

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ x: 4 }}
      className="group w-full"
    >
      <Link href={`/listing/${listing.id}`}>
        <Card className="overflow-hidden transition-all duration-300 rounded-xl flex flex-row h-full w-full border border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
          {/* Image - Fixed Width - Smaller on mobile */}
          <div className="relative w-32 sm:w-40 md:w-64 lg:w-80 h-32 sm:h-40 md:h-56 flex-shrink-0 bg-muted overflow-hidden rounded-l-xl">
            <div className="absolute inset-0 bg-gradient-to-r from-background/40 via-transparent to-transparent z-10" />
            {sold.isSold && <div className="absolute inset-0 bg-black/25 z-[11]" />}
            
            {listing.images[0] ? (
              <Image
                src={listing.images[0]}
                alt={listing.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-110"
                sizes="(max-width: 640px) 128px, (max-width: 768px) 160px, (max-width: 1024px) 256px, 320px"
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
            
            {/* Countdown Timer */}
            {!sold.isSold && listing.type === 'auction' && listing.endsAt && (
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
            
            {/* Type Badge */}
            <div className="absolute bottom-2 right-2 z-20">
              <Badge variant="outline" className="bg-card/80 backdrop-blur-sm border-border/50 font-semibold text-xs shadow-warm">
                {listing.type === 'auction' ? 'Auction' : listing.type === 'fixed' ? 'Buy Now' : 'Classified'}
              </Badge>
            </div>

            {sold.isSold && (
              <div className="absolute bottom-2 left-2 z-20">
                <Badge className="bg-destructive text-destructive-foreground font-extrabold text-xs shadow-warm">
                  SOLD
                </Badge>
              </div>
            )}
          </div>

          {/* Content - Flexible Width */}
          <div className="flex-1 flex flex-col p-3 sm:p-4 md:p-6 gap-2 sm:gap-3 md:gap-4">
            {sold.isSold && (
              <div className="rounded-md border bg-muted/30 px-2.5 py-2 text-xs">
                <div className="font-semibold">{sold.soldPriceLabel}</div>
                {sold.soldDateLabel ? <div className="text-muted-foreground mt-0.5">{sold.soldDateLabel}</div> : null}
              </div>
            )}
            {/* Title and Location Row */}
            <div className="flex-1 space-y-2">
              <h3 className="font-bold text-lg md:text-xl line-clamp-2 leading-tight group-hover:text-primary transition-colors duration-300">
                {listing.title}
              </h3>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span>{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</span>
              </div>
              
              {/* Description Preview */}
              <p className="text-sm text-muted-foreground line-clamp-2 hidden md:block">
                {listing.description}
              </p>

              {/* Trust Badges */}
              <TrustBadges
                verified={listing.trust?.verified || false}
                transport={listing.trust?.transportReady || false}
                size="sm"
                className="flex-wrap gap-2"
              />
            </div>

            {/* Bottom Row - Price, Seller, Metadata */}
            <div className="flex items-center justify-between gap-4 pt-3 border-t border-border/50">
              {/* Left: Price */}
              <div className="flex-shrink-0">
                <div className="text-2xl md:text-3xl font-bold text-primary">
                  {priceDisplay}
                </div>
                {listing.type === 'auction' && listing.reservePrice && (
                  <div className="text-xs text-muted-foreground font-medium mt-0.5">
                    Reserve: ${listing.reservePrice.toLocaleString()}
                  </div>
                )}
              </div>

              {/* Middle: Attributes (if available) */}
              {listing.attributes && (
                <div className="flex-1 hidden lg:flex items-center gap-4 text-sm text-muted-foreground">
                  {listing.category === 'cattle_livestock' && (listing.attributes as any).breed && (
                    <div>
                      <span className="font-semibold">Breed: </span>
                      <span>{(listing.attributes as any).breed}</span>
                    </div>
                  )}
                  {(listing.attributes as any).quantity && (
                    <div>
                      <span className="font-semibold">Qty: </span>
                      <span>{(listing.attributes as any).quantity}</span>
                    </div>
                  )}
                  {listing.category === 'cattle_livestock' && (listing.attributes as any).registered && (
                    <Badge variant="outline" className="text-xs">
                      Registered
                    </Badge>
                  )}
                </div>
              )}

              {/* Right: Seller Info */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
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
                <div className="text-xs text-muted-foreground font-medium text-right max-w-[180px] truncate">
                  {listing.sellerSnapshot?.displayName || listing.seller?.name || 'Seller'}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
});
ListItem.displayName = 'ListItem';
