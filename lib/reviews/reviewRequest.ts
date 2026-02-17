import { getSiteUrl } from '@/lib/site-url';
import { emitAndProcessEventForUser } from '@/lib/notifications/emitEvent';
import type { Firestore } from 'firebase-admin/firestore';

export async function enqueueReviewRequest(params: {
  db: Firestore;
  orderId: string;
  order: any;
  force?: boolean;
}): Promise<{ ok: boolean; created: boolean; eventId?: string }> {
  const orderId = String(params.orderId || '').trim();
  const order = params.order || {};
  if (!orderId) return { ok: false, created: false };

  const buyerId = String(order?.buyerId || '').trim();
  const sellerId = String(order?.sellerId || '').trim();
  if (!buyerId || !sellerId) return { ok: false, created: false };

  let sellerDisplayName = String(order?.sellerDisplayName || order?.sellerName || '').trim();
  if (!sellerDisplayName) {
    try {
      const sellerSnap = await params.db.collection('users').doc(sellerId).get();
      const seller = sellerSnap.exists ? (sellerSnap.data() as any) : null;
      sellerDisplayName =
        String(seller?.profile?.businessName || seller?.profile?.fullName || seller?.displayName || '').trim() ||
        'Seller';
    } catch {
      sellerDisplayName = 'Seller';
    }
  }

  const listingTitle = String(order?.listingSnapshot?.title || order?.listingTitle || 'Listing').trim() || 'Listing';
  const listingId = String(order?.listingId || '').trim() || orderId;
  const reviewUrl = `${getSiteUrl()}/dashboard/orders/${orderId}?review=1`;

  const optionalHash = params.force ? `review_request:${orderId}:${Date.now()}` : `review_request:${orderId}`;

  const res = await emitAndProcessEventForUser({
    type: 'Review.Request',
    actorId: 'system',
    entityType: 'order',
    entityId: orderId,
    targetUserId: buyerId,
    payload: {
      type: 'Review.Request',
      orderId,
      listingId,
      listingTitle,
      sellerId,
      sellerDisplayName,
      reviewUrl,
    },
    optionalHash,
  });

  return { ok: res.ok, created: res.created, eventId: res.eventId };
}
