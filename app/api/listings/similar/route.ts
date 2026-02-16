/**
 * GET /api/listings/similar
 *
 * Returns "more like this" active listings for discovery (same category, optional state/attributes).
 * Public; no auth required.
 *
 * Query params:
 * - listingId (required) — exclude this listing and use its category/state/attributes
 * - limit (optional, default 6, max 12)
 */
import { getAdminDb } from '@/lib/firebase/admin';
import { getSiteUrl } from '@/lib/site-url';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function toListingSummary(doc: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> {
  const d = doc.data() as any;
  const price = typeof d?.price === 'number' ? d.price : typeof d?.currentBid === 'number' ? d.currentBid : typeof d?.startingBid === 'number' ? d.startingBid : null;
  const primaryImage =
    (Array.isArray(d?.photos) && d.photos.length > 0 && typeof d.photos[0]?.url === 'string' && d.photos[0].url) ||
    (Array.isArray(d?.images) && d.images.length > 0 && typeof d.images[0] === 'string' && d.images[0]) ||
    null;
  return {
    id: doc.id,
    title: typeof d?.title === 'string' ? d.title : '',
    category: typeof d?.category === 'string' ? d.category : null,
    type: typeof d?.type === 'string' ? d.type : null,
    price: price != null ? price : null,
    startingBid: typeof d?.startingBid === 'number' ? d.startingBid : null,
    currentBid: typeof d?.currentBid === 'number' ? d.currentBid : null,
    location: d?.location && typeof d.location === 'object' ? { city: d.location.city, state: d.location.state } : null,
    primaryImageUrl: primaryImage,
    status: typeof d?.status === 'string' ? d.status : 'active',
    endsAt: d?.endsAt ? (typeof d.endsAt?.toDate === 'function' ? d.endsAt.toDate().toISOString() : d.endsAt) : null,
    sellerId: typeof d?.sellerId === 'string' ? d.sellerId : null,
    sellerSnapshot: d?.sellerSnapshot && typeof d.sellerSnapshot === 'object' ? { displayName: d.sellerSnapshot.displayName } : null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const listingId = String(url.searchParams.get('listingId') || '').trim();
  const limitRaw = Math.min(12, Math.max(1, Number(url.searchParams.get('limit')) || 6));
  const limit = Math.floor(limitRaw);

  if (!listingId) return json({ ok: false, error: 'listingId is required', items: [] }, { status: 400 });

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', items: [] }, { status: 503 });
  }

  const listingRef = db.collection('listings').doc(listingId);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) return json({ ok: true, items: [] });

  const listing = listingSnap.data() as any;
  const category = typeof listing?.category === 'string' ? listing.category : null;
  const state = typeof listing?.location?.state === 'string' ? listing.location.state : null;

  if (!category) return json({ ok: true, items: [] });

  let snap: FirebaseFirestore.QuerySnapshot;
  try {
    const baseQuery = db
      .collection('listings')
      .where('status', '==', 'active')
      .where('category', '==', category)
      .limit(limit + 15);
    snap = await baseQuery.get();
  } catch (e: any) {
    return json({ ok: true, items: [], error: (e as Error)?.message || 'Query failed' });
  }

  const siteUrl = getSiteUrl();
  const items: Record<string, unknown>[] = [];
  const seen = new Set<string>([listingId]);

  const docs = snap.docs.slice();
  if (state) {
    docs.sort((a, b) => {
      const aState = (a.data() as any)?.location?.state === state ? 1 : 0;
      const bState = (b.data() as any)?.location?.state === state ? 1 : 0;
      if (bState !== aState) return bState - aState;
      const aAt = (a.data() as any)?.publishedAt?.toDate?.()?.getTime() ?? 0;
      const bAt = (b.data() as any)?.publishedAt?.toDate?.()?.getTime() ?? 0;
      return bAt - aAt;
    });
  }

  for (const doc of docs) {
    if (doc.id === listingId || seen.has(doc.id)) continue;
    seen.add(doc.id);
    const sum = toListingSummary(doc);
    (sum as any).url = `${siteUrl}/listing/${doc.id}`;
    items.push(sum);
    if (items.length >= limit) break;
  }

  return json({ ok: true, items });
}
