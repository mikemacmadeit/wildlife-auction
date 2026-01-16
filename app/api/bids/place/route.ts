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

      const currentBid = listing.currentBid ?? listing.startingBid ?? 0;
      if (amount <= currentBid) {
        throw new Error(`Bid must be higher than the current bid of $${Number(currentBid).toLocaleString()}`);
      }

      const bidRef = db.collection('bids').doc();
      tx.set(bidRef, {
        listingId,
        bidderId,
        amount,
        createdAt: Timestamp.now(),
      });

      const prevBidderId = listing.currentBidderId || null;
      tx.update(listingRef, {
        currentBid: amount,
        currentBidderId: bidderId,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: bidderId,
        'metrics.bidCount': FieldValue.increment(1),
      });

      // Notifications (best-effort, still inside tx for consistency)
      const notificationsRef = db.collection('notifications');
      if (listing.sellerId) {
        tx.set(notificationsRef.doc(), {
          userId: listing.sellerId,
          type: 'bid_received',
          title: 'New Bid Received',
          body: `Someone placed a bid of $${amount.toLocaleString()} on "${listing.title || 'your listing'}"`,
          read: false,
          createdAt: Timestamp.now(),
          linkUrl: `/listing/${listingId}`,
          linkLabel: 'View Listing',
          listingId,
          metadata: { bidAmount: amount, bidderId },
        });
      }
      if (prevBidderId && prevBidderId !== bidderId) {
        tx.set(notificationsRef.doc(), {
          userId: prevBidderId,
          type: 'bid_outbid',
          title: 'You Were Outbid',
          body: `Someone placed a higher bid of $${amount.toLocaleString()} on "${listing.title || 'a listing'}"`,
          read: false,
          createdAt: Timestamp.now(),
          linkUrl: `/listing/${listingId}`,
          linkLabel: 'Place New Bid',
          listingId,
          metadata: { newBidAmount: amount },
        });
      }

      return { newCurrentBid: amount, bidId: bidRef.id };
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

    return json({ ok: true, ...result });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Failed to place bid' }, { status: 400 });
  }
}

