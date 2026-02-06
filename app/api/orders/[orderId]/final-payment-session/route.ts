/**
 * POST /api/orders/[orderId]/final-payment-session
 *
 * Buyer creates a Stripe Checkout Session for the final payment (balance due).
 * Allowed when order is OUT_FOR_DELIVERY (or DELIVERY_SCHEDULED) and final payment not yet confirmed.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { stripe, calculatePlatformFee, getAppUrl, isStripeConfigured } from '@/lib/stripe/config';
import { logWarn } from '@/lib/monitoring/logger';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(request: Request, { params }: { params: { orderId: string } }) {
  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter?.toString() },
      });
    }

    if (!isStripeConfigured() || !stripe) {
      return json({ error: 'Stripe is not configured' }, { status: 503 });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(authHeader.split('Bearer ')[1]!);
      uid = decoded.uid;
    } catch {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const orderId = params?.orderId?.trim();
    if (!orderId) {
      return json({ error: 'orderId required' }, { status: 400 });
    }

    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const order = orderSnap.data() as any;
    if (order.buyerId !== uid) {
      return json({ error: 'Only the buyer can create a final payment session' }, { status: 403 });
    }

    if (order.finalPaymentConfirmedAt) {
      return json({ error: 'Final payment already completed' }, { status: 400 });
    }

    const finalPaymentAmount = Number(order.finalPaymentAmount);
    if (!Number.isFinite(finalPaymentAmount) || finalPaymentAmount <= 0) {
      return json({ error: 'No balance due for this order' }, { status: 400 });
    }

    const txStatus = getEffectiveTransactionStatus(order);
    const allowedStatuses = ['OUT_FOR_DELIVERY', 'DELIVERY_SCHEDULED'];
    if (!allowedStatuses.includes(txStatus)) {
      return json(
        {
          error: 'Final payment is not available yet',
          details: `Order must be out for delivery or delivery scheduled. Current: ${txStatus}`,
        },
        { status: 400 }
      );
    }

    const sellerStripeAccountId = order.sellerStripeAccountId;
    if (!sellerStripeAccountId) {
      logWarn('Final payment: order missing sellerStripeAccountId', { orderId });
      return json({ error: 'Seller payment account not found' }, { status: 400 });
    }

    const amountCents = Math.round(finalPaymentAmount * 100);
    const platformFee = calculatePlatformFee(amountCents);
    const sellerAmount = amountCents - platformFee;
    const baseUrl = getAppUrl();
    const listingTitle = order.listingTitle || order.listingSnapshot?.title || 'Order';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Final payment – ${listingTitle}`,
              description: `Balance due for order (80% remaining).`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/dashboard/orders/${orderId}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/orders/${orderId}`,
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: { destination: sellerStripeAccountId },
        metadata: {
          orderId,
          buyerId: uid,
          sellerId: order.sellerId,
          transportOption: order.transportOption || 'SELLER_TRANSPORT',
          paymentType: 'final',
        },
      },
      metadata: {
        orderId,
        buyerId: uid,
        sellerId: order.sellerId,
        sellerStripeAccountId,
        listingTitle,
        sellerAmount: String(sellerAmount),
        platformFee: String(platformFee),
        paymentType: 'final',
      },
    });

    return json({ url: session.url });
  } catch (e: any) {
    console.error('[final-payment-session]', e);
    return json(
      { error: e?.message || 'Failed to create payment session' },
      { status: 500 }
    );
  }
}
