/**
 * POST /api/admin/orders/[orderId]/compliance-transfer/remind
 * 
 * Admin-only endpoint to send compliance reminder to buyer or seller.
 * Triggers SendGrid email + in-app notification.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { isRegulatedWhitetailDeal, hasComplianceConfirmations } from '@/lib/compliance/whitetail';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { createAuditLog } from '@/lib/audit/logger';

const remindSchema = z.object({
  target: z.enum(['buyer', 'seller']),
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

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
    }

    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error: any) {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    // Verify admin
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    if (!userData?.isAdmin && !userData?.admin) {
      return json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const parsed = remindSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { target } = parsed.data;

    // Get order
    const orderRef = db.collection('orders').doc(params.orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderSnap.data() as any;

    // Verify this is a regulated deal
    if (!isRegulatedWhitetailDeal(orderData)) {
      return json({ error: 'This order does not require compliance confirmation' }, { status: 400 });
    }

    // Verify status is correct
    const txStatus = getEffectiveTransactionStatus(orderData);
    if (txStatus !== 'AWAITING_TRANSFER_COMPLIANCE') {
      return json({ error: 'Order is not awaiting compliance confirmation' }, { status: 400 });
    }

    // Determine target user
    const targetUserId = target === 'buyer' ? orderData.buyerId : orderData.sellerId;
    const orderUrl = target === 'buyer' 
      ? `${getSiteUrl()}/dashboard/orders/${params.orderId}`
      : `${getSiteUrl()}/seller/orders/${params.orderId}`;

    // Check current confirmations
    const confirmations = hasComplianceConfirmations(orderData);
    const paidAt = orderData.paidAt;
    const daysSincePayment = paidAt 
      ? Math.max(0, Math.floor((Date.now() - (paidAt.toDate ? paidAt.toDate().getTime() : new Date(paidAt).getTime())) / (1000 * 60 * 60 * 24)))
      : 0;

    // Emit reminder notification
    await emitAndProcessEventForUser({
      type: 'Order.TransferComplianceRequired', // Reuse the required event for reminders
      actorId: decodedToken.uid,
      entityType: 'order',
      entityId: params.orderId,
      targetUserId: targetUserId,
      payload: {
        type: 'Order.TransferComplianceRequired',
        orderId: params.orderId,
        listingId: orderData.listingId,
        listingTitle: orderData.listingTitle || orderData.listingSnapshot?.title || 'Listing',
        orderUrl,
      },
    });

    // Log audit
    await createAuditLog(db, {
      actorUid: decodedToken.uid,
      actorRole: 'admin',
      actionType: 'admin_note_added', // TODO: Add 'compliance_reminder_sent' to AuditActionType
      orderId: params.orderId,
      targetUserId: targetUserId,
      metadata: {
        target,
        daysSincePayment,
        buyerConfirmed: confirmations.buyerConfirmed,
        sellerConfirmed: confirmations.sellerConfirmed,
        note: `Compliance reminder sent to ${target}`,
      },
      source: 'admin_ui',
    });

    return json({
      success: true,
      target,
      message: `Compliance reminder sent to ${target}`,
    });
  } catch (error: any) {
    console.error('Error sending compliance reminder:', error);
    return json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
