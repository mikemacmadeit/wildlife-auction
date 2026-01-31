/**
 * POST /api/listings/[id]/reconcile-sold
 *
 * Reconciles a listing with a paid order: if the current user is the seller and
 * an order exists for this listing in a paid/completed state, updates the listing
 * document to status 'sold' with soldAt and soldPriceCents. Use when the webhook
 * did not update the listing (e.g. race, failure) so My Listings and browse show Sold.
 *
 * Safety:
 * - Requires Firebase ID token
 * - Only the listing seller may call
 * - Idempotent: if listing is already sold, returns 200 with no change
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

const SOLD_ORDER_STATUSES = [
  'paid_held',
  'paid',
  'in_transit',
  'delivered',
  'buyer_confirmed',
  'accepted',
  'ready_to_release',
  'disputed',
  'completed',
] as const;

function json(body: object, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const rawParams = await ctx.params;
  const listingId = typeof rawParams?.id === 'string' ? rawParams.id.trim() : '';
  if (!listingId) return json({ error: 'Invalid listing id' }, { status: 400 });

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.slice('Bearer '.length);

  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded?.uid ?? '';
  } catch {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!uid) return json({ error: 'Unauthorized' }, { status: 401 });

  const db = getAdminDb();
  const listingRef = db.collection('listings').doc(listingId);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) return json({ error: 'Listing not found' }, { status: 404 });

  const listingData = listingSnap.data() as Record<string, unknown>;
  const sellerId = String(listingData?.sellerId ?? '');
  if (sellerId !== uid) return json({ error: 'Forbidden' }, { status: 403 });

  if (listingData?.status === 'sold' || listingData?.soldAt) {
    return json({ success: true, alreadySold: true });
  }

  const ordersSnap = await db
    .collection('orders')
    .where('listingId', '==', listingId)
    .where('sellerId', '==', uid)
    .limit(20)
    .get();

  let orderDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (const doc of ordersSnap.docs) {
    const status = String((doc.data() as any)?.status ?? '');
    if (SOLD_ORDER_STATUSES.includes(status as any)) {
      orderDoc = doc;
      break;
    }
  }
  if (!orderDoc) return json({ error: 'No paid order found for this listing' }, { status: 404 });

  const orderData = orderDoc.data() as any;
  const paidAt = orderData?.paidAt ?? orderData?.createdAt ?? orderData?.updatedAt;
  const now = new Date();
  const soldAt = paidAt?.toDate ? paidAt.toDate() : paidAt instanceof Date ? paidAt : now;
  const amount = typeof orderData?.amount === 'number' && Number.isFinite(orderData.amount)
    ? Math.round(orderData.amount)
    : undefined;

  const update: Record<string, unknown> = {
    status: 'sold',
    endedReason: 'sold',
    endedAt: Timestamp.fromDate(soldAt),
    soldAt: Timestamp.fromDate(soldAt),
    updatedAt: Timestamp.fromDate(now),
  };
  if (amount != null) update.soldPriceCents = amount;
  update.offerReservedByOfferId = null;
  update.offerReservedAt = null;
  update.purchaseReservedByOrderId = null;
  update.purchaseReservedAt = null;
  update.purchaseReservedUntil = null;

  await listingRef.set(update, { merge: true });
  return json({ success: true, orderId: orderDoc.id });
}
