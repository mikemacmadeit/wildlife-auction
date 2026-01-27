/**
 * GET /api/bids/mine
 *
 * Buyer view: list my bids, grouped by listing for management UI.
 * Auth required. Returns only bids for the current user (no global scan).
 */

import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: any, init?: { status?: number; headers?: Record<string, string> | Headers }) {
  const headers =
    init?.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : (init?.headers as Record<string, string> | undefined);
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...(headers || {}),
    },
  });
}

const querySchema = z.object({
  limit: z.string().optional(),
});

function tsToMillis(v: any): number | null {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

export async function GET(request: Request) {
  // Rate limit (cheap, before auth)
  const rl = rateLimitMiddleware(RATE_LIMITS.default);
  const rlRes = await rl(request as any);
  if (!rlRes.allowed) {
    return json(rlRes.body, {
      status: rlRes.status,
      headers: { 'Retry-After': rlRes.body.retryAfter.toString() },
    });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, { status: 401 });

  const token = authHeader.slice('Bearer '.length);
  let decoded: any;
  try {
    decoded = await getAdminAuth().verifyIdToken(token);
  } catch {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get('limit') || undefined,
  });
  if (!parsed.success) return json({ error: 'Invalid query' }, { status: 400 });

  const limitN = Math.max(1, Math.min(200, Number(parsed.data.limit || 100) || 100));

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (e: any) {
    return json(
      {
        error: 'Server is not configured for bids yet',
        code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
        message: e?.message || 'Failed to initialize Firebase Admin SDK',
      },
      { status: 503 }
    );
  }

  try {
    const bidsSnap = await db.collection('bids').where('bidderId', '==', uid).limit(250).get();
    const bids = bidsSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        listingId: data.listingId as string,
        amount: Number(data.amount || 0),
        createdAt: tsToMillis(data.createdAt),
      };
    });

    // Group by listingId (one row per listing for eBay-style management)
    const grouped = new Map<
      string,
      {
        listingId: string;
        myMaxBid: number;
        myBidCount: number;
        myLastBidAt: number | null;
      }
    >();

    for (const b of bids) {
      if (!b.listingId) continue;
      const prev = grouped.get(b.listingId);
      const createdAt = typeof b.createdAt === 'number' ? b.createdAt : null;
      if (!prev) {
        grouped.set(b.listingId, {
          listingId: b.listingId,
          myMaxBid: b.amount,
          myBidCount: 1,
          myLastBidAt: createdAt,
        });
      } else {
        prev.myMaxBid = Math.max(prev.myMaxBid, b.amount);
        prev.myBidCount += 1;
        if (createdAt && (!prev.myLastBidAt || createdAt > prev.myLastBidAt)) prev.myLastBidAt = createdAt;
      }
    }

    // IMPORTANT: Proxy bidding stores the authoritative "max bid" under:
    //   listings/{listingId}/autoBids/{uid}
    // The server can update max bid without writing a visible bid row (no price movement).
    // To keep UX honest, merge active autoBids into the "my bids" view.
    try {
      let autoSnap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
      try {
        autoSnap = await db
          .collectionGroup('autoBids')
          .where('userId', '==', uid)
          .where('enabled', '==', true)
          .limit(250)
          .get();
      } catch (e: any) {
        // Some environments may not have the composite index for (userId, enabled).
        // Fallback: query by userId only and filter enabled in memory.
        autoSnap = await db.collectionGroup('autoBids').where('userId', '==', uid).limit(250).get();
      }

      for (const d of autoSnap.docs) {
        const data = d.data() as any;
        if (data?.enabled === false) continue;

        // Expect path: listings/{listingId}/autoBids/{uid}
        const path = String(d.ref.path || '');
        const parts = path.split('/');
        const listingId = parts.length >= 2 && parts[0] === 'listings' ? parts[1] : null;
        if (!listingId) continue;

        const maxBidCents = Number(data?.maxBidCents || 0) || 0;
        const maxBidUsd = Math.round(maxBidCents) / 100;
        const updatedAt = tsToMillis(data?.updatedAt) || tsToMillis(data?.createdAt) || null;

        const prev = grouped.get(listingId);
        if (!prev) {
          grouped.set(listingId, {
            listingId,
            myMaxBid: maxBidUsd,
            // This is a "max bid" record; it's still a bid participation signal.
            myBidCount: 1,
            myLastBidAt: updatedAt,
          });
        } else {
          prev.myMaxBid = Math.max(prev.myMaxBid, maxBidUsd);
          if (updatedAt && (!prev.myLastBidAt || updatedAt > prev.myLastBidAt)) prev.myLastBidAt = updatedAt;
        }
      }
    } catch (e: any) {
      // If autoBids collectionGroup query fails (e.g. missing index), keep bids-only view.
      // Users with max-bid-only (no visible bid doc) may not see those listings—ensure autoBids indexes are deployed.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[bids/mine] autoBids collectionGroup skipped', (e as Error)?.message || String(e));
      }
    }

    const listingIds = Array.from(grouped.keys()).slice(0, limitN);
    const listingRefs = listingIds.map((id) => db.collection('listings').doc(id));
    // Firestore getAll accepts at most 100 refs per call; batch to avoid errors
    const BATCH = 100;
    const listingSnaps: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];
    for (let i = 0; i < listingRefs.length; i += BATCH) {
      const chunk = listingRefs.slice(i, i + BATCH);
      const snaps = await db.getAll(...chunk);
      listingSnaps.push(...snaps);
    }

    const sellerIds = new Set<string>();
    const listingById = new Map<string, any>();
    for (const snap of listingSnaps) {
      if (!snap.exists) continue;
      const data = snap.data() as any;
      listingById.set(snap.id, data);
      if (data?.sellerId) sellerIds.add(String(data.sellerId));
    }

    const sellerRefs = Array.from(sellerIds).map((id) => db.collection('users').doc(id));
    const sellerSnapsBatch: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];
    for (let i = 0; i < sellerRefs.length; i += BATCH) {
      const chunk = sellerRefs.slice(i, i + BATCH);
      const snaps = await db.getAll(...chunk);
      sellerSnapsBatch.push(...snaps);
    }
    const sellerSnaps = sellerSnapsBatch;
    const sellerNameById = new Map<string, string>();
    for (const s of sellerSnaps) {
      if (!s.exists) continue;
      const data = s.data() as any;
      const name = data?.profile?.fullName || data?.profile?.displayName || data?.displayName || data?.email || 'Seller';
      sellerNameById.set(s.id, String(name));
    }

    const now = Date.now();
    const rows = listingIds.map((listingId) => {
      const g = grouped.get(listingId)!;
      const listing = listingById.get(listingId) || null;

      const type = listing?.type || 'unknown';
      const title = listing?.title || 'Listing removed or deleted';
      const image = Array.isArray(listing?.images) ? listing.images[0] : undefined;
      const sellerId = listing?.sellerId || undefined;
      const sellerName = sellerId ? sellerNameById.get(String(sellerId)) : undefined;

      const endsAtMs = tsToMillis(listing?.endsAt);
      const isEnded = typeof endsAtMs === 'number' ? endsAtMs <= now : false;
      const currentHighestBid = Number(listing?.currentBid ?? listing?.startingBid ?? 0);
      const currentHighestBidderId = listing?.currentBidderId || undefined;

      let status: 'WINNING' | 'OUTBID' | 'WON' | 'LOST' = 'OUTBID';
      if (type === 'auction') {
        if (isEnded) status = currentHighestBidderId === uid ? 'WON' : 'LOST';
        else status = currentHighestBidderId === uid ? 'WINNING' : 'OUTBID';
      } else {
        // Non-auction listings shouldn't normally have bids, but be defensive.
        status = 'OUTBID';
      }

      return {
        kind: 'bid' as const,
        listingId,
        listingType: type,
        listingTitle: title,
        listingImage: image,
        sellerId,
        sellerName,
        myMaxBid: g.myMaxBid,
        myBidCount: g.myBidCount,
        myLastBidAt: g.myLastBidAt,
        currentHighestBid,
        endsAt: endsAtMs,
        status,
      };
    });

    // Sort: newest activity first
    rows.sort((a: any, b: any) => (b.myLastBidAt || 0) - (a.myLastBidAt || 0));

    return json({ ok: true, bids: rows.slice(0, limitN) });
  } catch (e: any) {
    return json({ error: 'Failed to load bids', code: 'BIDS_QUERY_FAILED', message: e?.message || 'Unknown error' }, { status: 500 });
  }
}

