/**
 * PATCH /api/listings/[id]/update
 *
 * Server-side listing updates (Admin SDK) for seller-owned listings.
 *
 * Why this exists:
 * - Client Firestore rules intentionally block certain mutations (e.g. active auction critical fields).
 * - Draft/duplicate flows should be user-friendly and reliable even when rules are strict.
 *
 * Safety:
 * - Requires Firebase ID token
 * - Only listing owner may update
 * - Disallows immutable + server-only fields
 * - Enforces the same "active auction lock" gates as Firestore rules
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

  // Enforce the same protection as rules for active auctions.
  const currentType = String(current?.type || '');
  const currentStatus = String(current?.status || '');

  // Universal duration rule: once active, duration cannot be changed/extended.
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
  if (currentType === 'auction' && currentStatus === 'active') {
    const requestedKeys = Object.keys(updates);
    const blocked = requestedKeys.filter((k) => ACTIVE_AUCTION_LOCKED_FIELDS.has(k));
    if (blocked.length > 0) {
      return json(
        {
          ok: false,
          error: 'Active auction is locked',
          code: 'ACTIVE_AUCTION_LOCKED',
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

