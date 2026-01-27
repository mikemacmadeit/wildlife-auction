/**
 * POST /api/orders/[orderId]/set-delivery-address
 *
 * Buyer sets delivery address (or dropped pin) after payment.
 * This is the first fulfillment step: seller uses this address to propose delivery dates.
 * Buyer-only; SELLER_TRANSPORT orders only.
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
import { captureException } from '@/lib/monitoring/capture';
import { sanitizeFirestorePayload } from '@/lib/firebase/sanitizeFirestore';

const setDeliveryAddressSchema = z.object({
  line1: z.string().min(1, 'Street address is required').max(200),
  line2: z.string().max(100).optional(),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(50),
  zip: z.string().min(1, 'ZIP is required').max(20),
  deliveryInstructions: z.string().max(500).optional(),
  lat: z.number().finite().optional(),
  lng: z.number().finite().optional(),
  pinLabel: z.string().max(100).optional(),
});

function json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
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

    const buyerId = decodedToken.uid;
    const orderId = params.orderId;

    const body = await request.json().catch(() => ({}));
    const validation = setDeliveryAddressSchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { line1, line2, city, state, zip, deliveryInstructions, lat, lng, pinLabel } = validation.data;

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    if (orderData.buyerId !== buyerId) {
      return json({ error: 'Unauthorized - You can only set delivery address for your own orders' }, { status: 403 });
    }

    const transportOption = orderData.transportOption || 'SELLER_TRANSPORT';
    if (transportOption !== 'SELLER_TRANSPORT') {
      return json(
        { error: 'Invalid transport option', details: 'This endpoint is for seller-delivery orders only.' },
        { status: 400 }
      );
    }

    const currentTxStatus = (orderData.transactionStatus as TransactionStatus) || '';
    const allowedStatuses: TransactionStatus[] = ['FULFILLMENT_REQUIRED', 'AWAITING_TRANSFER_COMPLIANCE'];
    const legacyOk = ['paid', 'paid_held'].includes(String(orderData.status || ''));
    const ok =
      (currentTxStatus && allowedStatuses.includes(currentTxStatus)) ||
      (!currentTxStatus && legacyOk && orderData.paidAt);
    if (!ok) {
      return json(
        {
          error: 'Cannot set address now',
          details: 'Delivery address can be set after payment, before the seller proposes delivery.',
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const buyerAddress = {
      line1,
      ...(line2 && line2.trim() ? { line2: line2.trim() } : {}),
      city: city.trim(),
      state: state.trim(),
      zip: zip.trim(),
      ...(deliveryInstructions && deliveryInstructions.trim() ? { deliveryInstructions: deliveryInstructions.trim() } : {}),
      ...(typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : {}),
      ...(pinLabel && pinLabel.trim() ? { pinLabel: pinLabel.trim() } : {}),
    };

    const deliveryPayload = {
      ...(orderData.delivery || {}),
      buyerAddress,
      buyerAddressSetAt: now,
    };

    const updateData = {
      updatedAt: now,
      lastUpdatedByRole: 'buyer' as const,
      delivery: sanitizeFirestorePayload(deliveryPayload),
    };

    await orderRef.update(updateData);

    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `DELIVERY_ADDRESS:${orderId}`,
          type: 'DELIVERY_ADDRESS_SET',
          label: 'Buyer set delivery address',
          actor: 'buyer',
          visibility: 'seller',
          timestamp: Timestamp.fromDate(now),
        },
      });
    } catch (_e) {
      // best-effort
    }

    const sellerId = orderData.sellerId;
    const listingTitle = String((orderData.listingSnapshot as any)?.title || orderData.listingTitle || 'Order').trim();
    try {
      const ev = await emitAndProcessEventForUser({
        type: 'Order.DeliveryAddressSet',
        actorId: buyerId,
        entityType: 'order',
        entityId: orderId,
        targetUserId: sellerId,
        payload: {
          type: 'Order.DeliveryAddressSet',
          orderId,
          listingId: orderData.listingId,
          listingTitle: listingTitle || 'Order',
          orderUrl: `${getSiteUrl()}/seller/orders/${orderId}`,
        },
        optionalHash: `delivery-address:${now.toISOString()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.DeliveryAddressSet',
            orderId,
          });
        });
      }
    } catch (e) {
      captureException(e instanceof Error ? e : new Error(String(e)), { orderId, context: 'Order.DeliveryAddressSet' });
    }

    return json({
      success: true,
      orderId,
      message: 'Delivery address saved. The seller will use this to propose a delivery date.',
    });
  } catch (error: any) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/orders/[orderId]/set-delivery-address',
      orderId: params.orderId,
    });
    return json(
      { error: 'Failed to save delivery address', message: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
