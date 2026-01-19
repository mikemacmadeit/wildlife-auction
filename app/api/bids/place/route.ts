/**
 * POST /api/bids/place
 *
 * Server-side bid placement (P0 enforcement).
 * - Prevents bypassing listing.status gates
 * - Enforces TX-only for animal categories
 * - Enforces auction not ended
 *
 * Body: { listingId: string; amount: number }
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit/logger';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { getSiteUrl } from '@/lib/site-url';
import { emitEventForUser } from '@/lib/notifications';
import { computeNextState, getMinIncrementCents, type AutoBidEntry } from '@/lib/auctions/proxyBidding';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function json(body: any, init?: { status?: number; headers?: Record<string, string> | Headers }) {
  const headers =
    init?.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : (init?.headers as Record<string, string> | undefined);
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(headers || {}) },
  });
}

export async function POST(request: Request) {
  // Lazily initialize Admin SDK inside the handler so we can return a structured error (instead of crashing at import-time).
  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: 'Server is not configured to place bids yet',
        code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
        message: e?.message || 'Failed to initialize Firebase Admin SDK',
        missing: e?.missing || undefined,
      },
      { status: 503 }
    );
  }

  // Rate limit (cheap, before auth)
  const rl = rateLimitMiddleware(RATE_LIMITS.checkout);
  const rlRes = await rl(request as any);
  if (!rlRes.allowed) {
    return json(rlRes.body, {
      status: rlRes.status,
      headers: { 'Retry-After': rlRes.body.retryAfter.toString() },
    });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice('Bearer '.length);
  let decoded: { uid: string; email?: string } | null = null;
  try {
    decoded = (await auth.verifyIdToken(token)) as any;
  } catch {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!decoded?.uid) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bidderId = decoded.uid;

  // Verified email required for bidding (prevents abuse + aligns with payments readiness).
  if ((decoded as any)?.email_verified !== true) {
    return json(
      {
        ok: false,
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address before placing bids.',
      },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const listingId = String(body?.listingId || '');
  const amount = Number(body?.amount);

  if (!listingId) return json({ error: 'listingId is required' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'amount must be a positive number' }, { status: 400 });

  const animalCategories = new Set(['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock']);

  try {
    let eventInfo:
      | {
          listingId: string;
          listingTitle: string;
          listingUrl: string;
          endsAtIso?: string;
          sellerId?: string;
          prevBidderId?: string;
          newBidderId: string;
        }
      | null = null;

    const result = await db.runTransaction(async (tx) => {
      const listingRef = db.collection('listings').doc(listingId);
      const listingSnap = await tx.get(listingRef);
      if (!listingSnap.exists) throw new Error('Listing not found');
      const listing = listingSnap.data() as any;

      if (listing.sellerId === bidderId) throw new Error('Cannot bid on your own listing');
      if (listing.type !== 'auction') throw new Error('Bids can only be placed on auction listings');
      if (listing.status !== 'active') throw new Error('Bids can only be placed on active listings');

      if (listing.endsAt?.toDate) {
        const endsAt = listing.endsAt.toDate() as Date;
        if (endsAt.getTime() <= Date.now()) throw new Error('This auction has ended');
      }

      // TX-only for animals (buyer + listing)
      if (animalCategories.has(listing.category)) {
        if (listing.location?.state !== 'TX') throw new Error('Animal listings must be located in Texas.');

        const userRef = db.collection('users').doc(bidderId);
        const userSnap = await tx.get(userRef);
        const userData = userSnap.exists ? (userSnap.data() as any) : null;
        const buyerState = userData?.profile?.location?.state;
        if (buyerState !== 'TX') {
          throw new Error('Only Texas residents can bid on animal listings.');
        }
      }

      const now = Timestamp.now();
      const nowMs = now.toMillis();

      const startingBidUsd = Number(listing.startingBid ?? 0) || 0;
      const currentBidUsd = Number(listing.currentBid ?? listing.startingBid ?? 0) || 0;
      const currentBidCents =
        Number.isFinite(Number(listing.currentBidCents)) && Math.floor(Number(listing.currentBidCents)) === Number(listing.currentBidCents)
          ? Number(listing.currentBidCents)
          : Math.max(0, Math.round(currentBidUsd * 100));
      const startingBidCents =
        Number.isFinite(Number(listing.startingBidCents)) && Math.floor(Number(listing.startingBidCents)) === Number(listing.startingBidCents)
          ? Number(listing.startingBidCents)
          : Math.max(0, Math.round(startingBidUsd * 100));

      const amountCents = Math.max(0, Math.round(amount * 100));

      // Enforce minimum increment server-side.
      const hasAnyBids = Boolean(listing.currentBidderId) || Number(listing?.metrics?.bidCount || 0) > 0;
      const minRequiredCents = hasAnyBids ? currentBidCents + getMinIncrementCents(currentBidCents) : startingBidCents;
      if (amountCents < minRequiredCents) {
        throw new Error(`Bid must be at least $${(minRequiredCents / 100).toLocaleString()}`);
      }

      // Upsert bidder max bid (proxy bidding always uses max bids).
      const autoBidRef = listingRef.collection('autoBids').doc(bidderId);
      const autoBidSnap = await tx.get(autoBidRef);
      const existingAutoBid = autoBidSnap.exists ? (autoBidSnap.data() as any) : null;
      const existingMax = Number(existingAutoBid?.maxBidCents || 0) || 0;
      const createdAtMs = existingAutoBid?.createdAt?.toMillis ? existingAutoBid.createdAt.toMillis() : nowMs;

      if (existingAutoBid && existingAutoBid.enabled === true && amountCents <= existingMax) {
        throw new Error('Your maximum bid must be higher than your current maximum bid.');
      }

      // Load enabled max bids for this auction (transactional snapshot).
      // IMPORTANT: Firestore transactions require *all reads* to happen before *any writes*.
      const autoBidsSnap = await tx.get(listingRef.collection('autoBids').where('enabled', '==', true));
      const autoBidSet: AutoBidEntry[] = autoBidsSnap.docs.map((d) => {
        const data = d.data() as any;
        const created = data?.createdAt?.toMillis ? data.createdAt.toMillis() : nowMs;
        const updated = data?.updatedAt?.toMillis ? data.updatedAt.toMillis() : undefined;
        return {
          userId: String(data.userId || d.id),
          maxBidCents: Number(data.maxBidCents || 0) || 0,
          enabled: Boolean(data.enabled),
          createdAtMs: created,
          updatedAtMs: updated,
        };
      });

      // Ensure bidder's updated max is represented.
      const mergedAutoBidSet: AutoBidEntry[] = [
        ...autoBidSet.filter((e) => e.userId !== bidderId),
        { userId: bidderId, maxBidCents: amountCents, enabled: true, createdAtMs },
      ];

      const prevBidderId = typeof listing.currentBidderId === 'string' ? listing.currentBidderId : null;
      const out = computeNextState({
        currentBidCents,
        highBidderId: prevBidderId,
        autoBidSet: mergedAutoBidSet,
      });

      const newCurrentBidCents = out.newCurrentBidCents;
      const newHighBidderId = out.newHighBidderId;

      // If the bidder is already winning and only increased their max without moving price, do not write bid docs.
      const priceMoved = newCurrentBidCents !== currentBidCents;
      const highBidderChanged = newHighBidderId && newHighBidderId !== prevBidderId;

      const bidsCol = db.collection('bids');
      const bidWrites: Array<{ id: string; bidderId: string; amountCents: number; isAuto: boolean }> = [];

      if (priceMoved || highBidderChanged) {
        const bidderBidAmountCents = newHighBidderId === bidderId ? newCurrentBidCents : amountCents;
        bidWrites.push({
          id: bidsCol.doc().id,
          bidderId,
          amountCents: bidderBidAmountCents,
          isAuto: false,
        });

        const synthetic = out.syntheticBidsToWrite.find((b) => b.bidderId === newHighBidderId);
        if (synthetic && synthetic.bidderId && synthetic.bidderId !== bidderId) {
          bidWrites.push({
            id: bidsCol.doc().id,
            bidderId: synthetic.bidderId,
            amountCents: synthetic.amountCents,
            isAuto: true,
          });
          // best-effort marker
          tx.set(
            listingRef.collection('autoBids').doc(synthetic.bidderId),
            { lastAutoBidAt: now, updatedAt: now },
            { merge: true }
          );
        }

        // Persist bidder's new max bid AFTER reads are complete.
        tx.set(
          autoBidRef,
          {
            userId: bidderId,
            maxBidCents: amountCents,
            enabled: true,
            ...(autoBidSnap.exists ? {} : { createdAt: now }),
            updatedAt: now,
          },
          { merge: true }
        );

        for (const w of bidWrites) {
          tx.set(bidsCol.doc(w.id), {
            listingId,
            bidderId: w.bidderId,
            amount: w.amountCents / 100,
            amountCents: w.amountCents,
            isAuto: w.isAuto,
            createdAt: now,
          });
        }

        tx.update(listingRef, {
          currentBid: newCurrentBidCents / 100,
          currentBidCents: newCurrentBidCents,
          currentBidderId: newHighBidderId,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: bidderId,
          'metrics.bidCount': FieldValue.increment(bidWrites.length),
          'metrics.lastBidAt': FieldValue.serverTimestamp(),
        });
      } else {
        // No visible change; only max increased.
        // Persist bidder's new max bid AFTER reads are complete.
        tx.set(
          autoBidRef,
          {
            userId: bidderId,
            maxBidCents: amountCents,
            enabled: true,
            ...(autoBidSnap.exists ? {} : { createdAt: now }),
            updatedAt: now,
          },
          { merge: true }
        );
        tx.update(listingRef, {
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: bidderId,
        });
      }

      // Capture info for notification events after tx commits.
      const endsAt = listing.endsAt?.toDate ? (listing.endsAt.toDate() as Date) : undefined;
      eventInfo = {
        listingId,
        listingTitle: listing.title || 'a listing',
        listingUrl: `${getSiteUrl()}/listing/${listingId}`,
        ...(endsAt ? { endsAtIso: endsAt.toISOString() } : {}),
        ...(listing.sellerId ? { sellerId: listing.sellerId } : {}),
        ...(prevBidderId ? { prevBidderId } : {}),
        newBidderId: newHighBidderId || prevBidderId || bidderId,
      };

      return {
        newCurrentBid: newCurrentBidCents / 100,
        bidId: bidWrites[0]?.id || db.collection('bids').doc().id,
        prevBidderId,
        newBidderId: newHighBidderId,
        bidCountDelta: bidWrites.length,
        priceMoved,
        highBidderChanged,
        yourMaxBid: amountCents / 100,
      };
    });

    // Audit (outside tx)
    try {
      await createAuditLog(db as any, {
        actorUid: bidderId,
        actorRole: 'buyer',
        actionType: 'bid_placed',
        listingId,
        beforeState: {},
        afterState: { amount },
        metadata: { amount },
        source: 'api',
      });
    } catch {
      // ignore audit failures
    }

    // Notification events (outside tx, idempotent)
    if (eventInfo) {
      const { sellerId, prevBidderId, listingTitle, listingUrl, endsAtIso, newBidderId } = eventInfo;

      // Seller: bid received (low priority but useful)
      if (sellerId) {
        await emitEventForUser({
          type: 'Auction.BidReceived',
          actorId: bidderId,
          entityType: 'listing',
          entityId: listingId,
          targetUserId: sellerId,
          payload: {
            type: 'Auction.BidReceived',
            listingId,
            listingTitle,
            listingUrl,
            bidAmount: result.newCurrentBid,
          },
          optionalHash: `bid:${result.bidId}`,
        });
      }

      // Previous high bidder: outbid (only if high bidder changed)
      if (prevBidderId && newBidderId && prevBidderId !== newBidderId) {
        await emitEventForUser({
          type: 'Auction.Outbid',
          actorId: bidderId,
          entityType: 'listing',
          entityId: listingId,
          targetUserId: prevBidderId,
          payload: {
            type: 'Auction.Outbid',
            listingId,
            listingTitle,
            listingUrl,
            newHighBidAmount: result.newCurrentBid,
            yourMaxBidAmount: undefined,
            ...(endsAtIso ? { endsAt: endsAtIso } : {}),
          },
          optionalHash: `bid:${result.bidId}`,
        });
      }

      // Bidder: winning vs immediately surpassed.
      if (newBidderId !== bidderId) {
        await emitEventForUser({
          type: 'Auction.Outbid',
          actorId: bidderId,
          entityType: 'listing',
          entityId: listingId,
          targetUserId: bidderId,
          payload: {
            type: 'Auction.Outbid',
            listingId,
            listingTitle,
            listingUrl,
            newHighBidAmount: result.newCurrentBid,
            yourMaxBidAmount: result.yourMaxBid,
            ...(endsAtIso ? { endsAt: endsAtIso } : {}),
          },
          optionalHash: `bid:${result.bidId}:immediate`,
        });
      } else {
        await emitEventForUser({
          type: 'Auction.HighBidder',
          actorId: bidderId,
          entityType: 'listing',
          entityId: listingId,
          targetUserId: bidderId,
          payload: {
            type: 'Auction.HighBidder',
            listingId,
            listingTitle,
            listingUrl,
            yourBidAmount: result.newCurrentBid,
            currentBidAmount: result.newCurrentBid,
            yourMaxBidAmount: result.yourMaxBid,
            priceMoved: result.priceMoved,
            ...(endsAtIso ? { endsAt: endsAtIso } : {}),
          },
          optionalHash: `bid:${result.bidId}`,
        });
      }
    }

    return json({ ok: true, ...result });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Failed to place bid' }, { status: 400 });
  }
}

