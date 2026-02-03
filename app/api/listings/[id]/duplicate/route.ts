/**
 * POST /api/listings/[id]/duplicate
 *
 * Seller-only: duplicates a listing into a new DRAFT listing.
 *
 * Security:
 * - Only the listing owner can duplicate
 * - All fields are copied server-side; no client-controlled document writes
 * - Clears moderation/compliance/order-related state and resets metrics
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function safeString(v: any): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  const params = typeof (ctx.params as any)?.then === 'function'
    ? await (ctx.params as Promise<{ id: string }>)
    : (ctx.params as { id: string });
  const sourceListingId = String(params?.id || '').trim();
  if (!sourceListingId) return json({ ok: false, error: 'Missing listing id' }, { status: 400 });

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.slice('Bearer '.length);

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const srcRef = db.collection('listings').doc(sourceListingId);
  const srcSnap = await srcRef.get();
  if (!srcSnap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

  const src = srcSnap.data() as any;
  const sellerId = safeString(src?.sellerId || '');
  if (!sellerId) return json({ ok: false, error: 'Listing is missing sellerId' }, { status: 400 });
  if (sellerId !== uid) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  // Seller snapshot: keep if present, otherwise best-effort pull minimal profile.
  let sellerSnapshot = src?.sellerSnapshot;
  if (!sellerSnapshot || typeof sellerSnapshot?.displayName !== 'string') {
    try {
      const userSnap = await db.collection('users').doc(uid).get();
      const u = userSnap.exists ? (userSnap.data() as any) : null;
      sellerSnapshot = {
        displayName: safeString(u?.displayName || u?.profile?.fullName || u?.profile?.businessName || 'Seller'),
        verified: u?.sellerVerified === true || u?.verified === true,
      };
    } catch {
      sellerSnapshot = { displayName: 'Seller', verified: false };
    }
  }

  const now = Timestamp.now();
  const newRef = db.collection('listings').doc();

  const rawTitle = safeString(src?.title || 'Listing');
  const dupTitle = rawTitle.toLowerCase().startsWith('copy of ') ? rawTitle : `Copy of ${rawTitle}`;

  // Core fields to copy (sanitized).
  const base: Record<string, any> = {
    title: dupTitle,
    description: safeString(src?.description || ''),
    type: safeString(src?.type || 'fixed'),
    category: safeString(src?.category || ''),
    subcategory: typeof src?.subcategory === 'string' ? src.subcategory : FieldValue.delete(),
    location: src?.location && typeof src.location === 'object' ? src.location : { city: '', state: 'TX' },
    trust: src?.trust && typeof src.trust === 'object' ? src.trust : { verified: false, insuranceAvailable: false, transportReady: false },
    attributes: src?.attributes && typeof src.attributes === 'object' ? src.attributes : {},

    // Media (Phase 1 photo library support + legacy images)
    images: Array.isArray(src?.images) ? src.images.filter((u: any) => typeof u === 'string') : [],
    photoIds: Array.isArray(src?.photoIds) ? src.photoIds.filter((p: any) => typeof p === 'string') : FieldValue.delete(),
    photos: Array.isArray(src?.photos) ? src.photos : FieldValue.delete(),
    coverPhotoId: typeof src?.coverPhotoId === 'string' ? src.coverPhotoId : FieldValue.delete(),

    // Pricing: keep seller-entered fields, clear auction runtime fields
    price: typeof src?.price === 'number' ? src.price : FieldValue.delete(),
    startingBid: typeof src?.startingBid === 'number' ? src.startingBid : FieldValue.delete(),
    reservePrice: typeof src?.reservePrice === 'number' ? src.reservePrice : FieldValue.delete(),
    // Do NOT copy endsAt; require user to set it again for a new auction cycle.
    endsAt: FieldValue.delete(),
    currentBid: FieldValue.delete(),
    currentBidderId: FieldValue.delete(),

    // Best offer settings (safe to copy)
    bestOfferEnabled: typeof src?.bestOfferEnabled === 'boolean' ? src.bestOfferEnabled : FieldValue.delete(),
    bestOfferMinPrice: typeof src?.bestOfferMinPrice === 'number' ? src.bestOfferMinPrice : FieldValue.delete(),
    bestOfferAutoAcceptPrice: typeof src?.bestOfferAutoAcceptPrice === 'number' ? src.bestOfferAutoAcceptPrice : FieldValue.delete(),
    bestOfferSettings: src?.bestOfferSettings && typeof src.bestOfferSettings === 'object' ? src.bestOfferSettings : FieldValue.delete(),

    // Protected Transaction settings
    protectedTransactionEnabled:
      typeof src?.protectedTransactionEnabled === 'boolean' ? src.protectedTransactionEnabled : FieldValue.delete(),
    protectedTransactionDays: typeof src?.protectedTransactionDays === 'number' ? src.protectedTransactionDays : FieldValue.delete(),
    protectedTermsVersion: typeof src?.protectedTermsVersion === 'string' ? src.protectedTermsVersion : FieldValue.delete(),
    protectedEnabledAt: FieldValue.delete(),

    // Ownership + publish lifecycle
    sellerId: uid,
    sellerSnapshot,
    status: 'draft',
    pendingReason: FieldValue.delete(),
    publishedAt: FieldValue.delete(),

    // Moderation fields cleared
    rejectedAt: FieldValue.delete(),
    rejectedBy: FieldValue.delete(),
    rejectionReason: FieldValue.delete(),
    approvedAt: FieldValue.delete(),
    approvedBy: FieldValue.delete(),
    resubmittedAt: FieldValue.delete(),
    resubmittedForRejectionAt: FieldValue.delete(),
    resubmissionCount: FieldValue.delete(),

    // Compliance cleared (documents are NOT duplicated)
    complianceStatus: FieldValue.delete(),
    complianceRejectionReason: FieldValue.delete(),
    complianceReviewedBy: FieldValue.delete(),
    complianceReviewedAt: FieldValue.delete(),

    // Sold fields cleared
    soldAt: FieldValue.delete(),
    soldPriceCents: FieldValue.delete(),
    saleType: FieldValue.delete(),

    // Offer reservation cleared
    offerReservedByOfferId: FieldValue.delete(),
    offerReservedAt: FieldValue.delete(),

    // Metrics reset
    metrics: { views: 0, favorites: 0, bidCount: 0 },
    watcherCount: FieldValue.delete(),

    // Audit
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
    updatedBy: uid,

    // Traceability (internal)
    duplicatedFromListingId: sourceListingId,
  };

  // Ensure status/type/category are sane-ish.
  if (!base.category) return json({ ok: false, error: 'Listing missing category' }, { status: 400 });

  await newRef.set(base, { merge: true });

  return json({ ok: true, listingId: newRef.id });
}

