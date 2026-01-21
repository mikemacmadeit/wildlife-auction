/**
 * GET /api/offers/mine
 *
 * Buyer view: list my offers (optionally filter by status or listingId).
 */

import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { getPrimaryListingImageUrl, json, requireAuth, requireRateLimit } from '../_util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  status: z.string().optional(),
  listingId: z.string().optional(),
  limit: z.string().optional(),
});

function tsToMillis(v: any): number | null {
  if (!v) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

function serializeOffer(doc: any) {
  const data = doc.data();
  return {
    offerId: doc.id,
    listingId: data.listingId,
    listingSnapshot: data.listingSnapshot,
    listingImageUrl: typeof data?.listingSnapshot?.imageUrl === 'string' ? data.listingSnapshot.imageUrl : undefined,
    sellerId: data.sellerId,
    buyerId: data.buyerId,
    currency: data.currency,
    status: data.status,
    currentAmount: data.currentAmount,
    originalAmount: data.originalAmount,
    lastActorRole: data.lastActorRole,
    expiresAt: tsToMillis(data.expiresAt),
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
    history: Array.isArray(data.history)
      ? data.history.map((h: any) => ({ ...h, createdAt: tsToMillis(h.createdAt) }))
      : [],
    acceptedAmount: data.acceptedAmount,
    acceptedAt: tsToMillis(data.acceptedAt),
    acceptedBy: data.acceptedBy,
    checkoutSessionId: data.checkoutSessionId,
    orderId: data.orderId,
  };
}

export async function GET(request: Request) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: url.searchParams.get('status') || undefined,
    listingId: url.searchParams.get('listingId') || undefined,
    limit: url.searchParams.get('limit') || undefined,
  });
  if (!parsed.success) return json({ error: 'Invalid query' }, { status: 400 });

  const buyerId = auth.decoded.uid;
  const limitN = Math.max(1, Math.min(100, Number(parsed.data.limit || 50) || 50));
  const status = parsed.data.status;
  const listingId = parsed.data.listingId;
  const offerLimitRaw = Number(process.env.OFFER_MAX_OFFERS_PER_BUYER_PER_LISTING || '5');
  const offerLimit = Number.isFinite(offerLimitRaw) ? Math.max(1, Math.min(20, Math.round(offerLimitRaw))) : 5;

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (e: any) {
    // Common in misconfigured environments (missing FIREBASE_* env vars, bad private key formatting, etc.)
    return json(
      {
        error: 'Server is not configured for offers yet',
        code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
        message: e?.message || 'Failed to initialize Firebase Admin SDK',
      },
      { status: 503 }
    );
  }

  try {
    // Avoid composite-index requirements by querying only on buyerId and filtering in-memory.
    // (Firestore commonly requires indexes for multi-field filters + orderBy.)
    const snap = await db.collection('offers').where('buyerId', '==', buyerId).limit(200).get();
    const allOffers = snap.docs.map(serializeOffer);
    const offersUsedForListing =
      listingId ? allOffers.filter((o: any) => o.listingId === listingId).length : null;
    let offers = allOffers;

    if (listingId) offers = offers.filter((o: any) => o.listingId === listingId);
    if (status) offers = offers.filter((o: any) => o.status === status);

    // Hydrate listing image URLs (offers store a minimal snapshot; we need images on cards).
    try {
      const ids = Array.from(new Set(offers.map((o: any) => String(o.listingId || '')).filter(Boolean)));
      const snaps = await Promise.all(ids.map((id) => db.collection('listings').doc(id).get().catch(() => null as any)));
      const map = new Map<string, string>();
      snaps.forEach((s: any, idx: number) => {
        const id = ids[idx];
        if (s && s.exists) {
          const url = getPrimaryListingImageUrl(s.data());
          if (url) map.set(id, url);
        }
      });
      offers = offers.map((o: any) => ({ ...o, listingImageUrl: o.listingImageUrl || map.get(String(o.listingId)) || undefined }));
    } catch {
      // best-effort
    }

    offers.sort((a: any, b: any) => {
      const am = typeof a.updatedAt === 'number' ? a.updatedAt : 0;
      const bm = typeof b.updatedAt === 'number' ? b.updatedAt : 0;
      return bm - am;
    });

    return json({
      ok: true,
      offers: offers.slice(0, limitN),
      offerLimit: listingId
        ? {
            limit: offerLimit,
            used: offersUsedForListing || 0,
            left: Math.max(0, offerLimit - (offersUsedForListing || 0)),
          }
        : undefined,
    });
  } catch (e: any) {
    return json(
      {
        error: 'Failed to load offers',
        code: 'OFFERS_QUERY_FAILED',
        message: e?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

