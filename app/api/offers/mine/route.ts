/**
 * GET /api/offers/mine
 *
 * Buyer view: list my offers (optionally filter by status or listingId).
 */

import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { json, requireAuth, requireRateLimit } from '../_util';

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

  let db;
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
  let q: any = db.collection('offers').where('buyerId', '==', buyerId);
  if (listingId) q = q.where('listingId', '==', listingId);
  if (status) q = q.where('status', '==', status);
  q = q.orderBy('updatedAt', 'desc').limit(limitN);

  const snap = await q.get();
  return json({ ok: true, offers: snap.docs.map(serializeOffer) });
}

