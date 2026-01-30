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

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const listing = await getListingForSSR(id);
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
  params: { id: string };
}) {
  const { id } = params;
  const listing = await getListingForSSR(id);

  if (!listing) {
    notFound();
  }

  return (
    <div id="listing-page">
      <ListingShell listing={listing} />
      <ListingDetailInteractiveClient listingId={id} initialListing={listing} />
    </div>
  );
}
