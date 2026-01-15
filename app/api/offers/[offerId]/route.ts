/**
 * GET /api/offers/[offerId]
 *
 * Buyer/seller/admin can read a single offer (full history).
 */

import { getAdminDb } from '@/lib/firebase/admin';
import { isAdminUid, json, requireAuth, requireRateLimit } from '../_util';

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

  return json({ ok: true, offer: serializeOffer(snap) });
}

