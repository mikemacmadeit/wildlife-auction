/**
 * POST /api/delivery/create-session
 *
 * Auth required (seller only). Creates a Delivery Session for an order when
 * buyer has confirmed delivery date (DELIVERY_SCHEDULED).
 *
 * Returns sessionId, driverLink, buyerConfirmLink, qrValue.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { nanoid } from 'nanoid';
import { checkRateLimitByKey, RATE_LIMITS } from '@/lib/rate-limit';
import { TransactionStatus } from '@/lib/types';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { signDeliveryToken } from '@/lib/delivery/tokens';
import { getSiteUrl } from '@/lib/site-url';
import { sanitizeFirestorePayload } from '@/lib/firebase/sanitizeFirestore';

const bodySchema = { orderId: { type: 'string' } };

function json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
}

export async function POST(request: Request) {
  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken: { uid: string };
    try {
      decodedToken = await auth.verifyIdToken(authHeader.split('Bearer ')[1]!);
    } catch {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const sellerUid = decodedToken.uid;

    // Rate limit per user so opening the delivery checklist isn't blocked by shared IP or other API traffic.
    const rlKey = `delivery_session:${sellerUid}`;
    const rl = await checkRateLimitByKey(rlKey, RATE_LIMITS.deliveryCreateSession);
    if (!rl.allowed) {
      const headers: Record<string, string> = {};
      if (rl.retryAfter) headers['Retry-After'] = String(rl.retryAfter);
      return json(
        { error: 'Too many requests. Please wait a moment and try again.', retryAfter: rl.retryAfter },
        { status: rl.status ?? 429, headers }
      );
    }

    const body = await request.json().catch(() => ({}));
    const orderId = typeof body?.orderId === 'string' ? body.orderId : null;
    if (!orderId) {
      return json({ error: 'orderId required' }, { status: 400 });
    }

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    if (orderData.sellerId !== sellerUid) {
      return json({ error: 'Only the seller can create a delivery session' }, { status: 403 });
    }

    const txStatus = getEffectiveTransactionStatus(orderData as any) as TransactionStatus;
    const transportOption = orderData.transportOption || 'SELLER_TRANSPORT';
    if (transportOption !== 'SELLER_TRANSPORT') {
      return json({ error: 'Invalid transport', details: 'SELLER_TRANSPORT only' }, { status: 400 });
    }

    const allowedStatusesForSession: TransactionStatus[] = ['DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 'DELIVERED_PENDING_CONFIRMATION'];
    if (!allowedStatusesForSession.includes(txStatus)) {
      return json(
        {
          error: 'Invalid status',
          details: `Order must have delivery scheduled (buyer confirmed date). Current: ${txStatus}`,
        },
        { status: 400 }
      );
    }

    const hasFinalPaymentDue = typeof orderData.finalPaymentAmount === 'number' && orderData.finalPaymentAmount > 0;
    const finalPaymentConfirmed = !!orderData.finalPaymentConfirmedAt;
    const paymentPending = hasFinalPaymentDue && !finalPaymentConfirmed;

    // Check for existing session (active or delivered) — return it so QR/links stay visible
    const existing = await db
      .collection('deliverySessions')
      .where('orderId', '==', orderId)
      .limit(1)
      .get();

    if (!existing.empty) {
      const existingDoc = existing.docs[0]!;
      const data = existingDoc.data()!;
      let pin = data.deliveryPin;
      if (!pin) {
        pin = String(Math.floor(1000 + Math.random() * 9000));
        await existingDoc.ref.update({ deliveryPin: pin, updatedAt: Timestamp.now() });
      }
      const driverToken = signDeliveryToken({
        sessionId: existingDoc.id,
        orderId,
        role: 'driver',
      });
      const buyerToken = signDeliveryToken({
        sessionId: existingDoc.id,
        orderId,
        role: 'buyer',
      });
      const baseUrl = getSiteUrl();
      const payload: Record<string, unknown> = {
        success: true,
        sessionId: existingDoc.id,
        driverLink: `${baseUrl}/delivery/driver?token=${encodeURIComponent(driverToken)}`,
        expiresAt: (data.expiresAt as any)?.toDate?.()?.toISOString?.(),
        finalPaymentPending: paymentPending,
      };
      if (!paymentPending) {
        payload.buyerConfirmLink = `${baseUrl}/delivery/confirm?token=${encodeURIComponent(buyerToken)}`;
        payload.qrValue = `${baseUrl}/delivery/confirm?token=${encodeURIComponent(buyerToken)}`;
        payload.deliveryPin = pin;
      }
      return json(payload);
    }

    // Create new session — only when delivery is scheduled or out
    if (txStatus !== 'DELIVERY_SCHEDULED' && txStatus !== 'OUT_FOR_DELIVERY') {
      return json(
        { error: 'No delivery session found. Create one when delivery is scheduled.' },
        { status: 404 }
      );
    }

    const sessionId = nanoid(24);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const deliveryPin = String(Math.floor(1000 + Math.random() * 9000));

    const sessionData = {
      orderId,
      sellerUid,
      buyerUid: orderData.buyerId || null,
      status: 'active' as const,
      deliveryPin,
      createdAt: Timestamp.fromDate(now),
      expiresAt: Timestamp.fromDate(expiresAt),
      oneTimeSignature: true,
      driver: { assignedBySeller: true },
      tracking: { enabled: false, pingsCount: 0 },
    };

    const sanitized = sanitizeFirestorePayload(sessionData);
    await db.collection('deliverySessions').doc(sessionId).set(sanitized);

    // Store sessionId on order delivery (for reference)
    await orderRef.update({
      updatedAt: now,
      'delivery.sessionId': sessionId,
    });

    const driverToken = signDeliveryToken({ sessionId, orderId, role: 'driver' });
    const buyerToken = signDeliveryToken({ sessionId, orderId, role: 'buyer' });
    const baseUrl = getSiteUrl();

    const payload: Record<string, unknown> = {
      success: true,
      sessionId,
      driverLink: `${baseUrl}/delivery/driver?token=${encodeURIComponent(driverToken)}`,
      expiresAt: expiresAt.toISOString(),
      finalPaymentPending: paymentPending,
    };
    if (!paymentPending) {
      payload.buyerConfirmLink = `${baseUrl}/delivery/confirm?token=${encodeURIComponent(buyerToken)}`;
      payload.qrValue = `${baseUrl}/delivery/confirm?token=${encodeURIComponent(buyerToken)}`;
      payload.deliveryPin = deliveryPin;
    }
    return json(payload);
  } catch (error: any) {
    if (error?.message?.includes('DELIVERY_TOKEN_SECRET')) {
      return json({ error: 'Server misconfigured' }, { status: 503 });
    }
    console.error('[create-session]', error);
    return json({ error: 'Failed to create session' }, { status: 500 });
  }
}
