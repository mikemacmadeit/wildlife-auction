/**
 * POST /api/orders/[orderId]/compliance-transfer/confirm
 * 
 * Confirms TPWD transfer permit compliance for regulated whitetail breeder buck transactions.
 * Both buyer and seller must confirm before fulfillment can proceed.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { isRegulatedWhitetailDeal, hasComplianceConfirmations } from '@/lib/compliance/whitetail';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { createAuditLog } from '@/lib/audit/logger';
import { sanitizeFirestorePayload } from '@/lib/firebase/sanitizeFirestore';
import { assertNoCorruptInt32 } from '@/lib/firebase/assertNoCorruptInt32';
import { getSiteUrl } from '@/lib/site-url';

const confirmSchema = z.object({
  role: z.enum(['buyer', 'seller']),
  confirmed: z.boolean(),
  uploadUrl: z.string().url().optional(),
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
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
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

    const userId = decodedToken.uid;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { role, confirmed, uploadUrl } = parsed.data;

    // Get order
    const orderRef = db.collection('orders').doc(params.orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderSnap.data() as any;

    // Verify user is buyer or seller
    if (role === 'buyer' && orderData.buyerId !== userId) {
      return json({ error: 'Unauthorized: not the buyer' }, { status: 403 });
    }
    if (role === 'seller' && orderData.sellerId !== userId) {
      return json({ error: 'Unauthorized: not the seller' }, { status: 403 });
    }

    // Verify this is a regulated deal
    if (!isRegulatedWhitetailDeal(orderData)) {
      return json({ error: 'This order does not require compliance confirmation' }, { status: 400 });
    }

    // Verify status is correct
    const txStatus = getEffectiveTransactionStatus(orderData);
    if (txStatus !== 'AWAITING_TRANSFER_COMPLIANCE') {
      return json({ error: 'Order is not awaiting compliance confirmation' }, { status: 400 });
    }

    // Check if already confirmed
    const currentConfirmations = hasComplianceConfirmations(orderData);
    if (role === 'buyer' && currentConfirmations.buyerConfirmed) {
      return json({ error: 'Buyer has already confirmed' }, { status: 400 });
    }
    if (role === 'seller' && currentConfirmations.sellerConfirmed) {
      return json({ error: 'Seller has already confirmed' }, { status: 400 });
    }

    // Update compliance confirmation
    const now = Timestamp.now();
    const updateData: any = {
      [`complianceTransfer.${role}Confirmed`]: confirmed,
      [`complianceTransfer.${role}ConfirmedAt`]: now,
      updatedAt: now,
      lastUpdatedByRole: role,
    };

    if (uploadUrl) {
      updateData[`complianceTransfer.${role}UploadUrl`] = uploadUrl;
    }

    // Check if both confirmations will be present after this update
    const willHaveBothConfirmations = 
      (role === 'buyer' ? confirmed : currentConfirmations.buyerConfirmed) &&
      (role === 'seller' ? confirmed : currentConfirmations.sellerConfirmed);

    if (willHaveBothConfirmations) {
      // Unlock fulfillment
      updateData.transactionStatus = 'FULFILLMENT_REQUIRED';
      updateData['complianceTransfer.unlockedAt'] = now;
    }

    // Sanitize payload before writing to prevent int32 serialization errors
    const sanitizedUpdateData = sanitizeFirestorePayload(updateData);
    if (process.env.NODE_ENV !== 'production') {
      assertNoCorruptInt32(sanitizedUpdateData);
    }
    await orderRef.update(sanitizedUpdateData);

    // Log audit
    await createAuditLog(db, {
      actorUid: userId,
      actorRole: role === 'buyer' ? 'buyer' : 'seller',
      actionType: 'admin_note_added', // TODO: Add 'compliance_transfer_confirmed' to AuditActionType
      orderId: params.orderId,
      metadata: {
        role,
        confirmed,
        hasUpload: !!uploadUrl,
        bothConfirmed: willHaveBothConfirmations,
        note: `${role} confirmed TPWD transfer compliance`,
      },
      source: role === 'buyer' ? 'buyer_ui' : 'seller_ui',
    });

    // Send notifications
    const listingTitle = orderData.listingTitle || orderData.listingSnapshot?.title || 'Listing';
    
    if (role === 'buyer') {
      // Notify seller that buyer confirmed
      await emitAndProcessEventForUser({
        type: 'Order.ComplianceBuyerConfirmed',
        actorId: userId,
        entityType: 'order',
        entityId: params.orderId,
        targetUserId: orderData.sellerId,
        payload: {
          type: 'Order.ComplianceBuyerConfirmed',
          orderId: params.orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/seller/orders/${params.orderId}`,
        },
      });
    } else {
      // Notify buyer that seller confirmed
      await emitAndProcessEventForUser({
        type: 'Order.ComplianceSellerConfirmed',
        actorId: userId,
        entityType: 'order',
        entityId: params.orderId,
        targetUserId: orderData.buyerId,
        payload: {
          type: 'Order.ComplianceSellerConfirmed',
          orderId: params.orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/dashboard/orders/${params.orderId}`,
        },
      });
    }

    if (willHaveBothConfirmations) {
      // Notify both parties that fulfillment is unlocked
      await Promise.all([
        emitAndProcessEventForUser({
          type: 'Order.ComplianceUnlocked',
          actorId: userId,
          entityType: 'order',
          entityId: params.orderId,
          targetUserId: orderData.buyerId,
          payload: {
            type: 'Order.ComplianceUnlocked',
            orderId: params.orderId,
            listingId: orderData.listingId,
            listingTitle,
            orderUrl: `${getSiteUrl()}/dashboard/orders/${params.orderId}`,
          },
        }),
        emitAndProcessEventForUser({
          type: 'Order.ComplianceUnlocked',
          actorId: userId,
          entityType: 'order',
          entityId: params.orderId,
          targetUserId: orderData.sellerId,
          payload: {
            type: 'Order.ComplianceUnlocked',
            orderId: params.orderId,
            listingId: orderData.listingId,
            listingTitle,
            orderUrl: `${getSiteUrl()}/seller/orders/${params.orderId}`,
          },
        }),
      ]);
    }

    return json({
      success: true,
      bothConfirmed: willHaveBothConfirmations,
      unlocked: willHaveBothConfirmations,
    });
  } catch (error: any) {
    console.error('Error confirming compliance:', error);
    return json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
