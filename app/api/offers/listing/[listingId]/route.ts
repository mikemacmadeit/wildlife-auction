/**
 * GET /api/offers/listing/[listingId]
 *
 * Seller/admin view for a listing's offers.
 */

import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { isAdminUid, json, requireAuth, requireRateLimit } from '../../_util';

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

export async function GET(request: Request, ctx: { params: { listingId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const listingId = ctx.params.listingId;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: url.searchParams.get('status') || undefined,
    limit: url.searchParams.get('limit') || undefined,
  });
  if (!parsed.success) return json({ error: 'Invalid query' }, { status: 400 });

  const db = getAdminDb();
  const listingRef = db.collection('listings').doc(listingId);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) return json({ error: 'Listing not found' }, { status: 404 });
  const listing = listingSnap.data() as any;

  const uid = auth.decoded.uid;
  const admin = await isAdminUid(uid);
  if (!admin && listing.sellerId !== uid) return json({ error: 'Forbidden' }, { status: 403 });

  const limitN = Math.max(1, Math.min(100, Number(parsed.data.limit || 50) || 50));
  const status = parsed.data.status;

  let q: any = db.collection('offers').where('listingId', '==', listingId);
  if (status) q = q.where('status', '==', status);
  q = q.orderBy('updatedAt', 'desc').limit(limitN);
  const snap = await q.get();

  return json({ ok: true, offers: snap.docs.map(serializeOffer) });
}

