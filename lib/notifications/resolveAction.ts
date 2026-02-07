/**
 * Smart notifications: resolve action-required notifications when the user completes the action.
 *
 * Server-only (Firebase Admin). Call from API routes and webhooks when:
 * - Buyer agrees to delivery → resolve order_delivery_scheduled
 * - Buyer completes final payment → resolve order_final_payment_due
 * - Buyer pays for accepted offer → resolve offer_accepted
 * - (Optional) Auction winner → resolve bid_outbid for that listing
 *
 * Updates notification docs with read: true, readAt, actionCompletedAt so the UI
 * can remove them from "Needs action" / To do in real time (onSnapshot already streams updates).
 */

import type { Firestore } from 'firebase-admin/firestore';

export type ResolveActionType =
  | 'order_created' // New sale – seller must propose delivery
  | 'order_delivery_address_set' // Buyer set address – seller must propose delivery
  | 'order_delivery_scheduled'
  | 'order_final_payment_due'
  | 'offer_accepted'
  | 'offer_countered' // when user responds (accept/counter/decline)
  | 'bid_outbid';

export interface ResolveActionParams {
  type: ResolveActionType;
  entityId: string; // orderId, offerId, or listingId depending on type
}

/**
 * Resolve all action-required notifications for a user that match type + entityId.
 * Sets read: true, readAt, actionCompletedAt so the notification disappears from "Needs action"
 * and shows as completed in the feed (real-time via existing onSnapshot).
 */
export async function resolveActionNotifications(
  db: Firestore,
  userId: string,
  params: ResolveActionParams
): Promise<{ resolved: number }> {
  const { type, entityId } = params;
  if (!userId || !type || !entityId) return { resolved: 0 };

  try {
    const notificationsRef = db.collection('users').doc(userId).collection('notifications');
    const snap = await notificationsRef
      .where('type', '==', type)
      .where('entityId', '==', entityId)
      .limit(50)
      .get();

    if (snap.empty) return { resolved: 0 };

    const now = (await import('firebase-admin/firestore')).FieldValue.serverTimestamp();
    await Promise.all(
      snap.docs.map((d) =>
        d.ref.update({
          read: true,
          readAt: now,
          actionCompletedAt: now,
        })
      )
    );
    return { resolved: snap.size };
  } catch (e) {
    console.warn('[resolveActionNotifications]', { userId, type, entityId, error: String(e) });
    return { resolved: 0 };
  }
}
