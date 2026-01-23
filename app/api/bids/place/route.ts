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
import { checkRateLimitByKey, rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { createAuditLog } from '@/lib/audit/logger';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { getSiteUrl } from '@/lib/site-url';
import { emitAndProcessEventForUser, emitEventForUser } from '@/lib/notifications';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { computeNextState, getMinIncrementCents, type AutoBidEntry } from '@/lib/auctions/proxyBidding';
import { normalizeCategory } from '@/lib/listings/normalizeCategory';
import { isTexasOnlyCategory } from '@/lib/compliance/requirements';
import { coerceDurationDays, computeEndAt, toMillisSafe } from '@/lib/listings/duration';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

class BidError extends Error {
  code: string;
  status: number;
  details?: Record<string, any>;
  constructor(params: { code: string; message: string; status?: number; details?: Record<string, any> }) {
    super(params.message);
    this.code = params.code;
    this.status = typeof params.status === 'number' ? params.status : 400;
    this.details = params.details;
  }
}

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

  // Coarse rate limit (cheap, before auth). This is intentionally generous to avoid blocking real-time auctions.
  const rlIp = rateLimitMiddleware(RATE_LIMITS.bidsIp);
  const rlIpRes = await rlIp(request as any);
  if (!rlIpRes.allowed) {
    return json(rlIpRes.body, {
      status: rlIpRes.status,
      headers: { 'Retry-After': rlIpRes.body.retryAfter.toString() },
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
  // IMPORTANT: don't rely solely on ID token claims; they can be stale until the client refreshes.
  const bidderRecord = await auth.getUser(bidderId).catch(() => null as any);
  if (bidderRecord?.emailVerified !== true) {
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

  // High-frequency bid limiter (keyed per user + listing). This prevents abuse without blocking real-time bidding.
  const bidKey = `bid:user:${bidderId}:listing:${listingId}`;
  const rlBid = await checkRateLimitByKey(bidKey, RATE_LIMITS.bidsPlace);
  if (!rlBid.allowed) {
    return json(
      {
        ok: false,
        error: rlBid.error || 'Too many bid attempts. Please slow down for a moment.',
        code: 'RATE_LIMITED',
        retryAfter: rlBid.retryAfter,
      },
      { status: rlBid.status ?? 429, headers: { 'Retry-After': rlBid.retryAfter.toString() } }
    );
  }

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
      if (!listingSnap.exists) throw new BidError({ code: 'LISTING_NOT_FOUND', message: 'Listing not found', status: 404 });
      const listing = listingSnap.data() as any;
      let listingCategory: string;
      try {
        listingCategory = normalizeCategory(listing.category);
      } catch (e: any) {
        throw new BidError({ code: 'INVALID_CATEGORY', message: e?.message || 'Invalid listing category', status: 400 });
      }

      if (listing.sellerId === bidderId) throw new BidError({ code: 'OWN_LISTING', message: 'Cannot bid on your own listing', status: 400 });
      if (listing.type !== 'auction') throw new BidError({ code: 'NOT_AUCTION', message: 'Bids can only be placed on auction listings', status: 400 });
      if (listing.status !== 'active') throw new BidError({ code: 'LISTING_NOT_ACTIVE', message: 'Bids can only be placed on active listings', status: 400 });

      // End guard (server authoritative):
      // Prefer endAt (universal), fall back to endsAt (legacy auctions), and finally to a virtual endAt (publishedAt/createdAt + durationDays).
      const nowWallMs = Date.now();
      const endMsDirect =
        toMillisSafe(listing?.endAt) ??
        (listing?.endsAt?.toMillis ? listing.endsAt.toMillis() : null) ??
        (listing?.endsAt?.toDate ? (listing.endsAt.toDate() as Date).getTime() : null);
      const startMs =
        toMillisSafe(listing?.startAt) ??
        (listing?.publishedAt?.toMillis ? listing.publishedAt.toMillis() : null) ??
        (listing?.createdAt?.toMillis ? listing.createdAt.toMillis() : null) ??
        null;
      const durationDays = coerceDurationDays(listing?.durationDays, 7);
      const endMs = endMsDirect ?? (startMs ? computeEndAt(startMs, durationDays) : null);
      if (endMs && endMs <= nowWallMs) {
        throw new BidError({ code: 'LISTING_ENDED', message: 'This listing has ended', status: 409 });
      }

      // TX-only for animals (buyer + listing)
      if (isTexasOnlyCategory(listingCategory as any)) {
        if (listing.location?.state !== 'TX') {
          throw new BidError({ code: 'TX_ONLY_LISTING', message: 'Animal listings must be located in Texas.', status: 400 });
        }

        const userRef = db.collection('users').doc(bidderId);
        const userSnap = await tx.get(userRef);
        const userData = userSnap.exists ? (userSnap.data() as any) : null;
        const buyerState = userData?.profile?.location?.state;
        if (buyerState !== 'TX') throw new BidError({ code: 'TX_ONLY_BUYER', message: 'Only Texas residents can bid on animal listings.', status: 400 });
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
        throw new BidError({
          code: 'BID_TOO_LOW',
          message: `Bid must be at least $${(minRequiredCents / 100).toLocaleString()}`,
          status: 400,
          details: { minRequired: minRequiredCents / 100, minRequiredCents, currentBid: currentBidCents / 100 },
        });
      }

      // Upsert bidder max bid (proxy bidding always uses max bids).
      const autoBidRef = listingRef.collection('autoBids').doc(bidderId);
      const autoBidSnap = await tx.get(autoBidRef);
      const existingAutoBid = autoBidSnap.exists ? (autoBidSnap.data() as any) : null;
      const existingMax = Number(existingAutoBid?.maxBidCents || 0) || 0;
      const createdAtMs = existingAutoBid?.createdAt?.toMillis ? existingAutoBid.createdAt.toMillis() : nowMs;

      if (existingAutoBid && existingAutoBid.enabled === true && amountCents <= existingMax) {
        throw new BidError({
          code: 'MAX_BID_NOT_HIGHER',
          message: 'Your maximum bid must be higher than your current maximum bid.',
          status: 400,
          details: { currentMax: existingMax / 100 },
        });
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

      // Best-effort: attempt to dispatch bidder/outbid emails immediately (do NOT block bids on send failures).
      const trySendEmailJob = async (eventId: string) => {
        try {
          // Keep this bounded: if email sending is slow, don't slow bidding.
          await Promise.race([
            tryDispatchEmailJobNow({ db: db as any, jobId: eventId }),
            new Promise((resolve) => setTimeout(resolve, 1200)),
          ]);
        } catch {
          // ignore
        }
      };

      // Previous high bidder: outbid (only if high bidder changed)
      if (prevBidderId && newBidderId && prevBidderId !== newBidderId) {
        const outbidRes = await emitAndProcessEventForUser({
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
        if (outbidRes?.created) void trySendEmailJob(outbidRes.eventId);
      }

      // Bidder: winning vs immediately surpassed.
      if (newBidderId !== bidderId) {
        const immediateOutbidRes = await emitAndProcessEventForUser({
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
        if (immediateOutbidRes?.created) void trySendEmailJob(immediateOutbidRes.eventId);
      } else {
        const highBidderRes = await emitAndProcessEventForUser({
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
        if (highBidderRes?.created) void trySendEmailJob(highBidderRes.eventId);
      }
    }

    return json({ ok: true, ...result });
  } catch (e: any) {
    const err = e instanceof BidError ? e : null;
    return json(
      {
        ok: false,
        error: err?.message || e?.message || 'Failed to place bid',
        code: err?.code || 'BID_FAILED',
        details: err?.details,
      },
      { status: err?.status || 400 }
    );
  }
}

