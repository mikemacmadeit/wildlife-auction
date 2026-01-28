/**
 * GET /api/offers/seller
 *
 * Seller inbox: list offers across all my listings.
 * (Not strictly required by the spec route list, but required for a usable "Offers inbox" UI.)
 */

import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { getPrimaryListingImageUrl, json, requireAuth, requireRateLimit } from '../_util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  status: z.string().optional(),
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
    acceptedAmount: data.acceptedAmount,
    acceptedAt: tsToMillis(data.acceptedAt),
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
    limit: url.searchParams.get('limit') || undefined,
  });
  if (!parsed.success) return json({ error: 'Invalid query' }, { status: 400 });

  const sellerId = auth.decoded.uid;
  const limitN = Math.max(1, Math.min(100, Number(parsed.data.limit || 50) || 50));
  const status = parsed.data.status;

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (e: any) {
    return json(
      {
        error: 'Server is not configured for offers yet',
        code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
        message: e?.message || 'Failed to initialize Firebase Admin SDK',
        missing: e?.missing || undefined,
      },
      { status: 503 }
    );
  }

  try {
    // Avoid composite-index requirements by querying only on sellerId and filtering/sorting in-memory.
    // This matches the buyer endpoint strategy and prevents opaque 500s in production if indexes differ.
    const snap = await db.collection('offers').where('sellerId', '==', sellerId).limit(250).get();
    let offers = snap.docs.map(serializeOffer);

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

    // Hydrate seller display names (for "Seller" column in Offers tab).
    try {
      const sellerIds = Array.from(new Set(offers.map((o: any) => String(o.sellerId || '')).filter(Boolean)));
      const userSnaps = await Promise.all(sellerIds.map((id) => db.collection('users').doc(id).get().catch(() => null as any)));
      const sellerNameByUid = new Map<string, string>();
      userSnaps.forEach((s: any, idx: number) => {
        const uid = sellerIds[idx];
        if (s && s.exists) {
          const d = s.data() as any;
          const name = d?.displayName || d?.profile?.fullName || '';
          if (name) sellerNameByUid.set(uid, name);
        }
      });
      offers = offers.map((o: any) => ({
        ...o,
        sellerDisplayName:
          sellerNameByUid.get(String(o.sellerId || '')) ??
          (o.listingSnapshot as any)?.sellerSnapshot?.displayName ??
          undefined,
      }));
    } catch {
      // best-effort
    }

    offers.sort((a: any, b: any) => {
      const am = typeof a.updatedAt === 'number' ? a.updatedAt : 0;
      const bm = typeof b.updatedAt === 'number' ? b.updatedAt : 0;
      return bm - am;
    });

    return json(
      { ok: true, offers: offers.slice(0, limitN) },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (e: any) {
    const msg = String(e?.message || 'Unknown error');
    const code = String(e?.code || '');
    const isMissingIndex =
      code === 'failed-precondition' ||
      code === '9' ||
      msg.toLowerCase().includes('requires an index') ||
      msg.toLowerCase().includes('failed-precondition');

    if (isMissingIndex) {
      return json(
        {
          error: 'Offer system is warming up',
          code: 'FIRESTORE_INDEX_REQUIRED',
          message:
            'The database index needed to load offers is still building or not deployed yet. Please try again in a few minutes.',
        },
        { status: 503 }
      );
    }

    return json(
      {
        error: 'Failed to load offers',
        code: 'OFFERS_QUERY_FAILED',
        message: msg,
      },
      { status: 500 }
    );
  }
}

