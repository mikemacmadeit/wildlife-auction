/**
 * POST /api/admin/orders/[orderId]/mark-paid
 *
 * Admin-only: mark a bank/wire checkout as "paid_held" after Stripe confirms funds.
 * This is a fallback/ops action in case webhook delivery fails.
 */
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { createAuditLog } from '@/lib/audit/logger';

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
    if (!isStripeConfigured() || !stripe) {
      return json({ error: 'Stripe is not configured' }, { status: 503 });
    }

    // Rate limiting (admin)
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    const auth = getAdminAuth();
    const db = getAdminDb();

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await auth.verifyIdToken(token);
    const adminId = decoded.uid;

    // Verify admin role
    const adminDoc = await db.collection('users').doc(adminId).get();
    const role = adminDoc.exists ? (adminDoc.data() as any)?.role : null;
    if (!(role === 'admin' || role === 'super_admin')) {
      return json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const orderId = params.orderId;
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return json({ error: 'Order not found' }, { status: 404 });

    const order = orderSnap.data() as any;
    const currentStatus = String(order.status || '');
    if (!['awaiting_bank_transfer', 'awaiting_wire'].includes(currentStatus)) {
      return json({ error: `Order is not awaiting bank/wire payment (status: ${currentStatus})` }, { status: 400 });
    }

    const checkoutSessionId = order.stripeCheckoutSessionId as string | undefined;
    if (!checkoutSessionId) {
      return json({ error: 'Order missing stripeCheckoutSessionId' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    const paymentStatus = (session as any).payment_status || (session as any).paymentStatus;
    if (paymentStatus !== 'paid') {
      return json(
        {
          error: 'Stripe has not marked this checkout as paid yet',
          details: { paymentStatus },
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const disputeWindowHours = parseInt(process.env.ESCROW_DISPUTE_WINDOW_HOURS || '72', 10);
    const disputeDeadline = new Date(now.getTime() + disputeWindowHours * 60 * 60 * 1000);

    await orderRef.set(
      {
        status: 'paid_held',
        paidAt: now,
        disputeDeadlineAt: disputeDeadline,
        updatedAt: now,
        lastUpdatedByRole: 'admin',
      },
      { merge: true }
    );

    // Mark listing sold and clear reservation (best-effort)
    const listingId = order.listingId as string | undefined;
    if (listingId) {
      await db.collection('listings').doc(listingId).set(
        {
          status: 'sold',
          purchaseReservedByOrderId: null,
          purchaseReservedAt: null,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    await createAuditLog(db as any, {
      actorUid: adminId,
      actorRole: 'admin',
      actionType: 'order_marked_paid_admin',
      orderId,
      listingId: listingId,
      beforeState: { status: currentStatus },
      afterState: { status: 'paid_held', paidAt: now.toISOString() },
      metadata: { checkoutSessionId, paymentStatus },
      source: 'admin_ui',
    });

    return json({ success: true, orderId, status: 'paid_held', paidAt: now.toISOString() });
  } catch (error: any) {
    console.error('Error marking order paid:', error);
    return json({ error: 'Failed to mark order paid', message: error.message }, { status: 500 });
  }
}

