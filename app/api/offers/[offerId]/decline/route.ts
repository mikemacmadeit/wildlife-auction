/**
 * POST /api/offers/[offerId]/decline
 *
 * Seller declines an offer, or buyer declines a seller counter.
 */

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/audit/logger';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { json, requireAuth, requireRateLimit } from '../../_util';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { captureException } from '@/lib/monitoring/capture';

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

  const cleanNote = typeof parsed.data.note === 'string' ? parsed.data.note.trim() : '';
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
          {
            type: 'decline',
            actorId,
            actorRole: isSeller ? 'seller' : 'buyer',
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
      };
    });

    if (!result.ok) return json(result.body, { status: result.status });

    // Best-effort audit logging (never block declining)
    try {
      await createAuditLog(db, {
        actorUid: actorId,
        actorRole: result.role,
        actionType: 'offer_declined',
        listingId: result.listingId,
        metadata: { offerId, ...(cleanNote ? { note: cleanNote } : {}) },
        source: result.role === 'seller' ? 'seller_ui' : 'buyer_ui',
      });
    } catch (e) {
      console.error('[offers.decline] audit log failed (ignored)', e);
    }

    // Phase 3A (A3): notify counterparty of decline.
    try {
      const base = getSiteUrl();
      const targetUserId = result.role === 'seller' ? result.buyerId : result.sellerId;
      const offerUrl = result.role === 'seller' ? `${base}/dashboard/offers` : `${base}/seller/offers/${offerId}`;
      const ev = await emitAndProcessEventForUser({
        type: 'Offer.Declined',
        actorId,
        entityType: 'listing',
        entityId: result.listingId,
        targetUserId,
        payload: {
          type: 'Offer.Declined',
          offerId,
          listingId: result.listingId,
          listingTitle: result.listingTitle,
          offerUrl,
        },
        optionalHash: `offer:${offerId}:declined`,
      });
      if (ev?.ok && typeof ev?.eventId === 'string') {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Offer.Declined',
            jobId: ev.eventId,
            offerId,
            endpoint: '/api/offers/[offerId]/decline',
          });
        });
      }
    } catch {
      // best-effort
    }

    return json({ ok: true });
  } catch (error: any) {
    return json({ error: 'Failed to decline offer', message: error?.message || 'Unknown error' }, { status: 500 });
  }
}

