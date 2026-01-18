/**
 * GET /api/listings/comps
 *
 * Returns similar sold comps for a given listing (Admin SDK query).
 *
 * Query params:
 * - listingId (required)
 * - windowDays (optional: 30 | 90, default 90)
 *
 * Output:
 * { comps: Array<{ listingId, title, soldAt, soldPriceCents, location, primaryImageUrl, urlSlug? }>, stats?: { count, medianCents, p25Cents, p75Cents } }
 */
import { getAdminDb } from '@/lib/firebase/admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function clampWindowDays(raw: string | null): 30 | 90 {
  const n = Number(raw);
  return n === 30 ? 30 : 90;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? null;
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? 0;
  const t = idx - lo;
  return Math.round(a + (b - a) * t);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const listingId = String(url.searchParams.get('listingId') || '').trim();
  if (!listingId) return json({ error: 'listingId is required' }, { status: 400 });

  const windowDays = clampWindowDays(url.searchParams.get('windowDays'));

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (e: any) {
    return json({ error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const listingSnap = await db.collection('listings').doc(listingId).get();
  if (!listingSnap.exists) return json({ comps: [] });

  const listing = listingSnap.data() as any;
  const category = typeof listing?.category === 'string' ? listing.category : null;
  const state = typeof listing?.location?.state === 'string' ? listing.location.state : null;
  const speciesId =
    typeof listing?.attributes?.speciesId === 'string' && listing.attributes.speciesId.trim()
      ? String(listing.attributes.speciesId)
      : null;
  const breed =
    typeof listing?.attributes?.breed === 'string' && listing.attributes.breed.trim()
      ? String(listing.attributes.breed)
      : null;

  if (!category || !state) {
    // Can't match meaningfully without these basics; return empty.
    return json({ comps: [] });
  }

  const now = Date.now();
  const windowStart = new Date(now - windowDays * 24 * 60 * 60 * 1000);

  // Base query: sold listings in the time window, matched by category + state.
  // Note: This may require a composite index (status + soldAt + category + location.state).
  // We intentionally do not create index files here; see PR notes.
  let q = db
    .collection('listings')
    .where('status', '==', 'sold')
    .where('category', '==', category)
    .where('location.state', '==', state)
    .where('soldAt', '>=', windowStart)
    .orderBy('soldAt', 'desc')
    .limit(30); // fetch extra to allow in-memory tightening + self-filter

  // If the listing has a stable match key (existing schema), include it.
  // We do NOT invent new fields.
  if (speciesId) {
    q = q.where('attributes.speciesId', '==', speciesId);
  } else if (breed) {
    q = q.where('attributes.breed', '==', breed);
  }

  let snap: FirebaseFirestore.QuerySnapshot;
  try {
    snap = await q.get();
  } catch (e: any) {
    // Fail open: return empty so listing page doesn't break.
    return json({ comps: [], error: 'Failed to query comps', message: e?.message || String(e) }, { status: 200 });
  }

  const comps = snap.docs
    .filter((d) => d.id !== listingId)
    .map((d) => {
      const data = d.data() as any;
      const soldAt = data?.soldAt?.toDate?.() ? data.soldAt.toDate() : data?.soldAt instanceof Date ? data.soldAt : null;
      const soldPriceCents = typeof data?.soldPriceCents === 'number' ? Math.round(data.soldPriceCents) : null;
      const images: string[] = Array.isArray(data?.images) ? data.images.map(String) : [];
      const photos: any[] = Array.isArray(data?.photos) ? data.photos : [];
      const primaryImageUrl =
        (photos.find((p) => p && typeof p.url === 'string')?.url as string | undefined) ||
        images[0] ||
        '';
      const loc = data?.location && typeof data.location === 'object' ? data.location : {};
      return {
        listingId: d.id,
        title: typeof data?.title === 'string' ? data.title : 'Sold listing',
        soldAt: soldAt ? soldAt.toISOString() : null,
        soldPriceCents,
        location: {
          city: typeof loc?.city === 'string' ? loc.city : '',
          state: typeof loc?.state === 'string' ? loc.state : '',
        },
        primaryImageUrl,
        urlSlug: typeof data?.urlSlug === 'string' ? data.urlSlug : undefined,
      };
    })
    .filter((c) => typeof c.soldPriceCents === 'number' && c.soldPriceCents > 0 && typeof c.soldAt === 'string');

  const limited = comps.slice(0, 12);

  const prices = limited.map((c) => c.soldPriceCents as number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const stats =
    prices.length >= 3
      ? {
          count: prices.length,
          medianCents: percentile(prices, 0.5) as number,
          p25Cents: percentile(prices, 0.25) as number,
          p75Cents: percentile(prices, 0.75) as number,
        }
      : undefined;

  return json({ comps: limited, ...(stats ? { stats } : {}) });
}

