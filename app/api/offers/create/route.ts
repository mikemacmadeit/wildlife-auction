/**
 * POST /api/offers/create
 *
 * Buyer creates an offer on a fixed/classified listing with Best Offer enabled.
 * Server authoritative; uses transaction for:
 * - one active offer per buyer per listing
 * - auto-accept + listing reservation
 */

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/audit/logger';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { getPrimaryListingImageUrl, offerAmountSchema, json, requireAuth, requireRateLimit } from '../_util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createOfferSchema = z.object({
  listingId: z.string().min(1),
  amount: offerAmountSchema,
  note: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const buyerId = auth.decoded.uid;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  const parsed = createOfferSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const { listingId, amount, note } = parsed.data;
  const cleanNote = typeof note === 'string' ? note.trim() : '';
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

  const listingRef = db.collection('listings').doc(listingId);
  const offersRef = db.collection('offers');
  const offerRef = offersRef.doc();

  try {
    const now = Timestamp.now();
    const offerLimitRaw = Number(process.env.OFFER_MAX_OFFERS_PER_BUYER_PER_LISTING || '5');
    const offerLimit = Number.isFinite(offerLimitRaw) ? Math.max(1, Math.min(20, Math.round(offerLimitRaw))) : 5;
    const acceptedWindowHoursRaw = Number(process.env.OFFER_ACCEPTED_PAYMENT_WINDOW_HOURS || '24');
    const acceptedWindowHours =
      Number.isFinite(acceptedWindowHoursRaw) ? Math.max(1, Math.min(168, Math.round(acceptedWindowHoursRaw))) : 24;
    const acceptedUntil = Timestamp.fromMillis(now.toMillis() + acceptedWindowHours * 60 * 60 * 1000);

    const result = await db.runTransaction(async (tx) => {
      const listingSnap = await tx.get(listingRef);
      if (!listingSnap.exists) {
        return { ok: false as const, status: 404, body: { error: 'Listing not found' } };
      }

      const listing = listingSnap.data() as any;

      if (listing.status !== 'active') {
        return { ok: false as const, status: 400, body: { error: 'Listing is not available for offers' } };
      }

      if (listing.type !== 'fixed' && listing.type !== 'classified') {
        return { ok: false as const, status: 400, body: { error: 'Best Offer is only available for fixed/classified listings' } };
      }

      const settings = listing.bestOfferSettings || {
        enabled: !!listing.bestOfferEnabled,
        minPrice: listing.bestOfferMinPrice,
        autoAcceptPrice: listing.bestOfferAutoAcceptPrice,
        allowCounter: true,
        offerExpiryHours: 48,
      };

      if (!settings?.enabled) {
        return { ok: false as const, status: 400, body: { error: 'Best Offer is not enabled for this listing' } };
      }

      if (listing.sellerId === buyerId) {
        return { ok: false as const, status: 400, body: { error: 'You cannot make an offer on your own listing' } };
      }

      if (listing.offerReservedByOfferId) {
        return { ok: false as const, status: 409, body: { error: 'Listing is reserved by an accepted offer' } };
      }

      // Enforce an eBay-style offer limit per buyer per listing (prevents offer spam).
      // Avoid composite-index requirements by querying on buyerId only and filtering in-memory.
      const mineSnap = await tx.get(offersRef.where('buyerId', '==', buyerId).limit(200));
      const offersUsedForListing = mineSnap.docs.filter((d) => (d.data() as any)?.listingId === listingId).length;
      if (offersUsedForListing >= offerLimit) {
        return {
          ok: false as const,
          status: 409,
          body: {
            error: `Offer limit reached for this listing (${offerLimit}).`,
            code: 'OFFER_LIMIT_REACHED',
            offerLimit: { limit: offerLimit, used: offersUsedForListing, left: 0 },
          },
        };
      }

      const floor = settings.minPrice;
      if (typeof floor === 'number' && Number.isFinite(floor) && amount < floor) {
        return { ok: false as const, status: 400, body: { error: `Offer must be at least $${floor}` } };
      }

      // Enforce one active offer per buyer per listing
      const existingSnap = await tx.get(
        offersRef
          .where('listingId', '==', listingId)
          .where('buyerId', '==', buyerId)
          .where('status', 'in', ['open', 'countered'])
          .limit(1)
      );
      if (!existingSnap.empty) {
        return { ok: false as const, status: 409, body: { error: 'You already have an active offer on this listing' } };
      }

      const expiryHours =
        typeof settings.offerExpiryHours === 'number' && Number.isFinite(settings.offerExpiryHours)
          ? Math.max(1, Math.min(168, settings.offerExpiryHours))
          : 48;
      const expiresAt = Timestamp.fromMillis(now.toMillis() + expiryHours * 60 * 60 * 1000);

      const shouldAutoAccept =
        typeof settings.autoAcceptPrice === 'number' &&
        Number.isFinite(settings.autoAcceptPrice) &&
        amount >= settings.autoAcceptPrice;

      const baseHistory = [
        {
          type: 'offer',
          actorId: buyerId,
          actorRole: 'buyer',
          amount,
          ...(cleanNote ? { note: cleanNote } : {}),
          createdAt: now,
        },
      ];

      const offerDoc: any = {
        listingId,
        listingSnapshot: {
          title: String(listing.title || ''),
          category: listing.category,
          type: listing.type,
          sellerId: listing.sellerId,
          imageUrl: getPrimaryListingImageUrl(listing) || undefined,
        },
        sellerId: listing.sellerId,
        buyerId,
        currency: 'usd',
        status: shouldAutoAccept ? 'accepted' : 'open',
        currentAmount: amount,
        originalAmount: amount,
        lastActorRole: shouldAutoAccept ? 'system' : 'buyer',
        expiresAt,
        createdAt: now,
        updatedAt: now,
        history: shouldAutoAccept
          ? [
              ...baseHistory,
              {
                type: 'accept',
                actorId: 'system',
                actorRole: 'system',
                amount,
                note: 'Auto-accepted',
                createdAt: now,
              },
            ]
          : baseHistory,
      };

      if (shouldAutoAccept) {
        offerDoc.acceptedAmount = amount;
        offerDoc.acceptedAt = now;
        offerDoc.acceptedUntil = acceptedUntil;
        offerDoc.acceptedBy = 'system';
        tx.update(listingRef, {
          offerReservedByOfferId: offerRef.id,
          offerReservedAt: now,
          offerReservedUntil: acceptedUntil,
          updatedAt: now,
        });
      }

      tx.set(offerRef, offerDoc);

      return {
        ok: true as const,
        offerId: offerRef.id,
        offerDoc,
        offerLimit: {
          limit: offerLimit,
          used: offersUsedForListing + 1,
          left: Math.max(0, offerLimit - (offersUsedForListing + 1)),
        },
      };
    });

    if (!result.ok) {
      return json(result.body, { status: result.status });
    }

    // Audit logs (outside txn) - best-effort (offers should never fail due to audit logging)
    try {
      await createAuditLog(db, {
        actorUid: buyerId,
        actorRole: 'buyer',
        actionType: 'offer_created',
        listingId,
        metadata: { offerId: result.offerId, amount },
        source: 'buyer_ui',
      });
      if (result.offerDoc.status === 'accepted') {
        await createAuditLog(db, {
          actorUid: 'system',
          actorRole: 'system',
          actionType: 'offer_accepted',
          listingId,
          metadata: { offerId: result.offerId, amount, auto: true },
          source: 'api',
        });
      }
    } catch (e) {
      console.error('[offers.create] audit log failed (ignored)', e);
    }

    // Phase 3A (A3): Offer lifecycle notifications (existing pipeline; in-app by default via rules).
    try {
      const base = getSiteUrl();
      const listingTitle = String(result.offerDoc?.listingSnapshot?.title || 'your listing');
      const sellerId = String(result.offerDoc?.sellerId || '');
      const buyerId = String(result.offerDoc?.buyerId || '');

      if (result.offerDoc.status === 'accepted') {
        // Auto-accepted offers: notify buyer (and seller for visibility).
        if (buyerId) {
          await emitAndProcessEventForUser({
            type: 'Offer.Accepted',
            actorId: 'system',
            entityType: 'listing',
            entityId: listingId,
            targetUserId: buyerId,
            payload: {
              type: 'Offer.Accepted',
              offerId: result.offerId,
              listingId,
              listingTitle,
              offerUrl: `${base}/dashboard/offers`,
              amount,
            },
            optionalHash: `offer:${result.offerId}:accepted`,
          });
        }
        if (sellerId) {
          await emitAndProcessEventForUser({
            type: 'Offer.Accepted',
            actorId: 'system',
            entityType: 'listing',
            entityId: listingId,
            targetUserId: sellerId,
            payload: {
              type: 'Offer.Accepted',
              offerId: result.offerId,
              listingId,
              listingTitle,
              offerUrl: `${base}/seller/offers/${result.offerId}`,
              amount,
            },
            optionalHash: `offer:${result.offerId}:accepted_seller`,
          });
        }
      } else {
        // Regular offer: notify seller.
        if (sellerId) {
          await emitAndProcessEventForUser({
            type: 'Offer.Received',
            actorId: buyerId || null,
            entityType: 'listing',
            entityId: listingId,
            targetUserId: sellerId,
            payload: {
              type: 'Offer.Received',
              offerId: result.offerId,
              listingId,
              listingTitle,
              offerUrl: `${base}/seller/offers/${result.offerId}`,
              amount,
              expiresAt: result.offerDoc?.expiresAt?.toDate?.().toISOString?.() || undefined,
            },
            optionalHash: `offer:${result.offerId}:received`,
          });
        }
      }
    } catch {
      // best-effort; do not fail offer creation on notification errors
    }

    return json({ ok: true, offerId: result.offerId, offerLimit: (result as any).offerLimit });
  } catch (error: any) {
    const msg = String(error?.message || 'Unknown error');
    const code = String(error?.code || '');
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
            'The database index needed to create offers is still building or not deployed yet. Please try again in a few minutes.',
        },
        { status: 503 }
      );
    }

    return json({ error: 'Failed to create offer', message: msg }, { status: 500 });
  }
}

