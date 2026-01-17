import { format } from 'date-fns';
import type { Listing } from '@/lib/types';

export function formatUsdFromCents(cents: number): string {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '$0';
  const usd = n / 100;
  return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function getSoldSummary(listing: Pick<Listing, 'status' | 'type' | 'price' | 'currentBid' | 'soldAt' | 'soldPriceCents'>): {
  isSold: boolean;
  soldPriceLabel: string | null;
  soldDateLabel: string | null;
} {
  const isSold = listing.status === 'sold';
  if (!isSold) return { isSold: false, soldPriceLabel: null, soldDateLabel: null };

  let soldPriceLabel: string | null = null;
  if (typeof listing.soldPriceCents === 'number' && Number.isFinite(listing.soldPriceCents)) {
    soldPriceLabel = `Sold for ${formatUsdFromCents(listing.soldPriceCents)}`;
  } else {
    // Back-compat fallback.
    const fallback = listing.type === 'auction' ? listing.currentBid : listing.price;
    if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) {
      soldPriceLabel = `Sold for $${fallback.toLocaleString()}`;
    } else {
      soldPriceLabel = 'Sold';
    }
  }

  let soldDateLabel: string | null = null;
  const d = listing.soldAt || null;
  if (d instanceof Date && Number.isFinite(d.getTime())) {
    soldDateLabel = `Sold on ${format(d, 'MMM d, yyyy')}`;
  }

  return { isSold, soldPriceLabel, soldDateLabel };
}

