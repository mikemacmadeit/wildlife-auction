/**
 * POST /api/orders/[orderId]/fulfillment/schedule-delivery
 *
 * SELLER_TRANSPORT: Seller proposes delivery windows (hauling) + optional hauler info.
 * Buyer must agree to a window via agree-delivery. Transitions: FULFILLMENT_REQUIRED → DELIVERY_PROPOSED.
 * Legacy: single `eta` still supported → DELIVERY_SCHEDULED (no agree step).
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { TransactionStatus } from '@/lib/types';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { sanitizeFirestorePayload } from '@/lib/firebase/sanitizeFirestore';
import { captureException } from '@/lib/monitoring/capture';
import { assertNoCorruptInt32 } from '@/lib/firebase/assertNoCorruptInt32';

const windowSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

const scheduleDeliverySchema = z.object({
  /** Legacy: single ETA. If provided without windows, goes straight to DELIVERY_SCHEDULED (no agree). */
  eta: z.string().datetime().optional(),
  /** Proposed delivery windows (hauling). Buyer agrees to one → DELIVERY_PROPOSED. */
  windows: z.array(windowSchema).min(1, 'At least one delivery window required').optional(),
  transporter: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      plate: z.string().optional(),
    })
    .optional(),
});

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(authHeader.split('Bearer ')[1]);
    } catch {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const sellerId = decodedToken.uid;
    const orderId = params.orderId;

    const body = await request.json();
    const validation = scheduleDeliverySchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { eta, windows, transporter } = validation.data;
    const useWindows = Array.isArray(windows) && windows.length > 0;

    if (!useWindows && !eta) {
      return json(
        { error: 'Provide either delivery windows or a single eta (legacy).' },
        { status: 400 }
      );
    }

    if (useWindows) {
      for (const w of windows!) {
        const start = new Date(w.start);
        const end = new Date(w.end);
        if (end <= start) {
          return json({ error: 'Invalid window', details: 'Window end must be after start' }, { status: 400 });
        }
      }
    }

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    if (orderData.sellerId !== sellerId) {
      return json({ error: 'Unauthorized - You can only update your own orders' }, { status: 403 });
    }

    const transportOption = orderData.transportOption || 'SELLER_TRANSPORT';
    if (transportOption !== 'SELLER_TRANSPORT') {
      return json(
        { error: 'Invalid transport option', details: 'This endpoint is for SELLER_TRANSPORT orders only.' },
        { status: 400 }
      );
    }

    const currentTxStatus = orderData.transactionStatus as TransactionStatus | undefined;
    const allowedStatuses: TransactionStatus[] = ['FULFILLMENT_REQUIRED', 'DELIVERY_PROPOSED', 'DELIVERY_SCHEDULED'];
    const legacyOk = ['paid', 'paid_held'].includes(String(orderData.status || ''));
    if (!currentTxStatus && !legacyOk) {
      return json(
        { error: 'Invalid status transition', details: `Cannot schedule delivery. Current status: ${currentTxStatus || orderData.status}` },
        { status: 400 }
      );
    }
    if (currentTxStatus && !allowedStatuses.includes(currentTxStatus)) {
      return json(
        { error: 'Invalid status transition', details: `Cannot schedule delivery. Current status: ${currentTxStatus}` },
        { status: 400 }
      );
    }

    const now = new Date();
    const windowsWithDates = useWindows
      ? windows!.map((w) => ({ start: new Date(w.start), end: new Date(w.end) }))
      : undefined;

    let transactionStatus: TransactionStatus;
    let deliveryPayload: Record<string, unknown>;

    if (useWindows) {
      transactionStatus = 'DELIVERY_PROPOSED';
      deliveryPayload = {
        ...(orderData.delivery || {}),
        windows: windowsWithDates,
        proposedAt: now,
        ...(transporter ? { transporter } : {}),
      };
    } else {
      transactionStatus = 'DELIVERY_SCHEDULED';
      const etaDate = new Date(eta!);
      deliveryPayload = {
        ...(orderData.delivery || {}),
        eta: etaDate,
        ...(transporter ? { transporter } : {}),
      };
    }

    const updateData: any = {
      transactionStatus,
      updatedAt: now,
      lastUpdatedByRole: 'seller',
      delivery: deliveryPayload,
    };

    const sanitized = sanitizeFirestorePayload(updateData);
    if (process.env.NODE_ENV !== 'production') {
      assertNoCorruptInt32(sanitized);
    }
    await orderRef.update(sanitized);

    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: useWindows ? `DELIVERY_PROPOSED:${orderId}` : `DELIVERY_SCHEDULED:${orderId}`,
          type: 'SELLER_PREPARING',
          label: useWindows ? 'Seller proposed delivery windows' : 'Seller scheduled delivery',
          actor: 'seller',
          visibility: 'buyer',
          timestamp: Timestamp.fromDate(now),
          meta: useWindows
            ? { windowsCount: windows!.length, transporter: transporter || null }
            : { eta: (deliveryPayload as any).eta?.toISOString?.() ?? null, transporter: transporter || null },
        },
      });
    } catch {
      /* best-effort */
    }

    try {
      const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = (listingDoc.data() as any)?.title || 'Your order';
      const ev = await emitAndProcessEventForUser({
        type: 'Order.DeliveryScheduled',
        actorId: sellerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: orderData.buyerId,
        payload: {
          type: 'Order.DeliveryScheduled',
          orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/dashboard/orders/${orderId}`,
          ...(useWindows
            ? { proposedWindows: windowsWithDates, message: 'Seller proposed delivery windows. Please agree to one.' }
            : { eta: (deliveryPayload as any).eta?.toISOString?.() }),
        },
        optionalHash: `delivery_${useWindows ? 'proposed' : 'scheduled'}:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.DeliveryScheduled',
            jobId: ev.eventId,
            orderId: params.orderId,
            endpoint: '/api/orders/[orderId]/fulfillment/schedule-delivery',
          });
        });
      }
    } catch (e) {
      console.error('Error emitting Order.DeliveryScheduled notification event:', e);
    }

    return json({
      success: true,
      orderId,
      transactionStatus,
      ...(useWindows ? { windows: windowsWithDates, message: 'Delivery windows proposed. Buyer will agree to one.' } : { eta: (deliveryPayload as any).eta?.toISOString?.(), message: 'Delivery scheduled successfully.' }),
    });
  } catch (error: any) {
    console.error('Error scheduling delivery:', error);
    return json({ error: 'Failed to schedule delivery', message: error.message }, { status: 500 });
  }
}
