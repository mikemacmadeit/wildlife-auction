/**
 * POST /api/auctions/[auctionId]/auto-bid/set
 *
 * Sets/updates a user's max bid for an auction (proxy bidding).
 * This is server-authoritative (Admin SDK) to keep bidding concurrency-safe.
 *
 * Body: { maxBidCents: number }
 */

import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { getSiteUrl } from '@/lib/site-url';
import { emitEventForUser } from '@/lib/notifications';
import { computeNextState, getMinIncrementCents, type AutoBidEntry } from '@/lib/auctions/proxyBidding';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
}

const bodySchema = z.object({
  maxBidCents: z.number().int().positive(),
});

export async function POST(request: Request, ctx: { params: Promise<{ auctionId: string }> }) {
  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message || String(e) }, { status: 503 });
  }

  const rl = rateLimitMiddleware(RATE_LIMITS.default);
  const rlRes = await rl(request as any);
  if (!rlRes.allowed) {
    return json(rlRes.body, { status: rlRes.status, headers: { 'Retry-After': rlRes.body.retryAfter.toString() } });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.slice('Bearer '.length);
  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = String(decoded?.uid || '');
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const auctionId = String((await ctx.params)?.auctionId || '');
  if (!auctionId) return json({ ok: false, error: 'auctionId is required' }, { status: 400 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });

  const maxBidCents = parsed.data.maxBidCents;

  try {
    const result = await db.runTransaction(async (tx) => {
      const listingRef = db.collection('listings').doc(auctionId);
      const listingSnap = await tx.get(listingRef);
      if (!listingSnap.exists) throw new Error('Listing not found');
      const listing = listingSnap.data() as any;

      if (listing.type !== 'auction') throw new Error('Auto-bid is only available for auctions');
      if (listing.status !== 'active') throw new Error('Auction is not active');
      if (listing.sellerId === userId) throw new Error('Cannot auto-bid on your own listing');
      if (listing.endsAt?.toDate) {
        const endsAt = listing.endsAt.toDate() as Date;
        if (endsAt.getTime() <= Date.now()) throw new Error('This auction has ended');
      }

      const now = Timestamp.now();
      const nowMs = now.toMillis();

      const currentBidUsd = Number(listing.currentBid ?? listing.startingBid ?? 0) || 0;
      const startingBidUsd = Number(listing.startingBid ?? 0) || 0;
      const currentBidCents =
        Number.isFinite(Number(listing.currentBidCents)) && Math.floor(Number(listing.currentBidCents)) === Number(listing.currentBidCents)
          ? Number(listing.currentBidCents)
          : Math.max(0, Math.round(currentBidUsd * 100));
      const startingBidCents =
        Number.isFinite(Number(listing.startingBidCents)) && Math.floor(Number(listing.startingBidCents)) === Number(listing.startingBidCents)
          ? Number(listing.startingBidCents)
          : Math.max(0, Math.round(startingBidUsd * 100));

      const hasAnyBids = Boolean(listing.currentBidderId) || Number(listing?.metrics?.bidCount || 0) > 0;
      const minRequiredCents = hasAnyBids ? currentBidCents + getMinIncrementCents(currentBidCents) : startingBidCents;
      if (maxBidCents < minRequiredCents) {
        throw new Error(`Max bid must be at least $${(minRequiredCents / 100).toLocaleString()}`);
      }

      const autoBidRef = listingRef.collection('autoBids').doc(userId);
      const autoBidSnap = await tx.get(autoBidRef);
      const existing = autoBidSnap.exists ? (autoBidSnap.data() as any) : null;
      const existingMax = Number(existing?.maxBidCents || 0) || 0;
      const createdAtMs = existing?.createdAt?.toMillis ? existing.createdAt.toMillis() : nowMs;
      if (existing && existing.enabled === true && maxBidCents <= existingMax) {
        throw new Error('Your maximum bid must be higher than your current maximum bid.');
      }

      tx.set(
        autoBidRef,
        { userId, maxBidCents, enabled: true, ...(autoBidSnap.exists ? {} : { createdAt: now }), updatedAt: now },
        { merge: true }
      );

      const autoBidsSnap = await tx.get(listingRef.collection('autoBids').where('enabled', '==', true));
      const autoBidSet: AutoBidEntry[] = autoBidsSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          userId: String(data.userId || d.id),
          maxBidCents: Number(data.maxBidCents || 0) || 0,
          enabled: Boolean(data.enabled),
          createdAtMs: data?.createdAt?.toMillis ? data.createdAt.toMillis() : nowMs,
          updatedAtMs: data?.updatedAt?.toMillis ? data.updatedAt.toMillis() : undefined,
        };
      });

      const merged: AutoBidEntry[] = [...autoBidSet.filter((e) => e.userId !== userId), { userId, maxBidCents, enabled: true, createdAtMs }];
      const prevBidderId = typeof listing.currentBidderId === 'string' ? listing.currentBidderId : null;

      const out = computeNextState({ currentBidCents, highBidderId: prevBidderId, autoBidSet: merged });
      const newCurrentBidCents = out.newCurrentBidCents;
      const newHighBidderId = out.newHighBidderId;
      const priceMoved = newCurrentBidCents !== currentBidCents;
      const highBidderChanged = newHighBidderId && newHighBidderId !== prevBidderId;

      let bidId: string | null = null;
      if (priceMoved || highBidderChanged) {
        const bidsCol = db.collection('bids');
        const bidRef = bidsCol.doc();
        bidId = bidRef.id;
        // Record effective bid for the user if they're winning; otherwise we only updated max.
        if (newHighBidderId === userId) {
          tx.set(bidRef, {
            listingId: auctionId,
            bidderId: userId,
            amount: newCurrentBidCents / 100,
            amountCents: newCurrentBidCents,
            isAuto: false,
            createdAt: now,
          });
          tx.update(listingRef, {
            currentBid: newCurrentBidCents / 100,
            currentBidCents: newCurrentBidCents,
            currentBidderId: newHighBidderId,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId,
            'metrics.bidCount': FieldValue.increment(1),
            'metrics.lastBidAt': FieldValue.serverTimestamp(),
          });
        } else {
          // Another bidder is still winning; only update listing if our max caused price movement (rare).
          if (priceMoved) {
            const synthetic = out.syntheticBidsToWrite.find((b) => b.bidderId === newHighBidderId);
            if (synthetic?.bidderId) {
              const synRef = bidsCol.doc();
              tx.set(synRef, {
                listingId: auctionId,
                bidderId: synthetic.bidderId,
                amount: synthetic.amountCents / 100,
                amountCents: synthetic.amountCents,
                isAuto: true,
                createdAt: now,
              });
              tx.update(listingRef, {
                currentBid: newCurrentBidCents / 100,
                currentBidCents: newCurrentBidCents,
                currentBidderId: newHighBidderId,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: userId,
                'metrics.bidCount': FieldValue.increment(1),
                'metrics.lastBidAt': FieldValue.serverTimestamp(),
              });
            }
          }
        }
      }

      const endsAt = listing.endsAt?.toDate ? (listing.endsAt.toDate() as Date) : undefined;
      return {
        ok: true as const,
        newCurrentBid: (newCurrentBidCents / 100) as number,
        bidId,
        prevBidderId,
        newBidderId: newHighBidderId,
        listingTitle: listing.title || 'a listing',
        listingUrl: `${getSiteUrl()}/listing/${auctionId}`,
        ...(endsAt ? { endsAtIso: endsAt.toISOString() } : {}),
        sellerId: listing.sellerId || null,
      };
    });

    // Notify (best-effort)
    const newBidderId = result.newBidderId || null;
    if (result.sellerId) {
      await emitEventForUser({
        type: 'Auction.BidReceived',
        actorId: userId,
        entityType: 'listing',
        entityId: auctionId,
        targetUserId: String(result.sellerId),
        payload: {
          type: 'Auction.BidReceived',
          listingId: auctionId,
          listingTitle: result.listingTitle,
          listingUrl: result.listingUrl,
          bidAmount: result.newCurrentBid,
        },
        optionalHash: `autobid:${auctionId}:${userId}:${maxBidCents}`,
      });
    }

    if (result.prevBidderId && newBidderId && result.prevBidderId !== newBidderId) {
      await emitEventForUser({
        type: 'Auction.Outbid',
        actorId: userId,
        entityType: 'listing',
        entityId: auctionId,
        targetUserId: result.prevBidderId,
        payload: {
          type: 'Auction.Outbid',
          listingId: auctionId,
          listingTitle: result.listingTitle,
          listingUrl: result.listingUrl,
          newHighBidAmount: result.newCurrentBid,
          ...(result.endsAtIso ? { endsAt: result.endsAtIso } : {}),
        },
        optionalHash: `autobid:${auctionId}:${userId}:${maxBidCents}`,
      });
    }

    if (newBidderId === userId) {
      await emitEventForUser({
        type: 'Auction.HighBidder',
        actorId: userId,
        entityType: 'listing',
        entityId: auctionId,
        targetUserId: userId,
        payload: {
          type: 'Auction.HighBidder',
          listingId: auctionId,
          listingTitle: result.listingTitle,
          listingUrl: result.listingUrl,
          yourBidAmount: result.newCurrentBid,
          currentBidAmount: result.newCurrentBid,
          ...(result.endsAtIso ? { endsAt: result.endsAtIso } : {}),
        },
        optionalHash: `autobid:${auctionId}:${userId}:${maxBidCents}`,
      });
    }

    return json(result);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Failed to set auto-bid' }, { status: 400 });
  }
}

