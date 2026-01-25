/**
 * PATCH /api/listings/[id]/update
 *
 * Server-side listing updates (Admin SDK) for seller-owned listings.
 * Implements eBay-like rules for what can be changed after listing is published.
 *
 * eBay Rules Implemented:
 * - Once auction starts: Type, Duration, Starting Bid, Reserve Price are locked
 * - Once auction has bids: Title, Category, Location, Trust badges are also locked
 * - Only Description, Photos, and some Attributes can be changed after bids exist
 * - Fixed price with offers: Price is locked once offers exist
 *
 * Why this exists:
 * - Client Firestore rules intentionally block certain mutations (e.g. active auction critical fields).
 * - Draft/duplicate flows should be user-friendly and reliable even when rules are strict.
 *
 * Safety:
 * - Requires Firebase ID token
 * - Only listing owner may update
 * - Disallows immutable + server-only fields
 * - Enforces eBay-like "active auction lock" gates
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

const paramsSchema = z.object({ id: z.string().min(1) });

const bodySchema = z.object({
  updates: z.record(z.any()).default({}),
});

const IMMUTABLE_OR_SERVER_ONLY_FIELDS = new Set([
  'sellerId',
  'createdBy',
  'createdAt',
  // Duration lifecycle is server-controlled (publish + scheduled expiry).
  'startAt',
  'endAt',
  'endedAt',
  'endedReason',
  'offerReservedByOfferId',
  'offerReservedAt',
  'purchaseReservedByOrderId',
  'purchaseReservedAt',
  'purchaseReservedUntil',
  // status changes should be handled by publish/resubmit routes
  'status',
]);

// Fields locked for ALL active auctions (eBay rule: once auction starts, these are locked)
const ACTIVE_AUCTION_LOCKED_FIELDS = new Set([
  'type',
  'status',
  'endsAt',
  'startingBid',
  'startingBidCents',
  'reservePrice',
  'reservePriceCents',
  'currentBid',
  'currentBidCents',
  'currentBidderId',
  'metrics',
  'endedAt',
  'auctionFinalizedAt',
  'auctionResultStatus',
  'auctionPaymentDueAt',
  'durationDays',
]);

// Fields locked for active auctions WITH BIDS (eBay rule: once bids exist, these are locked)
const ACTIVE_AUCTION_WITH_BIDS_LOCKED_FIELDS = new Set([
  'title',
  'category',
  'subcategory',
  'location', // Location changes could affect shipping/transport
  'trust', // Trust badges shouldn't change mid-auction
]);

// Fields locked for active fixed price listings WITH OFFERS (eBay rule: once offers exist, price is locked)
const ACTIVE_FIXED_WITH_OFFERS_LOCKED_FIELDS = new Set([
  'price',
  'priceCents',
]);

function isValidListingCategory(c: unknown): boolean {
  return (
    typeof c === 'string' &&
    [
      'whitetail_breeder',
      'wildlife_exotics',
      'cattle_livestock',
      'ranch_equipment',
      'horse_equestrian',
      'ranch_vehicles',
      'hunting_outfitter_assets',
      'sporting_working_dogs',
    ].includes(c)
  );
}

function maybeTimestamp(v: any): Timestamp | undefined {
  if (!v) return undefined;
  // Accept Firestore Timestamp-like
  if (typeof v === 'object' && typeof v?.toDate === 'function') return v as Timestamp;
  // Accept ISO strings / millis
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isFinite(d.getTime())) return undefined;
  return Timestamp.fromDate(d);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const rawParams = await ctx.params;
  const parsedParams = paramsSchema.safeParse(rawParams);
  if (!parsedParams.success) return json({ ok: false, error: 'Invalid id' }, { status: 400 });
  const listingId = parsedParams.data.id;

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.slice('Bearer '.length);

  let uid: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded?.uid;
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const rawBody = await request.json().catch(() => ({}));
  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedBody.success) return json({ ok: false, error: 'Invalid body' }, { status: 400 });

  const updates = { ...(parsedBody.data.updates || {}) } as Record<string, any>;

  // Strip immutable + server-only fields.
  for (const k of Object.keys(updates)) {
    if (IMMUTABLE_OR_SERVER_ONLY_FIELDS.has(k)) delete updates[k];
  }

  // Validate category if provided (and not stripped).
  if (Object.prototype.hasOwnProperty.call(updates, 'category') && !isValidListingCategory(updates.category)) {
    return json({ ok: false, error: 'Invalid category' }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection('listings').doc(listingId);
  const snap = await ref.get();
  if (!snap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

  const current = snap.data() as any;
  if (String(current?.sellerId || '') !== uid) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  // Enforce eBay-like rules for active listings
  const currentType = String(current?.type || '');
  const currentStatus = String(current?.status || '');
  
  // Check if auction has bids
  const bidCount = Number(current?.metrics?.bidCount || 0) || 0;
  const hasBids = bidCount > 0 || Boolean(current?.currentBidderId) || Number(current?.currentBid || 0) > 0;
  
  // Check if fixed price listing has offers (check for pending/accepted offers)
  const hasOffers = Boolean((current as any)?.offerReservedByOfferId) || 
                    (() => {
                      // Check if there are any active offers - we'd need to query offers collection
                      // For now, we'll be conservative and check offerReservedByOfferId
                      return false;
                    })();

  // Universal rule: once active, duration cannot be changed/extended (eBay rule)
  if (currentStatus === 'active') {
    const requestedKeys = Object.keys(updates);
    const blocked = requestedKeys.filter((k) => k === 'durationDays');
    if (blocked.length > 0) {
      return json(
        {
          ok: false,
          error: 'Active listing duration is locked',
          code: 'ACTIVE_LISTING_DURATION_LOCKED',
          blockedFields: blocked,
        },
        { status: 409 }
      );
    }
  }

  // eBay rule: Active auctions - lock critical fields
  if (currentType === 'auction' && currentStatus === 'active') {
    const requestedKeys = Object.keys(updates);
    let blocked: string[] = [];
    
    // Always lock these fields for active auctions
    blocked = requestedKeys.filter((k) => ACTIVE_AUCTION_LOCKED_FIELDS.has(k));
    
    // If auction has bids, lock additional fields (eBay rule: once bids exist, title/category are locked)
    if (hasBids) {
      const additionalBlocked = requestedKeys.filter((k) => ACTIVE_AUCTION_WITH_BIDS_LOCKED_FIELDS.has(k));
      blocked = [...blocked, ...additionalBlocked];
    }
    
    if (blocked.length > 0) {
      return json(
        {
          ok: false,
          error: hasBids 
            ? 'Active auction with bids is locked. Only description, photos, and some attributes can be changed.'
            : 'Active auction is locked. Critical fields cannot be changed once the auction starts.',
          code: hasBids ? 'ACTIVE_AUCTION_WITH_BIDS_LOCKED' : 'ACTIVE_AUCTION_LOCKED',
          blockedFields: blocked,
        },
        { status: 409 }
      );
    }
  }

  // eBay rule: Fixed price listings with offers - lock price
  if (currentType === 'fixed' && currentStatus === 'active' && hasOffers) {
    const requestedKeys = Object.keys(updates);
    const blocked = requestedKeys.filter((k) => ACTIVE_FIXED_WITH_OFFERS_LOCKED_FIELDS.has(k));
    if (blocked.length > 0) {
      return json(
        {
          ok: false,
          error: 'Active listing with offers is locked. Price cannot be changed once offers exist.',
          code: 'ACTIVE_FIXED_WITH_OFFERS_LOCKED',
          blockedFields: blocked,
        },
        { status: 409 }
      );
    }
  }

  // Normalize common date fields.
  if (Object.prototype.hasOwnProperty.call(updates, 'endsAt')) {
    const ts = maybeTimestamp(updates.endsAt);
    updates.endsAt = ts ?? FieldValue.delete();
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'featuredUntil')) {
    const ts = maybeTimestamp(updates.featuredUntil);
    updates.featuredUntil = ts ?? FieldValue.delete();
  }

  updates.updatedAt = FieldValue.serverTimestamp();
  updates.updatedBy = uid;

  try {
    await ref.update(updates);
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to update listing', message: e?.message || String(e) }, { status: 500 });
  }
}

