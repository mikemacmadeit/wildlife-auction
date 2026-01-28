'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { MapPin, CheckCircle2, Gavel, Tag, Clock, Heart } from 'lucide-react';
import { format } from 'date-fns';
import { Listing, WildlifeAttributes, WhitetailBreederAttributes, CattleAttributes, HorseAttributes } from '@/lib/types';
import { getSoldSummary } from '@/lib/listings/sold';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { FavoriteButton } from '@/components/listings/FavoriteButton';
import { BROWSE_SPECIES } from '@/components/browse/filters/constants';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

interface ListItemProps {
  listing: Listing;
  /**
   * Mobile browse variant: eBay-style list row (image ~25% width, no seller line, watchers shown).
   * Other surfaces (watchlist, admin, etc.) should use the default card.
   */
  variant?: 'default' | 'browseMobile';
}

const ListItemComponent = React.forwardRef<HTMLDivElement, ListItemProps>(
  function ListItemComponent({ listing, variant = 'default' }, ref) {
  const router = useRouter();
  const { user } = useAuth();
  const sold = getSoldSummary(listing);
  const sellerTxCount = typeof listing.sellerSnapshot?.completedSalesCount === 'number' ? listing.sellerSnapshot.completedSalesCount : null;
  const sellerBadges = Array.isArray(listing.sellerSnapshot?.badges) ? listing.sellerSnapshot!.badges! : [];

  const isAuction = listing.type === 'auction';
  const isFixed = listing.type === 'fixed';
  const isClassified = listing.type === 'classified';
  const listingTypeLabel = isAuction ? 'Auction' : isFixed ? 'Fixed Price' : isClassified ? 'Classified' : (listing.type ? String(listing.type) : 'Listing');
  const bestOfferEnabled = Boolean((listing as any).bestOfferEnabled);
  const bidCount = Number((listing as any)?.metrics?.bidCount || 0) || 0;
  const watchers =
    typeof (listing as any)?.watcherCount === 'number'
      ? Math.max(0, Math.floor(Number((listing as any).watcherCount)))
      : Math.max(0, Math.floor(Number((listing as any)?.metrics?.favorites || 0) || 0));

  const endsAtDate = useMemo(() => {
    const v: any = (listing as any)?.endsAt;
    if (!v) return null as Date | null;
    if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
    if (typeof v?.toDate === 'function') {
      try {
        const d = v.toDate();
        return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if (typeof v?.seconds === 'number') {
      const d = new Date(v.seconds * 1000);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof v === 'string' || typeof v === 'number') {
      const d = new Date(v);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    return null;
  }, [(listing as any)?.endsAt]);

  const rawSellerPhoto: string | null =
    (listing as any)?.sellerSnapshot?.photoURL ||
    (listing as any)?.sellerPhotoURL ||
    (listing as any)?.seller?.photoURL ||
    null;
  const sellerPhotoUrl: string | null =
    typeof rawSellerPhoto === 'string' && rawSellerPhoto.trim().startsWith('http')
      ? rawSellerPhoto.trim()
      : null;

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

  const primaryPriceBrowse = (() => {
    if (isAuction) return Number((listing as any).currentBid || (listing as any).startingBid || 0) || 0;
    return Number((listing as any).price || 0) || 0;
  })();

  const specs = useMemo(() => {
    // eBay-style “at a glance” line: Species • Sex • Age • Quantity
    const attrs: any = listing.attributes || null;
    if (!attrs) return null;

    const quantity = (() => {
      const q = attrs.quantity ?? (listing as any)?.quantityTotal ?? (listing as any)?.quantityAvailable;
      const n = typeof q === 'number' ? q : Number(q);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();

    const qtyLabel = (() => {
      if (!quantity || quantity < 1) return null;
      if (listing.category === 'cattle_livestock') return `${quantity} head`;
      if (listing.category === 'sporting_working_dogs') return `${quantity} dog${quantity === 1 ? '' : 's'}`;
      if (listing.category === 'horse_equestrian') return `${quantity} horse${quantity === 1 ? '' : 's'}`;
      if (listing.category === 'whitetail_breeder' || listing.category === 'wildlife_exotics') return `${quantity} animal${quantity === 1 ? '' : 's'}`;
      return `Qty: ${quantity}`;
    })();

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

      const parts = [speciesLabel, sexLabel, ageLabel, qtyLabel].filter(Boolean) as string[];
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

      const parts = [breed || null, sexLabel, ageLabel, qtyLabel].filter(Boolean) as string[];
      return parts.length ? parts : null;
    }

    // Ranch equipment / vehicles / hunting assets: type • year • condition
    if (listing.category === 'ranch_equipment' || listing.category === 'ranch_vehicles' || listing.category === 'hunting_outfitter_assets') {
      const e: any = attrs;
      const typeLabel = e.equipmentType ? String(e.equipmentType).trim() : null;
      const yearLabel = e.year !== undefined && e.year !== null ? `Year: ${String(e.year)}` : null;
      const condLabel = e.condition ? String(e.condition).trim() : null;
      const parts = [typeLabel, yearLabel || condLabel, qtyLabel].filter(Boolean) as string[];
      return parts.length ? parts : null;
    }

    // Sporting/Working Dogs: breed • sex • age
    if (listing.category === 'sporting_working_dogs') {
      const d: any = attrs;
      const breedLabel = d.breed ? String(d.breed).trim() : null;
      const sexRaw = d.sex ? String(d.sex).trim() : '';
      const sexLabel =
        sexRaw === 'male' ? 'Male' : sexRaw === 'female' ? 'Female' : sexRaw === 'unknown' ? null : titleCase(sexRaw);
      const ageLabel = formatAge(d.age);
      const parts = [breedLabel, sexLabel, ageLabel, qtyLabel].filter(Boolean) as string[];
      return parts.length ? parts : null;
    }

    // Horse: Horse • Sex • Age (and Registered when present)
    if (listing.category === 'horse_equestrian') {
      const h = attrs as HorseAttributes;
      const sexRaw = h.sex ? String(h.sex).trim() : '';
      const sexLabel =
        sexRaw === 'stallion' ? 'Stallion' :
        sexRaw === 'mare' ? 'Mare' :
        sexRaw === 'gelding' ? 'Gelding' :
        sexRaw === 'unknown' ? null :
        sexRaw ? titleCase(sexRaw) : null;
      const ageLabel = formatAge(h.age);
      const reg = h.registered ? 'Registered' : null;
      const parts = ['Horse', sexLabel, ageLabel || reg, qtyLabel].filter(Boolean) as string[];
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

  const auctionEnded = endsAtDate ? endsAtDate.getTime() <= Date.now() : false;
  const isCurrentHighBidder = Boolean(
    user?.uid &&
    isAuction &&
    !sold.isSold &&
    !auctionEnded &&
    listing.currentBidderId === user.uid
  );

  if (variant === 'browseMobile') {
    return (
      <motion.div ref={ref} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="w-full">
        <Link href={`/listing/${listing.id}`} className="block">
          <Card className="overflow-hidden rounded-xl border border-border/60 bg-card hover:shadow-warm">
            <div className="flex">
              <div className="relative w-[96px] min-w-[96px] h-[112px] bg-muted overflow-hidden">
                {coverUrl ? (
                  <div className="absolute inset-0 overflow-hidden">
                    <div
                      className="absolute inset-0"
                      style={{
                        transform: `scale(${coverCropZoom})`,
                        transformOrigin: coverObjectPosition || '50% 50%',
                      }}
                    >
                      <Image
                        src={coverUrl}
                        alt={listing.title}
                        fill
                        className="object-cover"
                        style={coverObjectPosition ? { objectPosition: coverObjectPosition } : undefined}
                        sizes="96px"
                        loading="lazy"
                        quality={85}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No Image</div>
                )}
              </div>

              <div className="flex-1 min-w-0 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
                      <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0 h-5">
                        {listingTypeLabel}
                      </Badge>
                      {specs && specs.length > 0 ? (
                        <span className="text-[11px] text-muted-foreground font-medium">
                          {specs.join(' · ')}
                        </span>
                      ) : null}
                    </div>
                    <div className="font-extrabold text-[15px] leading-snug line-clamp-2 mt-1">{listing.title}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">
                        {listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    <FavoriteButton listingId={listing.id} className="h-9 w-9" />
                  </div>
                </div>

                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-lg font-extrabold text-primary leading-none">
                        ${primaryPriceBrowse ? primaryPriceBrowse.toLocaleString() : 'Contact'}
                      </span>
                      {isCurrentHighBidder && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary shrink-0" role="status">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          You're winning
                        </span>
                      )}
                    </div>
                    {bestOfferEnabled ? (
                      <div className="mt-1 text-[11px] font-semibold text-muted-foreground">Best Offer</div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={watchers > 0 ? 'secondary' : 'outline'} className="text-[11px] font-semibold">
                      <Heart className="h-3 w-3 mr-1" />
                      {watchers > 0 ? watchers : 0}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Link>
      </motion.div>
    );
  }

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
        <Card className="overflow-hidden transition-all duration-300 rounded-xl flex flex-row md:grid md:grid-cols-[288px_1fr] h-full w-full border border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
          {/* Watchlist heart (top-right corner of the card, not on the image) */}
          <div className="absolute top-2 right-2 z-30">
            <FavoriteButton listingId={listing.id} className="bg-card/95 backdrop-blur-sm border border-border/50" />
          </div>

          {/* Image */}
          <div className="relative w-32 sm:w-44 md:w-full h-32 sm:h-44 md:h-full min-h-[128px] md:min-h-[208px] flex-shrink-0 bg-muted overflow-hidden rounded-l-xl">
            
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
                    sizes="(max-width: 640px) 128px, (max-width: 768px) 176px, (max-width: 1024px) 288px, 320px"
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
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 p-3 sm:p-4 md:p-5">
            <div className="flex flex-col gap-3 md:grid md:grid-cols-[1fr_220px] md:gap-5 md:items-stretch">
              {/* Left: details */}
              <div className="min-w-0 flex flex-col gap-2">
                {/* Listing type + title */}
                <div className="flex flex-wrap items-center gap-2 gap-y-1 pr-10">
                  <Badge variant="outline" className="text-[10px] sm:text-xs font-semibold px-2 py-0.5">
                    {listingTypeLabel}
                  </Badge>
                  <h3 className="font-bold text-[15px] sm:text-base md:text-lg leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-300 min-w-0">
                    {listing.title}
                  </h3>
                </div>

                {/* Location */}
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground min-w-0">
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">
                    {listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}
                  </span>
                </div>

                {/* Date (closer to title), then price, then bids + time-left row */}
                <div className="space-y-1 pt-0.5">
                  {!sold.isSold && (listing as any)?.offerReservedByOfferId ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="secondary"
                        className="text-[11px] sm:text-xs bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30"
                        title="Reserved by an accepted offer"
                      >
                        Reserved (offer accepted)
                      </Badge>
                    </div>
                  ) : null}
                  {sold.isSold ? (
                    <>
                      <div className="text-sm sm:text-base font-extrabold">{sold.soldPriceLabel}</div>
                      {sold.soldDateLabel ? (
                        <div className="text-xs text-muted-foreground">{sold.soldDateLabel}</div>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-lg sm:text-xl md:text-2xl font-extrabold text-primary leading-none">
                        ${primaryPrice ? primaryPrice.toLocaleString() : 'Contact'}
                      </span>
                      {isCurrentHighBidder && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary shrink-0" role="status">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          You're winning
                        </span>
                      )}
                    </div>
                  )}

                  {isAuction && !sold.isSold ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="font-semibold text-foreground/90">
                        {bidCount} {bidCount === 1 ? 'bid' : 'bids'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        <span className="font-semibold">Time left</span>
                      </span>
                      <CountdownTimer
                        endsAt={listing.endsAt as any}
                        variant="compact"
                        showIcon={false}
                        pulseWhenEndingSoon={false}
                        className="text-xs"
                      />
                      <span>left</span>
                    </div>
                  ) : null}

                  {!sold.isSold && !isAuction && bestOfferEnabled ? (
                    <div className="text-xs text-muted-foreground">or Best Offer</div>
                  ) : null}
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

                {/* Trust */}
                <div className="pt-1">
                  <TrustBadges
                    verified={listing.trust?.verified || false}
                    transport={listing.trust?.transportReady || false}
                    size="sm"
                    className="flex-wrap gap-2"
                  />
                </div>

                {/* Watchers and Badges */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {watchers > 0 && (
                    <Badge variant="secondary" className="text-[11px] font-semibold">
                      <Heart className="h-3 w-3 mr-1" />
                      {watchers} {watchers === 1 ? 'watching' : 'watching'}
                    </Badge>
                  )}
                  {listing.transportOption !== 'BUYER_TRANSPORT' && (
                    <Badge variant="outline" className="text-[11px] font-semibold" title="Seller schedules delivery; buyer confirms receipt">
                      Seller arranges delivery
                    </Badge>
                  )}
                  {listing.protectedTransactionEnabled && listing.protectedTransactionDays ? (
                    <Badge
                      variant="default"
                      className="bg-green-600 text-white font-semibold text-[11px]"
                      title="Protected Transaction"
                    >
                      Protected {listing.protectedTransactionDays} Days
                    </Badge>
                  ) : null}
                </div>
              </div>

              {/* Right: less important info (seller, etc.) */}
              <div className="md:border-l md:pl-5 md:border-border/40 flex flex-col gap-3 min-w-0 overflow-hidden">
                <div className="mt-auto rounded-lg border border-border/50 bg-muted/10 p-3 space-y-2 min-w-0 overflow-hidden">
                  <div className="text-xs text-muted-foreground font-semibold">Sold by</div>
                  <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                    <div className="h-8 w-8 rounded-full border bg-muted/30 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {sellerPhotoUrl ? (
                        <Image
                          src={sellerPhotoUrl}
                          alt="Seller profile"
                          width={32}
                          height={32}
                          className="h-8 w-8 object-cover"
                          quality={75}
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-xs font-bold text-muted-foreground">
                          {(listing.sellerSnapshot?.displayName || listing.seller?.name || 'S')
                            .trim()
                            .slice(0, 1)
                            .toUpperCase()}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-sm font-bold truncate text-left hover:underline min-w-0 overflow-hidden flex-1 max-w-full"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const sellerId = listing.sellerId;
                        if (!sellerId) return;
                        router.push(`/sellers/${sellerId}?from=${encodeURIComponent(`/listing/${listing.id}`)}`);
                      }}
                      aria-label="View seller profile"
                    >
                      {listing.sellerSnapshot?.displayName || listing.seller?.name || 'Seller'}
                    </button>
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

// Memoize with custom comparison to prevent re-renders when favoriteIds changes
// Only re-render if listing ID or variant changed (listing object reference may change but content is same)
export const ListItem = React.memo(ListItemComponent, (prevProps, nextProps) => {
  return prevProps.listing.id === nextProps.listing.id && 
         prevProps.variant === nextProps.variant;
});
ListItem.displayName = 'ListItem';

