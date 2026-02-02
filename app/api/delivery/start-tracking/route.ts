/**
 * POST /api/delivery/start-tracking
 *
 * Public (driverToken only). Enables tracking for the delivery session.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { TransactionStatus } from '@/lib/types';
import { getAdminDb, getAdminDatabase } from '@/lib/firebase/admin';
import { verifyDeliveryToken } from '@/lib/delivery/tokens';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { captureException } from '@/lib/monitoring/capture';

function json(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request) {
  try {
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, { status: rateLimitResult.status });
    }

    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token : null;
    if (!token) {
      return json({ error: 'token required' }, { status: 400 });
    }

    const payload = verifyDeliveryToken(token);
    if (!payload || payload.role !== 'driver') {
      return json({ error: 'Invalid or expired driver token' }, { status: 401 });
    }

    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
    const sessionRef = db.collection('deliverySessions').doc(payload.sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionDoc.data()!;
    if (session.status !== 'active') {
      return json({ error: 'Session no longer active' }, { status: 400 });
    }

    const tracking = (session.tracking as { enabled?: boolean }) || {};
    if (tracking.enabled) {
      return json({ success: true, alreadyEnabled: true });
    }

    const now = Timestamp.now();
    await sessionRef.update({
      'tracking.enabled': true,
      'tracking.startedAt': now,
      'tracking.pingsCount': 0,
    });

    const orderRef = db.collection('orders').doc(payload.orderId);
    const orderDoc = await orderRef.get();
    if (orderDoc.exists) {
      const orderData = orderDoc.data()!;
      const updateData: Record<string, unknown> = {
        transactionStatus: 'OUT_FOR_DELIVERY' as TransactionStatus,
        updatedAt: new Date(),
        lastUpdatedByRole: 'seller',
        inTransitAt: now,
        deliveryTracking: {
          enabled: true,
          driverUid: null,
          startedAt: now,
          endedAt: null,
          lastLocationAt: null,
        },
      };
      await orderRef.update(updateData);

      const rtdb = getAdminDatabase();
      if (rtdb && orderData.buyerId && orderData.sellerId) {
        await rtdb.ref(`trackingAccess/${payload.orderId}`).set({
          buyerUid: orderData.buyerId,
          sellerUid: orderData.sellerId,
          driverUid: null,
          enabled: true,
        });
      }

      try {
        await appendOrderTimelineEvent({
          db: db as any,
          orderId: payload.orderId,
          event: {
            id: `DELIVERY_TRACKING_STARTED:${payload.sessionId}`,
            type: 'SELLER_SHIPPED',
            label: 'Driver started delivery tracking',
            actor: 'seller',
            visibility: 'buyer',
            timestamp: now,
            meta: { sessionId: payload.sessionId },
          },
        });
      } catch {
        /* best-effort */
      }

      try {
        const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
        const listingTitle = (listingDoc.data() as any)?.title || 'Your order';
        const ev = await emitAndProcessEventForUser({
          type: 'Order.DeliveryTrackingStarted',
          actorId: orderData.sellerId,
          entityType: 'order',
          entityId: payload.orderId,
          targetUserId: orderData.buyerId,
          payload: {
            type: 'Order.DeliveryTrackingStarted',
            orderId: payload.orderId,
            listingId: orderData.listingId,
            listingTitle,
            orderUrl: `${getSiteUrl()}/dashboard/orders/${payload.orderId}`,
          },
          optionalHash: `delivery_tracking_started:${now.toMillis()}`,
        });
        if (ev?.ok && ev.created) {
          void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
            captureException(err instanceof Error ? err : new Error(String(err)), {
              context: 'email-dispatch',
              eventType: 'Order.DeliveryTrackingStarted',
              jobId: ev.eventId,
              orderId: payload.orderId,
              endpoint: '/api/delivery/start-tracking',
            });
          });
        }
      } catch (e) {
        console.error('Error emitting Order.DeliveryTrackingStarted:', e);
      }
    }

    return json({ success: true, tracking: { enabled: true } });
  } catch (error: any) {
    if (error?.message?.includes('DELIVERY_TOKEN_SECRET')) {
      return json({ error: 'Server misconfigured' }, { status: 503 });
    }
    console.error('[start-tracking]', error);
    return json({ error: 'Failed to start tracking' }, { status: 500 });
  }
}
