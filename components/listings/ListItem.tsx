'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { MapPin, CheckCircle2, Gavel, Tag } from 'lucide-react';
import { Listing } from '@/lib/types';
import { getSoldSummary } from '@/lib/listings/sold';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { FavoriteButton } from '@/components/listings/FavoriteButton';
interface ListItemProps {
  listing: Listing;
}

export const ListItem = React.forwardRef<HTMLDivElement, ListItemProps>(
  ({ listing }, ref) => {
  const sold = getSoldSummary(listing);
  const sellerTxCount = typeof listing.sellerSnapshot?.completedSalesCount === 'number' ? listing.sellerSnapshot.completedSalesCount : null;
  const sellerBadges = Array.isArray(listing.sellerSnapshot?.badges) ? listing.sellerSnapshot!.badges! : [];

  const isAuction = listing.type === 'auction';
  const isFixed = listing.type === 'fixed';
  const isClassified = listing.type === 'classified';
  const bestOfferEnabled = Boolean((listing as any).bestOfferEnabled);
  const bidCount = Number((listing as any)?.metrics?.bidCount || 0) || 0;

  const primaryPrice = useMemo(() => {
    if (isAuction) return Number(listing.currentBid || listing.startingBid || 0) || 0;
    if (isFixed) return Number(listing.price || 0) || 0;
    if (isClassified) return Number(listing.price || 0) || 0;
    return 0;
  }, [isAuction, isFixed, isClassified, listing.currentBid, listing.startingBid, listing.price]);

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
          {/* Image (only overlay is watchlist heart, per spec) */}
          <div className="relative w-28 sm:w-36 md:w-56 lg:w-72 h-28 sm:h-36 md:h-44 flex-shrink-0 bg-muted overflow-hidden rounded-l-xl">
            
            {listing.images[0] ? (
              <Image
                src={listing.images[0]}
                alt={listing.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-110"
                sizes="(max-width: 640px) 112px, (max-width: 768px) 144px, (max-width: 1024px) 224px, 288px"
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
          </div>

          {/* Content - Flexible Width */}
          <div className="flex-1 flex flex-col p-3 sm:p-4 md:p-5 gap-2 min-w-0">
            {/* Top meta row (type + sold) */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className="text-[10px] font-semibold">
                  {isAuction ? (
                    <span className="inline-flex items-center gap-1">
                      <Gavel className="h-3 w-3" /> Auction
                    </span>
                  ) : isFixed ? (
                    <span className="inline-flex items-center gap-1">
                      <Tag className="h-3 w-3" /> Buy Now
                    </span>
                  ) : (
                    'Classified'
                  )}
                </Badge>
                {sold.isSold ? (
                  <Badge className="bg-destructive text-destructive-foreground font-extrabold text-[10px]">SOLD</Badge>
                ) : null}
              </div>
            </div>

            {/* Title + location */}
            <div className="space-y-1 min-w-0">
              <h3 className="font-bold text-[15px] sm:text-base md:text-lg leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-300">
                {listing.title}
              </h3>
              <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground min-w-0">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">
                  {listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}
                </span>
              </div>
            </div>

            {/* Pricing + auction meta (eBay-like) */}
            <div className="pt-1">
              {sold.isSold ? (
                <div className="text-sm">
                  <div className="font-extrabold">{sold.soldPriceLabel}</div>
                  {sold.soldDateLabel ? <div className="text-xs text-muted-foreground">{sold.soldDateLabel}</div> : null}
                </div>
              ) : isAuction ? (
                <div className="space-y-1">
                  <div className="text-lg sm:text-xl font-extrabold text-primary leading-none">
                    ${primaryPrice.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>
                      {bidCount} {bidCount === 1 ? 'bid' : 'bids'}
                    </span>
                    <span>·</span>
                    <CountdownTimer endsAt={listing.endsAt as any} variant="compact" showIcon={false} pulseWhenEndingSoon={false} className="text-xs" />
                    <span className="sr-only">left</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-lg sm:text-xl font-extrabold text-primary leading-none">
                    ${primaryPrice ? primaryPrice.toLocaleString() : 'Contact'}
                  </div>
                  {bestOfferEnabled ? <div className="text-xs text-muted-foreground">or Best Offer</div> : null}
                </div>
              )}
            </div>

            {/* Trust (keep but compact; avoids cramming) */}
            <div className="pt-1">
              <TrustBadges verified={listing.trust?.verified || false} transport={listing.trust?.transportReady || false} size="sm" className="flex-wrap gap-2" />
            </div>

            {/* Seller (small, bottom) */}
            <div className="mt-auto pt-2 border-t border-border/40 flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground font-medium truncate">
                {listing.sellerSnapshot?.displayName || listing.seller?.name || 'Seller'}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {listing.sellerSnapshot?.verified ? (
                  <Badge variant="secondary" className="text-[10px] font-semibold">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                ) : null}
                {sellerTxCount !== null && sellerTxCount > 0 ? (
                  <Badge variant="outline" className="text-[10px] font-semibold">
                    {sellerTxCount} tx
                  </Badge>
                ) : null}
                {sellerBadges.includes('Identity verified') ? (
                  <Badge variant="outline" className="text-[10px] font-semibold">
                    ID verified
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
});
ListItem.displayName = 'ListItem';
