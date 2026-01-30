import Link from 'next/link';
import Image from 'next/image';
import type { Listing } from '@/lib/types';

/** Server-rendered essentials for SEO and first paint. No interactivity. */
export function ListingShell({ listing }: { listing: Listing }) {
  const mainImage =
    listing.photos?.[0]?.url ??
    listing.images?.[0] ??
    '/images/placeholder.png';
  const shortDescription =
    typeof listing.description === 'string'
      ? listing.description.slice(0, 300) + (listing.description.length > 300 ? '…' : '')
      : '';

  return (
    <div
      data-listing-server-shell
      className="min-h-screen bg-background pb-bottom-nav-safe md:pb-0"
      aria-hidden="false"
    >
      <div className="border-b border-border/50 bg-card/50 sticky top-0 z-30">
        <div className="container mx-auto px-4 py-3">
          <Link
            href="/browse"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ← Back
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 md:py-6 max-w-7xl">
        <div className="mb-5 md:mb-6">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight break-words">
            {listing.title}
          </h1>
          {(listing.location?.city || listing.location?.state) && (
            <p className="mt-2 text-sm text-muted-foreground">
              {[listing.location.city, listing.location.state].filter(Boolean).join(', ')}
            </p>
          )}
        </div>

        <div className="relative aspect-[4/3] w-full bg-muted overflow-hidden rounded-xl mb-6">
          <Image
            src={mainImage}
            alt={listing.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 70vw, 50vw"
            priority
          />
        </div>

        <div className="space-y-4">
          <p className="text-2xl sm:text-3xl font-extrabold text-foreground">
            {listing.type === 'auction'
              ? `$${(listing.currentBid ?? listing.startingBid ?? 0).toLocaleString()}`
              : `$${(listing.price ?? 0).toLocaleString()}`}
          </p>
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {shortDescription}
          </p>
          {(listing.location?.city || listing.location?.state) && (
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold">Location:</span>{' '}
              {[listing.location.city, listing.location.state].filter(Boolean).join(', ')}
            </p>
          )}
          {(listing.sellerSnapshot?.displayName ?? listing.seller?.name) && (
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold">Seller:</span>{' '}
              {listing.sellerSnapshot?.displayName ?? listing.seller?.name ?? 'Seller'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
