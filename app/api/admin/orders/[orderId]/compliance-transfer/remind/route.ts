/**
 * POST /api/admin/orders/[orderId]/compliance-transfer/remind
 * 
 * Admin-only endpoint to send compliance reminder to buyer or seller.
 * Triggers SendGrid email + in-app notification.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { requireAdmin, json } from '@/app/api/admin/_util';
import { z } from 'zod';
import { isRegulatedWhitetailDeal, hasComplianceConfirmations } from '@/lib/compliance/whitetail';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { createAuditLog } from '@/lib/audit/logger';

const remindSchema = z.object({
  target: z.enum(['buyer', 'seller']),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> | { orderId: string } }
) {
  try {
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

    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;
    const { ctx: adminCtx } = admin;
    const db = adminCtx.db as unknown as ReturnType<typeof getFirestore>;
    const actorUid = adminCtx.actorUid;

    const params = typeof (ctx.params as any)?.then === 'function' ? await (ctx.params as Promise<{ orderId: string }>) : (ctx.params as { orderId: string });
    const orderId = params.orderId;

    const body = await request.json().catch(() => ({}));
    const parsed = remindSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { target } = parsed.data;

    const orderRef = db.collection('orders').doc(orderId);
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
      ? `${getSiteUrl()}/dashboard/orders/${orderId}`
      : `${getSiteUrl()}/seller/orders/${orderId}`;

    // Check current confirmations
    const confirmations = hasComplianceConfirmations(orderData);
    const paidAt = orderData.paidAt;
    const daysSincePayment = paidAt 
      ? Math.max(0, Math.floor((Date.now() - (paidAt.toDate ? paidAt.toDate().getTime() : new Date(paidAt).getTime())) / (1000 * 60 * 60 * 24)))
      : 0;

    // Emit reminder notification
    await emitAndProcessEventForUser({
      type: 'Order.TransferComplianceRequired',
      actorId: actorUid,
      entityType: 'order',
      entityId: orderId,
      targetUserId: targetUserId,
      payload: {
        type: 'Order.TransferComplianceRequired',
        orderId,
        listingId: orderData.listingId,
        listingTitle: orderData.listingTitle || orderData.listingSnapshot?.title || 'Listing',
        orderUrl,
      },
    });

    // Log audit
    await createAuditLog(db, {
      actorUid,
      actorRole: 'admin',
      actionType: 'compliance_reminder_sent',
      orderId,
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
