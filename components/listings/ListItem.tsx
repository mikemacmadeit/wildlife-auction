'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { MapPin, CheckCircle2, Gavel, Tag } from 'lucide-react';
import { Listing, WildlifeAttributes, WhitetailBreederAttributes, CattleAttributes } from '@/lib/types';
import { getSoldSummary } from '@/lib/listings/sold';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { FavoriteButton } from '@/components/listings/FavoriteButton';
import { BROWSE_SPECIES } from '@/components/browse/filters/constants';
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

  const specs = useMemo(() => {
    // eBay-style “at a glance” line: Species • Sex • Age
    const attrs: any = listing.attributes || null;
    if (!attrs) return null;

    const formatAge = (age: any): string | null => {
      if (age === null || age === undefined) return null;
      if (typeof age === 'number' && Number.isFinite(age)) return `${age} yr${age === 1 ? '' : 's'}`;
      const s = String(age).trim();
      return s ? s : null;
    };

    const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

    // Wildlife / Whitetail: speciesId + sex + age
    if (listing.category === 'wildlife_exotics' || listing.category === 'whitetail_breeder') {
      const speciesId = String((attrs as WildlifeAttributes | WhitetailBreederAttributes).speciesId || '').trim();
      const sexRaw = String((attrs as WildlifeAttributes | WhitetailBreederAttributes).sex || '').trim();
      const ageLabel = formatAge((attrs as WildlifeAttributes | WhitetailBreederAttributes).age);

      const speciesLabel =
        speciesId
          ? BROWSE_SPECIES.find((s) => s.value === speciesId)?.label ||
            titleCase(speciesId.replaceAll('_', ' '))
          : null;

      const sexLabel =
        sexRaw === 'male' ? 'Male' : sexRaw === 'female' ? 'Female' : sexRaw === 'unknown' ? null : titleCase(sexRaw);

      const parts = [speciesLabel, sexLabel, ageLabel].filter(Boolean) as string[];
      return parts.length ? parts : null;
    }

    // Cattle: breed + sex + age (or weight if no age)
    if (listing.category === 'cattle_livestock') {
      const c = attrs as CattleAttributes;
      const breed = c.breed ? String(c.breed).trim() : '';
      const sexRaw = c.sex ? String(c.sex).trim() : '';
      const ageLabel = formatAge(c.age) || (c.weightRange ? String(c.weightRange).trim() : null);

      const sexLabel =
        sexRaw === 'bull' ? 'Bull' :
        sexRaw === 'cow' ? 'Cow' :
        sexRaw === 'heifer' ? 'Heifer' :
        sexRaw === 'steer' ? 'Steer' :
        sexRaw ? titleCase(sexRaw) : null;

      const parts = [breed || null, sexLabel, ageLabel].filter(Boolean) as string[];
      return parts.length ? parts : null;
    }

    return null;
  }, [listing.attributes, listing.category]);

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
        <Card className="overflow-hidden transition-all duration-300 rounded-xl flex flex-row md:grid md:grid-cols-[224px_1fr] h-full w-full border border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
          {/* Image (only overlay is watchlist heart, per spec) */}
          <div className="relative w-28 sm:w-36 md:w-full h-28 sm:h-36 md:h-full min-h-[112px] md:min-h-[176px] flex-shrink-0 bg-muted overflow-hidden rounded-l-xl">
            
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

          {/* Content */}
          <div className="flex-1 min-w-0 p-3 sm:p-4 md:p-5">
            <div className="flex flex-col gap-3 md:grid md:grid-cols-[1fr_240px] md:gap-5 md:items-stretch">
              {/* Left: details */}
              <div className="min-w-0 flex flex-col gap-2">
                {/* Type + sold */}
                <div className="flex items-center gap-2 flex-wrap">
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

                {/* Title */}
                <h3 className="font-bold text-[15px] sm:text-base md:text-lg leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-300">
                  {listing.title}
                </h3>

                {/* Location */}
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground min-w-0">
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">
                    {listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}
                  </span>
                </div>

                {/* Specs */}
                {specs && specs.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {specs.map((s) => (
                      <span
                        key={s}
                        className="text-[11px] sm:text-xs font-semibold text-muted-foreground rounded-full border border-border/50 bg-muted/20 px-2 py-0.5"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Description preview (desktop only – uses space without cluttering mobile) */}
                {listing.description ? (
                  <p className="hidden md:block text-sm text-muted-foreground line-clamp-2 pt-1">
                    {listing.description}
                  </p>
                ) : null}

                {/* Trust */}
                <div className="pt-1">
                  <TrustBadges
                    verified={listing.trust?.verified || false}
                    transport={listing.trust?.transportReady || false}
                    size="sm"
                    className="flex-wrap gap-2"
                  />
                </div>
              </div>

              {/* Right: price + seller */}
              <div className="md:border-l md:pl-5 md:border-border/40 flex flex-col gap-3">
                {/* Price */}
                <div className="space-y-1">
                  {sold.isSold ? (
                    <>
                      <div className="text-sm font-extrabold">{sold.soldPriceLabel}</div>
                      {sold.soldDateLabel ? (
                        <div className="text-xs text-muted-foreground">{sold.soldDateLabel}</div>
                      ) : null}
                    </>
                  ) : isAuction ? (
                    <>
                      <div className="text-lg sm:text-xl md:text-2xl font-extrabold text-primary leading-none">
                        ${primaryPrice.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>
                          {bidCount} {bidCount === 1 ? 'bid' : 'bids'}
                        </span>
                        <span>·</span>
                        <CountdownTimer
                          endsAt={listing.endsAt as any}
                          variant="compact"
                          showIcon={false}
                          pulseWhenEndingSoon={false}
                          className="text-xs"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg sm:text-xl md:text-2xl font-extrabold text-primary leading-none">
                        ${primaryPrice ? primaryPrice.toLocaleString() : 'Contact'}
                      </div>
                      {bestOfferEnabled ? <div className="text-xs text-muted-foreground">or Best Offer</div> : null}
                    </>
                  )}
                </div>

                {/* Seller */}
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-2">
                  <div className="text-xs text-muted-foreground font-semibold">Sold by</div>
                  <div className="text-sm font-bold truncate">
                    {listing.sellerSnapshot?.displayName || listing.seller?.name || 'Seller'}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
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
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
});
ListItem.displayName = 'ListItem';
