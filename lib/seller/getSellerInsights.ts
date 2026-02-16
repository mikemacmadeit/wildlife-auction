import type { SellerDashboardData, SellerDashboardListing, SellerDashboardOffer } from './getSellerDashboardData';

export type SellerInsightSeverity = 'info' | 'warning';

export interface SellerInsight {
  id: string;
  severity: SellerInsightSeverity;
  title: string;
  description: string;
  actionLabel?: string;
  actionUrl?: string;
  entity?: { type: 'listing' | 'offer'; id: string };
}

function median(nums: number[]): number | null {
  const arr = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

function hoursUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return ms / (60 * 60 * 1000);
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return ms / (24 * 60 * 60 * 1000);
}

function listingUrl(l: SellerDashboardListing) {
  return `/seller/listings/${l.id}/edit`;
}

function offerUrl(o: SellerDashboardOffer) {
  return `/seller/offers/${o.id}`;
}

/**
 * Phase 3A (A2): rules-first seller velocity insights.
 * Derived only from existing seller dashboard data (no new DB writes, no ML).
 */
export function getSellerInsights(data: SellerDashboardData): SellerInsight[] {
  const out: SellerInsight[] = [];

  const active = data.activeListings || [];
  const offers = data.offers || [];

  // 1) High watchers, no bids
  const highWatchNoBid = active
    .filter((l) => (l.watcherCount || 0) >= 5 && (l.bidCount || 0) === 0)
    .sort((a, b) => (b.watcherCount || 0) - (a.watcherCount || 0))
    .slice(0, 5);
  for (const l of highWatchNoBid) {
    out.push({
      id: `high_watch_no_bid:${l.id}`,
      severity: 'warning',
      title: 'High interest, no bids yet',
      description: `${l.watcherCount} people are watching “${l.title}”, but there are no bids.`,
      actionLabel: 'Review listing',
      actionUrl: listingUrl(l),
      entity: { type: 'listing', id: l.id },
    });
  }

  // 2) Offers expiring soon (seller action)
  const expiringSoon = offers
    .filter((o) => (o.status === 'open' || o.status === 'countered') && o.lastActorRole === 'buyer')
    .map((o) => ({ o, hrs: hoursUntil(o.expiresAt) }))
    .filter((x) => x.hrs !== null && x.hrs <= 6 && x.hrs > 0)
    .sort((a, b) => (a.hrs! - b.hrs!))
    .slice(0, 5);
  for (const { o, hrs } of expiringSoon) {
    out.push({
      id: `offer_expiring:${o.id}`,
      severity: hrs! <= 3 ? 'warning' : 'info',
      title: 'Offer expires soon',
      description: `Offer on “${o.listingTitle || o.listingId}” expires in ~${Math.round(hrs!)}h.`,
      actionLabel: 'Review offer',
      actionUrl: offerUrl(o),
      entity: { type: 'offer', id: o.id },
    });
  }

  // 3) Listings live longer than median (simple outlier rule)
  const ages = active.map((l) => daysSince(l.publishedAt || l.createdAt)).filter((d): d is number => typeof d === 'number');
  const medAge = median(ages);
  if (medAge !== null && medAge > 0) {
    const stale = active
      .map((l) => ({ l, age: daysSince(l.publishedAt || l.createdAt) }))
      .filter((x) => typeof x.age === 'number' && x.age > medAge * 1.5)
      .sort((a, b) => (b.age! - a.age!))
      .slice(0, 5);
    for (const { l, age } of stale) {
      out.push({
        id: `stale_listing:${l.id}`,
        severity: 'info',
        title: 'Listing is older than your median',
        description: `“${l.title}” has been live for ~${Math.round(age!)} days (median is ~${Math.round(medAge)}).`,
        actionLabel: 'Review listing',
        actionUrl: listingUrl(l),
        entity: { type: 'listing', id: l.id },
      });
    }
  }

  // 4) Simple listing-quality tips (rule-based)
  const addPhoto = active.filter((l) => (l.imageCount ?? 0) <= 1).slice(0, 5);
  for (const l of addPhoto) {
    out.push({
      id: `tip_add_photo:${l.id}`,
      severity: 'info',
      title: 'Add a photo',
      description: (l.imageCount ?? 0) === 0
        ? `“${l.title}” has no photos. Listings with multiple photos get more views.`
        : `“${l.title}” has only one photo. Adding more photos can improve engagement.`,
      actionLabel: 'Add photos',
      actionUrl: listingUrl(l),
      entity: { type: 'listing', id: l.id },
    });
  }

  const shortTitle = active.filter((l) => (l.title || '').trim().length > 0 && (l.title || '').trim().length < 30).slice(0, 5);
  for (const l of shortTitle) {
    out.push({
      id: `tip_longer_title:${l.id}`,
      severity: 'info',
      title: 'Longer title',
      description: `“${l.title}” has a short title (${(l.title || '').trim().length} characters). Consider a more descriptive title for better search and clarity.`,
      actionLabel: 'Edit listing',
      actionUrl: listingUrl(l),
      entity: { type: 'listing', id: l.id },
    });
  }

  const considerLower = active
    .filter((l) => l.type === 'fixed' && typeof l.price === 'number' && l.price > 0)
    .map((l) => ({ l, age: daysSince(l.publishedAt || l.createdAt) }))
    .filter((x) => typeof x.age === 'number' && x.age >= 14)
    .slice(0, 3);
  for (const { l } of considerLower) {
    out.push({
      id: `tip_consider_price:${l.id}`,
      severity: 'info',
      title: 'Consider lowering price',
      description: `“${l.title}” has been listed for 2+ weeks at $${(l.price ?? 0).toLocaleString()}. A lower price may attract more buyers.`,
      actionLabel: 'Edit listing',
      actionUrl: listingUrl(l),
      entity: { type: 'listing', id: l.id },
    });
  }

  // 5) Reserve far above recent sale prices (seller-only comps, rules-only)
  // Uses seller's own last-90d sale prices as baseline (no global comps).
  const orders90 = data.soldListings?.last90d || [];
  const saleByListingId = new Map<string, number>();
  orders90.forEach((o) => {
    if (o.listingId) saleByListingId.set(o.listingId, Number(o.amount || 0) || 0);
  });
  const saleAmounts = Array.from(saleByListingId.values()).filter((n) => n > 0);
  const medSale = median(saleAmounts);
  if (medSale !== null && medSale > 0) {
    const highReserve = active
      .filter((l) => l.type === 'auction' && typeof l.reservePrice === 'number' && l.reservePrice > medSale * 1.5)
      .sort((a, b) => (b.reservePrice! - a.reservePrice!))
      .slice(0, 3);
    for (const l of highReserve) {
      out.push({
        id: `reserve_high:${l.id}`,
        severity: 'info',
        title: 'Reserve may be too high',
        description: `Reserve for “${l.title}” is $${Math.round(l.reservePrice!).toLocaleString()}, which is >1.5× your recent median sale ($${Math.round(medSale).toLocaleString()}).`,
        actionLabel: 'Review reserve',
        actionUrl: listingUrl(l),
        entity: { type: 'listing', id: l.id },
      });
    }
  }

  return out;
}

