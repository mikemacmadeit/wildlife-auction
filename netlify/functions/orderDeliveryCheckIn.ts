/**
 * Netlify Scheduled Function: Order Delivery Check-In
 *
 * Runs daily and emits Order.DeliveryCheckIn events after N days post delivery confirmation.
 * Deduped per order per user via deterministic eventId.
 */

import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { emitEventForUser } from '../../lib/notifications/emitEvent';
import { getSiteUrl } from '../../lib/site-url';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';

const DEFAULT_DAYS = 3;
const MAX_ORDERS_PER_RUN = 200;

const baseHandler: Handler = async () => {
  const db = getAdminDb();
  const days = Number(process.env.DELIVERY_CHECKIN_DAYS || DEFAULT_DAYS);
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const cutoffTs = Timestamp.fromDate(cutoff);

  let scanned = 0;
  let emitted = 0;

  try {
    const snap = await db
      .collection('orders')
      .where('deliveryConfirmedAt', '<=', cutoffTs)
      .limit(MAX_ORDERS_PER_RUN)
      .get();

    scanned = snap.size;
    if (snap.empty) return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, emitted }) };

    for (const d of snap.docs) {
      const orderId = d.id;
      const order = d.data() as any;
      const buyerId = typeof order.buyerId === 'string' ? order.buyerId : null;
      const listingId = typeof order.listingId === 'string' ? order.listingId : null;
      if (!buyerId || !listingId) continue;

      const deliveryConfirmedAt = order.deliveryConfirmedAt?.toDate?.() as Date | undefined;
      if (!deliveryConfirmedAt) continue;

      const daysSince = Math.floor((now.getTime() - deliveryConfirmedAt.getTime()) / (24 * 60 * 60 * 1000));
      if (daysSince < days) continue;

      // Fetch listing title (best-effort)
      let listingTitle = 'your order';
      try {
        const listingDoc = await db.collection('listings').doc(listingId).get();
        listingTitle = String((listingDoc.data() as any)?.title || listingTitle);
      } catch (e: any) {
        logWarn('orderDeliveryCheckIn: failed to load listing title', { orderId, listingId, error: String(e?.message || e) });
      }

      // Phase 2F: deep-link into the buyer "delivery check-in" reassurance flow.
      const orderUrl = `${getSiteUrl()}/dashboard/orders/${orderId}?checkin=1`;

      const res = await emitEventForUser({
        type: 'Order.DeliveryCheckIn',
        actorId: null,
        entityType: 'order',
        entityId: orderId,
        targetUserId: buyerId,
        payload: {
          type: 'Order.DeliveryCheckIn',
          orderId,
          listingId,
          listingTitle,
          orderUrl,
          daysSinceDelivery: daysSince,
        },
        optionalHash: `days:${days}`,
      });
      if (res.ok && res.created) emitted++;
    }

    logInfo('orderDeliveryCheckIn: completed', { scanned, emitted, days });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, emitted, days }) };
  } catch (e: any) {
    logError('orderDeliveryCheckIn: fatal error', e, { scanned, emitted });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || 'Unknown error' }) };
  }
};

// Run daily at 14:00 UTC (~8am America/Chicago depending on DST)
export const handler = schedule('0 14 * * *', baseHandler);

