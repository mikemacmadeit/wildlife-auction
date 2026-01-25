/**
 * POST /api/offers/[offerId]/accept
 *
 * Seller (or buyer, if accepting a seller counter) accepts the current offer.
 * Server authoritative; transaction reserves listing to prevent double acceptance.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/audit/logger';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { json, requireAuth, requireRateLimit } from '../../_util';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';

export async function POST(request: Request, ctx: { params: { offerId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const actorId = auth.decoded.uid;
  const offerId = ctx.params.offerId;
  const db = getAdminDb();

  const offerRef = db.collection('offers').doc(offerId);

  try {
    const now = Timestamp.now();
    const acceptedWindowHoursRaw = Number(process.env.OFFER_ACCEPTED_PAYMENT_WINDOW_HOURS || '24');
    const acceptedWindowHours =
      Number.isFinite(acceptedWindowHoursRaw) ? Math.max(1, Math.min(168, Math.round(acceptedWindowHoursRaw))) : 24;
    const acceptedUntil = Timestamp.fromMillis(now.toMillis() + acceptedWindowHours * 60 * 60 * 1000);

    const result = await db.runTransaction(async (tx) => {
      const offerSnap = await tx.get(offerRef);
      if (!offerSnap.exists) {
        return { ok: false as const, status: 404, body: { error: 'Offer not found' } };
      }
      const offer = offerSnap.data() as any;

      const listingRef = db.collection('listings').doc(offer.listingId);
      const listingSnap = await tx.get(listingRef);
      if (!listingSnap.exists) {
        return { ok: false as const, status: 404, body: { error: 'Listing not found' } };
      }
      const listing = listingSnap.data() as any;

      // Ownership/role checks
      const isSeller = offer.sellerId === actorId;
      const isBuyer = offer.buyerId === actorId;
      if (!isSeller && !isBuyer) {
        return { ok: false as const, status: 403, body: { error: 'Forbidden' } };
      }

      if (listing.status !== 'active') {
        return { ok: false as const, status: 400, body: { error: 'Listing is not active' } };
      }

      // If a checkout reservation is still active (pending payment), block accept to prevent double-sell/race.
      // Note: this is separate from `offerReservedByOfferId` and is driven by checkout/session creation.
      const reservedUntilMs =
        typeof listing?.purchaseReservedUntil?.toMillis === 'function' ? listing.purchaseReservedUntil.toMillis() : null;
      const hasActivePurchaseReservation =
        Boolean(listing?.purchaseReservedByOrderId) && typeof reservedUntilMs === 'number' && reservedUntilMs > now.toMillis();
      if (hasActivePurchaseReservation) {
        return {
          ok: false as const,
          status: 409,
          body: { error: 'Listing is reserved pending payment confirmation. Please try again later.' },
        };
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

      // Check if offer is already accepted
      if (offer.status === 'accepted') {
        return { 
          ok: false as const, 
          status: 400, 
          body: { 
            error: 'This offer has already been accepted. Please proceed to checkout to complete your purchase.',
            code: 'ALREADY_ACCEPTED'
          } 
        };
      }

      if (offer.status !== 'open' && offer.status !== 'countered') {
        return { ok: false as const, status: 400, body: { error: `Offer cannot be accepted from status ${offer.status}` } };
      }

      // Buyer can accept only if currently countered (seller last action)
      if (isBuyer && offer.status !== 'countered') {
        return { ok: false as const, status: 400, body: { error: 'Only countered offers can be accepted by the buyer' } };
      }

      // Prevent multiple acceptances / reservations
      if (listing.offerReservedByOfferId && listing.offerReservedByOfferId !== offerId) {
        return { ok: false as const, status: 409, body: { error: 'Listing is already reserved by another offer' } };
      }

      tx.update(offerRef, {
        status: 'accepted',
        acceptedAmount: offer.currentAmount,
        acceptedAt: now,
        acceptedUntil,
        acceptedBy: actorId,
        lastActorRole: isSeller ? 'seller' : 'buyer',
        updatedAt: now,
        history: [
          ...(offer.history || []),
          { type: 'accept', actorId: actorId, actorRole: isSeller ? 'seller' : 'buyer', amount: offer.currentAmount, createdAt: now },
        ],
      });

      tx.update(listingRef, {
        offerReservedByOfferId: offerId,
        offerReservedAt: now,
        offerReservedUntil: acceptedUntil,
        updatedAt: now,
      });

      return { ok: true as const, listingId: offer.listingId, amount: offer.currentAmount, sellerId: offer.sellerId, buyerId: offer.buyerId };
    });

    if (!result.ok) return json(result.body, { status: result.status });

    // Best-effort audit logging (never block offer acceptance)
    try {
      await createAuditLog(db, {
        actorUid: actorId,
        actorRole: result.sellerId === actorId ? 'seller' : 'buyer',
        actionType: 'offer_accepted',
        listingId: result.listingId,
        metadata: { offerId, acceptedAmount: result.amount },
        source: result.sellerId === actorId ? 'seller_ui' : 'buyer_ui',
      });
    } catch (e) {
      console.error('[offers.accept] audit log failed (ignored)', e);
    }

    // Phase 3A (A3): Notify both sides that the offer was accepted.
    try {
      const base = getSiteUrl();
      const listingTitle = String((await db.collection('listings').doc(result.listingId).get()).data()?.title || 'a listing');

      const evBuyer = await emitAndProcessEventForUser({
        type: 'Offer.Accepted',
        actorId,
        entityType: 'listing',
        entityId: result.listingId,
        targetUserId: result.buyerId,
        payload: {
          type: 'Offer.Accepted',
          offerId,
          listingId: result.listingId,
          listingTitle,
          offerUrl: `${base}/dashboard/offers`,
          amount: result.amount,
        },
        optionalHash: `offer:${offerId}:accepted`,
      });

      const evSeller = await emitAndProcessEventForUser({
        type: 'Offer.Accepted',
        actorId,
        entityType: 'listing',
        entityId: result.listingId,
        targetUserId: result.sellerId,
        payload: {
          type: 'Offer.Accepted',
          offerId,
          listingId: result.listingId,
          listingTitle,
          offerUrl: `${base}/seller/offers/${offerId}`,
          amount: result.amount,
        },
        optionalHash: `offer:${offerId}:accepted_seller`,
      });

      if (evBuyer?.ok && typeof evBuyer?.eventId === 'string') {
        void tryDispatchEmailJobNow({ db: db as any, jobId: evBuyer.eventId, waitForJob: true }).catch(() => {});
      }
      if (evSeller?.ok && typeof evSeller?.eventId === 'string') {
        void tryDispatchEmailJobNow({ db: db as any, jobId: evSeller.eventId, waitForJob: true }).catch(() => {});
      }
    } catch {
      // best-effort
    }

    return json({ ok: true });
  } catch (error: any) {
    return json({ error: 'Failed to accept offer', message: error?.message || 'Unknown error' }, { status: 500 });
  }
}

