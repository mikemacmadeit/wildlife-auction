/**
 * POST /api/offers/[offerId]/decline
 *
 * Seller declines an offer, or buyer declines a seller counter.
 */

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/audit/logger';
import { json, requireAuth, requireRateLimit } from '../../_util';

const declineSchema = z.object({
  note: z.string().max(500).optional(),
});

export async function POST(request: Request, ctx: { params: { offerId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const actorId = auth.decoded.uid;

  let body: any = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const parsed = declineSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });

  const note = parsed.data.note;
  const offerId = ctx.params.offerId;
  const db = getAdminDb();
  const offerRef = db.collection('offers').doc(offerId);

  try {
    const now = Timestamp.now();
    const result = await db.runTransaction(async (tx) => {
      const offerSnap = await tx.get(offerRef);
      if (!offerSnap.exists) return { ok: false as const, status: 404, body: { error: 'Offer not found' } };
      const offer = offerSnap.data() as any;

      const listingRef = db.collection('listings').doc(offer.listingId);
      const listingSnap = await tx.get(listingRef);
      if (!listingSnap.exists) return { ok: false as const, status: 404, body: { error: 'Listing not found' } };
      const listing = listingSnap.data() as any;

      const isSeller = offer.sellerId === actorId;
      const isBuyer = offer.buyerId === actorId;
      if (!isSeller && !isBuyer) return { ok: false as const, status: 403, body: { error: 'Forbidden' } };

      // Enforce expiry (and mark expired if needed)
      const expiresAt: any = offer.expiresAt;
      if ((offer.status === 'open' || offer.status === 'countered') && expiresAt?.toMillis && expiresAt.toMillis() < now.toMillis()) {
        tx.update(offerRef, {
          status: 'expired',
          lastActorRole: 'system',
          updatedAt: now,
          history: [
            ...(offer.history || []),
            { type: 'expire', actorId: 'system', actorRole: 'system', createdAt: now },
          ],
        });
        return { ok: false as const, status: 409, body: { error: 'Offer has expired' } };
      }

      if (offer.status !== 'open' && offer.status !== 'countered') {
        return { ok: false as const, status: 400, body: { error: `Offer cannot be declined from status ${offer.status}` } };
      }

      if (isBuyer && offer.status !== 'countered') {
        return { ok: false as const, status: 400, body: { error: 'Buyer can decline only a countered offer' } };
      }

      // If listing was reserved by this offer (accepted) we wouldn't be here. If reserved by others, decline is still fine.
      tx.update(offerRef, {
        status: 'declined',
        lastActorRole: isSeller ? 'seller' : 'buyer',
        updatedAt: now,
        history: [
          ...(offer.history || []),
          { type: 'decline', actorId, actorRole: isSeller ? 'seller' : 'buyer', note: note || undefined, createdAt: now },
        ],
      });

      const role: 'seller' | 'buyer' = isSeller ? 'seller' : 'buyer';
      return { ok: true as const, listingId: offer.listingId, role };
    });

    if (!result.ok) return json(result.body, { status: result.status });

    await createAuditLog(db, {
      actorUid: actorId,
      actorRole: result.role,
      actionType: 'offer_declined',
      listingId: result.listingId,
      metadata: { offerId, note: note || undefined },
      source: result.role === 'seller' ? 'seller_ui' : 'buyer_ui',
    });

    return json({ ok: true });
  } catch (error: any) {
    return json({ error: 'Failed to decline offer', message: error?.message || 'Unknown error' }, { status: 500 });
  }
}

