/**
 * Sync stale action-required notifications: mark as completed when the underlying
 * order/offer/listing is already past the action step (e.g. order already delivered,
 * offer already declined, listing already sold). Fixes "needs action" that are wrong
 * due to old data or missed resolve calls.
 *
 * Server-only (Firebase Admin). Call from GET /api/notifications/sync-stale when
 * the user opens the notifications page so To do and "Needs action" stay accurate.
 */

import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

const ACTION_REQUIRED_TYPES = [
  'order_created',
  'order_delivery_address_set',
  'order_delivery_scheduled',
  'order_final_payment_due',
  'offer_accepted',
  'offer_countered',
  'bid_outbid',
  'auction_outbid',
] as const;

const SELLER_PROPOSED_STATUSES = [
  'DELIVERY_PROPOSED',
  'DELIVERY_SCHEDULED',
  'OUT_FOR_DELIVERY',
  'DELIVERED_PENDING_CONFIRMATION',
  'COMPLETED',
  'REFUNDED',
  'CANCELLED',
];

const BUYER_AGREED_STATUSES = [
  'DELIVERY_SCHEDULED',
  'OUT_FOR_DELIVERY',
  'DELIVERED_PENDING_CONFIRMATION',
  'COMPLETED',
  'REFUNDED',
  'CANCELLED',
];

const ORDER_END_STATUSES = ['COMPLETED', 'REFUNDED', 'CANCELLED'];

const OFFER_CLOSED_STATUSES = ['accepted', 'declined', 'withdrawn', 'expired', 'cancelled'];

const LISTING_END_STATUSES = ['sold', 'ended', 'expired'];

function hasActionCompletedAt(data: Record<string, unknown>): boolean {
  const v = data.actionCompletedAt;
  if (v == null) return false;
  if (typeof v === 'object' && 'toMillis' in (v as any)) return true;
  if (typeof v === 'string' || typeof v === 'number') return true;
  return false;
}

export async function syncStaleActionNotifications(
  db: Firestore,
  userId: string
): Promise<{ updated: number }> {
  if (!userId) return { updated: 0 };

  const notificationsRef = db.collection('users').doc(userId).collection('notifications');
  const snap = await notificationsRef.where('type', 'in', [...ACTION_REQUIRED_TYPES]).limit(100).get();
  const toUpdate: DocumentReference[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown> & { type?: string; entityId?: string };
    if (hasActionCompletedAt(data)) continue;

    const type = String(data.type || '').trim();
    const entityId = data.entityId ? String(data.entityId).trim() : '';
    if (!entityId) continue;

    let stale = false;

    if (type === 'order_created' || type === 'order_delivery_address_set') {
      try {
        const orderSnap = await db.collection('orders').doc(entityId).get();
        if (!orderSnap.exists) {
          stale = true; // order gone → treat as stale so we don't block To do
        } else {
          const order = orderSnap.data() as { transactionStatus?: string } | undefined;
          const tx = order?.transactionStatus;
          stale = !!tx && SELLER_PROPOSED_STATUSES.includes(tx);
        }
      } catch {
        // on error, don't mark stale
      }
    } else if (type === 'order_delivery_scheduled') {
      try {
        const orderSnap = await db.collection('orders').doc(entityId).get();
        if (!orderSnap.exists) stale = true;
        else {
          const order = orderSnap.data() as { transactionStatus?: string } | undefined;
          const tx = order?.transactionStatus;
          stale = !!tx && BUYER_AGREED_STATUSES.includes(tx);
        }
      } catch {}
    } else if (type === 'order_final_payment_due') {
      try {
        const orderSnap = await db.collection('orders').doc(entityId).get();
        if (!orderSnap.exists) stale = true;
        else {
          const order = orderSnap.data() as { transactionStatus?: string; finalPaymentConfirmedAt?: unknown } | undefined;
          const tx = order?.transactionStatus;
          const finalPaid = order?.finalPaymentConfirmedAt != null;
          stale = finalPaid || (!!tx && ORDER_END_STATUSES.includes(tx));
        }
      } catch {}
    } else if (type === 'offer_accepted' || type === 'offer_countered') {
      try {
        const offerSnap = await db.collection('offers').doc(entityId).get();
        if (!offerSnap.exists) stale = true;
        else {
          const offer = offerSnap.data() as { status?: string; orderId?: string } | undefined;
          const status = offer?.status;
          const hasOrder = !!offer?.orderId;
          stale = hasOrder || (!!status && OFFER_CLOSED_STATUSES.includes(status));
        }
      } catch {}
    } else if (type === 'bid_outbid' || type === 'auction_outbid') {
      try {
        const listingSnap = await db.collection('listings').doc(entityId).get();
        if (!listingSnap.exists) stale = true;
        else {
          const listing = listingSnap.data() as { status?: string } | undefined;
          const status = listing?.status;
          stale = !!status && LISTING_END_STATUSES.includes(status);
        }
      } catch {}
    }

    if (stale) toUpdate.push(doc.ref);
  }

  if (toUpdate.length === 0) return { updated: 0 };

  const now = FieldValue.serverTimestamp();
  await Promise.all(
    toUpdate.map((ref) =>
      ref.update({
        read: true,
        readAt: now,
        actionCompletedAt: now,
      })
    )
  );
  return { updated: toUpdate.length };
}
