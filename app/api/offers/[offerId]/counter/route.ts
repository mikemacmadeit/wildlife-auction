/**
 * POST /api/offers/[offerId]/counter
 *
 * Seller or buyer counters the offer (threaded negotiation).
 * Resets expiry window and keeps status "countered".
 */

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/audit/logger';
import { emitEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { offerAmountSchema, json, requireAuth, requireRateLimit } from '../../_util';

const counterSchema = z.object({
  amount: offerAmountSchema,
  note: z.string().max(500).optional(),
});

export async function POST(request: Request, ctx: { params: { offerId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const actorId = auth.decoded.uid;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }
  const parsed = counterSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });

  const offerId = ctx.params.offerId;
  const { amount, note } = parsed.data;
  const cleanNote = typeof note === 'string' ? note.trim() : '';
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

      if (listing.status !== 'active') return { ok: false as const, status: 400, body: { error: 'Listing is not active' } };

      if (listing.offerReservedByOfferId) {
        return { ok: false as const, status: 409, body: { error: 'Listing is reserved by an accepted offer' } };
      }

      // Enforce expiry
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
        return { ok: false as const, status: 400, body: { error: `Offer cannot be countered from status ${offer.status}` } };
      }

      const settings = listing.bestOfferSettings || {
        enabled: !!listing.bestOfferEnabled,
        minPrice: listing.bestOfferMinPrice,
        allowCounter: true,
        offerExpiryHours: 48,
      };
      if (isSeller && settings.allowCounter === false) {
        return { ok: false as const, status: 400, body: { error: 'Seller counters are disabled for this listing' } };
      }

      // Buyer can counter only after a seller counter (i.e. already countered)
      if (isBuyer && offer.status !== 'countered') {
        return { ok: false as const, status: 400, body: { error: 'Buyer can counter only after seller counters' } };
      }

      const floor = settings.minPrice;
      if (typeof floor === 'number' && Number.isFinite(floor) && amount < floor) {
        return { ok: false as const, status: 400, body: { error: `Counter must be at least $${floor}` } };
      }

      const expiryHours =
        typeof settings.offerExpiryHours === 'number' && Number.isFinite(settings.offerExpiryHours)
          ? Math.max(1, Math.min(168, settings.offerExpiryHours))
          : 48;
      const newExpiresAt = Timestamp.fromMillis(now.toMillis() + expiryHours * 60 * 60 * 1000);

      tx.update(offerRef, {
        status: 'countered',
        currentAmount: amount,
        expiresAt: newExpiresAt,
        lastActorRole: isSeller ? 'seller' : 'buyer',
        updatedAt: now,
        history: [
          ...(offer.history || []),
          {
            type: 'counter',
            actorId,
            actorRole: isSeller ? 'seller' : 'buyer',
            amount,
            ...(cleanNote ? { note: cleanNote } : {}),
            createdAt: now,
          },
        ],
      });

      const role: 'seller' | 'buyer' = isSeller ? 'seller' : 'buyer';
      return {
        ok: true as const,
        listingId: offer.listingId,
        listingTitle: String(listing.title || 'a listing'),
        role,
        sellerId: String(offer.sellerId),
        buyerId: String(offer.buyerId),
        expiresAtIso: newExpiresAt.toDate().toISOString(),
      };
    });

    if (!result.ok) return json(result.body, { status: result.status });

    await createAuditLog(db, {
      actorUid: actorId,
      actorRole: result.role,
      actionType: 'offer_countered',
      listingId: result.listingId,
      metadata: { offerId, amount },
      source: result.role === 'seller' ? 'seller_ui' : 'buyer_ui',
    });

    // Phase 3A (A3): Notify the counterparty today's amount + expiry.
    try {
      const base = getSiteUrl();
      const targetUserId = result.role === 'seller' ? result.buyerId : result.sellerId;
      const offerUrl = result.role === 'seller' ? `${base}/dashboard/offers` : `${base}/seller/offers/${offerId}`;
      await emitEventForUser({
        type: 'Offer.Countered',
        actorId,
        entityType: 'listing',
        entityId: result.listingId,
        targetUserId,
        payload: {
          type: 'Offer.Countered',
          offerId,
          listingId: result.listingId,
          listingTitle: result.listingTitle,
          offerUrl,
          amount,
          expiresAt: result.expiresAtIso,
        },
        optionalHash: `offer:${offerId}:counter:${result.expiresAtIso}`,
      });
    } catch {
      // best-effort
    }

    return json({ ok: true });
  } catch (error: any) {
    return json({ error: 'Failed to counter offer', message: error?.message || 'Unknown error' }, { status: 500 });
  }
}

