/**
 * GET /api/admin/orders/protected
 *
 * Admin-only endpoint for "Protected Transactions" admin dashboard.
 * Returns a paginated list of orders that need admin attention:
 * - ready_to_release
 * - open protected disputes
 * - payout hold reasons (e.g. protection_window, admin_hold, chargeback)
 *
 * Query params:
 * - limit: number (default 50, max 100)
 * - cursor: string (orderId to startAfter; from previous response)
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { FieldPath } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';

function clampInt(v: string | null, fallback: number, min: number, max: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function toIsoSafe(value: any): string | null {
  try {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value?.toDate === 'function') {
      const d = value.toDate();
      return d instanceof Date ? d.toISOString() : null;
    }
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
    return null;
  } catch {
    return null;
  }
}

function getDisputeStatus(orderData: any): string | null {
  return (orderData?.protectedDisputeStatus || orderData?.disputeStatus || null) as string | null;
}

function needsAdminAttention(orderData: any): boolean {
  if (!orderData) return false;
  if (orderData?.stripeTransferId) return false;

  const status = String(orderData?.status || '');
  const payoutHoldReason = String(orderData?.payoutHoldReason || 'none');
  const disputeStatus = getDisputeStatus(orderData);
  const hasOpenDispute = !!disputeStatus && ['open', 'needs_evidence', 'under_review'].includes(disputeStatus);

  if (status === 'ready_to_release') return true;
  if (hasOpenDispute) return true;
  if (orderData?.adminHold === true) return true;
  if (payoutHoldReason && payoutHoldReason !== 'none') return true;

  return false;
}

export async function GET(request: Request) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const { searchParams } = new URL(request.url);
  const limit = clampInt(searchParams.get('limit'), 50, 1, 100);
  const cursor = searchParams.get('cursor');

  const db = admin.ctx.db;

  // Overfetch so filtering doesn't return short pages.
  const batchSize = Math.min(250, limit * 5);
  const maxBatches = 5;

  let baseQuery = db.collection('orders').orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  if (cursor) {
    const cursorDoc = await db.collection('orders').doc(cursor).get();
    if (cursorDoc.exists) {
      baseQuery = baseQuery.startAfter(cursorDoc);
    }
  }

  const picked: Array<{ id: string; data: any }> = [];
  let lastScannedId: string | null = null;
  let batches = 0;
  let hasMore = false;

  // Iteratively fetch batches until we fill the requested page (or run out).
  while (picked.length < limit && batches < maxBatches) {
    const snap = await baseQuery.limit(batchSize).get();
    batches += 1;

    if (snap.empty) {
      hasMore = false;
      break;
    }

    for (const doc of snap.docs) {
      lastScannedId = doc.id;
      const data = doc.data();
      if (needsAdminAttention(data)) {
        picked.push({ id: doc.id, data });
        if (picked.length >= limit) break;
      }
    }

    if (snap.size < batchSize) {
      hasMore = false;
      break;
    }

    // There may be more results; continue from the last scanned doc.
    hasMore = true;
    baseQuery = baseQuery.startAfter(snap.docs[snap.docs.length - 1]);
  }

  // Batch-join listing + user details (bounded by `limit`).
  const listingIds = Array.from(new Set(picked.map((o) => String(o.data?.listingId || '')).filter(Boolean)));
  const userIds = Array.from(
    new Set(
      picked
        .flatMap((o) => [o.data?.buyerId, o.data?.sellerId])
        .map((v) => (v ? String(v) : ''))
        .filter(Boolean)
    )
  );

  const listingRefs = listingIds.map((id) => db.collection('listings').doc(id));
  const userRefs = userIds.map((id) => db.collection('users').doc(id));
  const [listingSnaps, userSnaps] = await Promise.all([
    listingRefs.length ? db.getAll(...listingRefs) : Promise.resolve([]),
    userRefs.length ? db.getAll(...userRefs) : Promise.resolve([]),
  ]);

  const listingsById = new Map<string, any>();
  for (const s of listingSnaps as any[]) if (s?.exists) listingsById.set(s.id, s.data());

  const usersById = new Map<string, any>();
  for (const s of userSnaps as any[]) if (s?.exists) usersById.set(s.id, s.data());

  const orders = picked.map(({ id, data }) => {
    const listingId = String(data?.listingId || '');
    const listing = listingsById.get(listingId) || null;

    const buyerId = String(data?.buyerId || '');
    const sellerId = String(data?.sellerId || '');
    const buyer = usersById.get(buyerId) || null;
    const seller = usersById.get(sellerId) || null;

    const listingSnapshot = data?.listingSnapshot || null;
    const title = listingSnapshot?.title || listing?.title || null;
    const coverPhotoUrl = listingSnapshot?.coverPhotoUrl || listing?.coverPhotoUrl || listing?.images?.[0]?.url || null;

    const disputeStatus = getDisputeStatus(data);

    const disputeEvidence = Array.isArray(data?.disputeEvidence)
      ? data.disputeEvidence.map((e: any) => ({
          ...e,
          uploadedAt: toIsoSafe(e?.uploadedAt) || null,
        }))
      : [];

    return {
      id,
      // Core order fields used by UI
      listingId,
      buyerId,
      sellerId,
      status: data?.status || null,
      amount: data?.amount || 0,
      sellerAmount: data?.sellerAmount || 0,
      payoutHoldReason: data?.payoutHoldReason || null,
      adminHold: data?.adminHold === true,
      stripeTransferId: data?.stripeTransferId || null,
      disputeStatus,
      disputeReasonV2: data?.disputeReasonV2 || null,
      disputeNotes: data?.disputeNotes || null,
      disputeEvidence,
      protectionStartAt: toIsoSafe(data?.protectionStartAt),
      protectionEndsAt: toIsoSafe(data?.protectionEndsAt),
      createdAt: toIsoSafe(data?.createdAt),
      updatedAt: toIsoSafe(data?.updatedAt),

      // Enriched display fields (kept optional on the client type)
      listingTitle: title,
      listingImage: coverPhotoUrl,
      buyerName: buyer?.displayName || buyer?.name || null,
      sellerName: seller?.displayName || seller?.name || null,
      buyerEmail: buyer?.email || null,
      sellerEmail: seller?.email || null,
    };
  });

  return json({
    ok: true,
    orders,
    nextCursor: hasMore ? lastScannedId : null,
  });
}

