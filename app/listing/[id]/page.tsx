import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getListingForSSR } from '@/lib/server/listings';
import { ListingShell } from './ListingShell';
import { BRAND_DISPLAY_NAME } from '@/lib/brand';

const ListingDetailInteractiveClient = dynamic(
  () => import('./ListingDetailInteractiveClient').then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="container mx-auto px-4 py-4 md:py-6 max-w-7xl">
        <div className="lg:col-span-5 rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          Loading actions…
        </div>
      </div>
    ),
  }
);

/** Resolve params (Next 14 = object, Next 15 = Promise) */
async function resolveParams(params: Promise<{ id: string }> | { id: string }): Promise<{ id: string }> {
  return typeof (params as Promise<{ id: string }>).then === 'function' ? await (params as Promise<{ id: string }>) : (params as { id: string });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const { id } = await resolveParams(params);
  let listing = null;
  try {
    listing = await getListingForSSR(id);
  } catch {
    return { title: `Listing | ${BRAND_DISPLAY_NAME}` };
  }
  if (!listing) return { title: `Listing | ${BRAND_DISPLAY_NAME}` };
  const description =
    typeof listing.description === 'string'
      ? listing.description.slice(0, 160) + (listing.description.length > 160 ? '…' : '')
      : listing.title;
  const mainImage =
    listing.photos?.[0]?.url ?? listing.images?.[0] ?? undefined;
  return {
    title: `${listing.title} | ${BRAND_DISPLAY_NAME}`,
    description,
    openGraph: {
      title: listing.title,
      description,
      ...(mainImage && { images: [{ url: mainImage, alt: listing.title }] }),
    },
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolved = await resolveParams(params);
  const { id } = resolved;
  // #region agent log
  try {
    await fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'app/listing/[id]/page.tsx:ListingDetailPage',
        message: 'listing page entry',
        data: { id, idType: typeof id },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'A',
      }),
    }).catch(() => {});
  } catch (_) {}
  // #endregion
  // #region agent log
  let listing = null;
  try {
    listing = await getListingForSSR(id);
    await fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'app/listing/[id]/page.tsx:after getListingForSSR',
        message: 'getListingForSSR result',
        data: { id, hasListing: !!listing },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'B',
      }),
    }).catch(() => {});
  } catch (err: unknown) {
    await fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'app/listing/[id]/page.tsx:getListingForSSR catch',
        message: 'getListingForSSR threw',
        data: { id, errorMessage: (err as Error)?.message, errorName: (err as Error)?.name },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        hypothesisId: 'B',
      }),
    }).catch(() => {});
    // Show 404 instead of error boundary so "ending soon" links don't show "Something went wrong"
    notFound();
  }
  // #endregion

  if (!listing) {
    notFound();
  }

  // Serialize listing to plain data for client component (convert Dates to ISO strings)
  const serializedListing = JSON.parse(JSON.stringify(listing));

  return (
    <div id="listing-page">
      <ListingShell listing={listing} />
      <ListingDetailInteractiveClient listingId={id} initialListing={serializedListing} />
    </div>
  );
}
