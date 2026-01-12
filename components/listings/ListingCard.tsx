'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { MapPin, Star } from 'lucide-react';
import { Listing } from '@/lib/types';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { FavoriteButton } from '@/components/listings/FavoriteButton';
import { ShareButton } from '@/components/listings/ShareButton';
import { cn } from '@/lib/utils';

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
            
            {/* Action Buttons - Always visible on mobile, hover on desktop */}
            <div className="absolute top-2 right-2 z-30 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
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
            {/* Type badge */}
            <div className="absolute bottom-2 right-2 z-20">
              <Badge variant="outline" className="bg-card/80 backdrop-blur-sm border-border/50 font-semibold text-xs shadow-warm">
                {listing.type === 'auction' ? 'Auction' : listing.type === 'fixed' ? 'Buy Now' : 'Classified'}
              </Badge>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 flex-1 flex flex-col gap-3">
            {/* Title */}
            <h3 className="font-bold text-base line-clamp-2 leading-snug group-hover:text-primary transition-colors duration-300">
              {listing.title}
            </h3>

          {/* Location */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</span>
          </div>

          {/* Trust Badges - Mobile optimized */}
          <TrustBadges
            verified={listing.trust?.verified || false}
            insurance={listing.trust?.insuranceAvailable || false}
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
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/50 border border-border/40">
                  <Star className="h-4 w-4 fill-primary/20 text-primary" />
                  <span className="font-bold text-sm">{listing.seller?.rating ?? 0}</span>
                </div>
                <div className="text-xs text-muted-foreground font-medium">
                  {listing.seller?.responseTime ?? 'N/A'}
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
