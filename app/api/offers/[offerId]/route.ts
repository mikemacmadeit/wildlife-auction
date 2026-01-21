/**
 * GET /api/offers/[offerId]
 *
 * Buyer/seller/admin can read a single offer (full history).
 */

import { getAdminDb } from '@/lib/firebase/admin';
import { getPrimaryListingImageUrl, isAdminUid, json, requireAuth, requireRateLimit } from '../_util';

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

export async function GET(request: Request, ctx: { params: { offerId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const uid = auth.decoded.uid;
  const offerId = ctx.params.offerId;

  const db = getAdminDb();
  const offerRef = db.collection('offers').doc(offerId);
  const snap = await offerRef.get();
  if (!snap.exists) return json({ error: 'Offer not found' }, { status: 404 });

  const offer = snap.data() as any;
  const admin = await isAdminUid(uid);
  if (!admin && offer.buyerId !== uid && offer.sellerId !== uid) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  // Best-effort: hydrate listing image for modal display.
  const base = serializeOffer(snap) as any;
  if (!base.listingImageUrl) {
    try {
      const listingSnap = await db.collection('listings').doc(String(base.listingId || '')).get();
      if (listingSnap.exists) {
        base.listingImageUrl = getPrimaryListingImageUrl(listingSnap.data());
      }
    } catch {
      // ignore
    }
  }

  return json({ ok: true, offer: base });
}

