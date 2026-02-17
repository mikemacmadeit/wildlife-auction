/**
 * POST /api/delivery/submit-signature
 *
 * Public (buyerToken only). Accepts signature PNG as base64, uploads to Storage,
 * marks session and order as delivered.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { TransactionStatus } from '@/lib/types';
import { getAdminApp, getAdminDb } from '@/lib/firebase/admin';
import { verifyDeliveryToken } from '@/lib/delivery/tokens';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { enqueueReviewRequest } from '@/lib/reviews/reviewRequest';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { captureException } from '@/lib/monitoring/capture';
import { sanitizeFirestorePayload } from '@/lib/firebase/sanitizeFirestore';

function json(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

const MAX_BASE64_SIZE = 2 * 1024 * 1024; // 2MB PNG

export async function POST(request: Request) {
  try {
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, { status: rateLimitResult.status });
    }

    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token : null;
    const signaturePngBase64 = typeof body?.signaturePngBase64 === 'string' ? body.signaturePngBase64 : null;
    const deliveryPinRaw = typeof body?.deliveryPin === 'string' ? body.deliveryPin.replace(/\D/g, '') : '';
    const deliveryPin = deliveryPinRaw.length > 4 ? deliveryPinRaw.slice(0, 6) : deliveryPinRaw.slice(0, 4);

    if (!token || !signaturePngBase64) {
      return json({ error: 'token and signaturePngBase64 required' }, { status: 400 });
    }
    if (!deliveryPin || (deliveryPin.length !== 4 && deliveryPin.length !== 6)) {
      return json({ error: 'Valid 4-digit delivery PIN required' }, { status: 400 });
    }

    const payload = verifyDeliveryToken(token);
    if (!payload || payload.role !== 'buyer') {
      return json({ error: 'Invalid or expired buyer link' }, { status: 401 });
    }

    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
    const sessionRef = db.collection('deliverySessions').doc(payload.sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionDoc.data()!;
    if (session.status !== 'active') {
      if (session.status === 'delivered') {
        return json({ error: 'Already confirmed', alreadyDelivered: true }, { status: 400 });
      }
      return json({ error: 'Session no longer active' }, { status: 400 });
    }

    const expiresAt = session.expiresAt?.toDate?.() ?? new Date(session.expiresAt);
    if (expiresAt < new Date()) {
      return json({ error: 'Link expired' }, { status: 401 });
    }

    if (session.orderId !== payload.orderId) {
      return json({ error: 'Token mismatch' }, { status: 403 });
    }

    const sessionPin = (session.deliveryPin ?? '').toString().replace(/\D/g, '');
    if (sessionPin && sessionPin !== deliveryPin) {
      return json({ error: 'Invalid PIN. Ask the seller or driver for the correct delivery PIN.' }, { status: 401 });
    }

    let buffer: Buffer;
    try {
      const b64 = signaturePngBase64.replace(/^data:image\/png;base64,/, '');
      if (Buffer.byteLength(b64, 'base64') > MAX_BASE64_SIZE) {
        return json({ error: 'Signature image too large' }, { status: 400 });
      }
      buffer = Buffer.from(b64, 'base64');
    } catch {
      return json({ error: 'Invalid base64 signature' }, { status: 400 });
    }

    const docId = nanoid(16);
    const storagePath = `delivery-signatures/${payload.sessionId}/${docId}.png`;

    const hash = createHash('sha256').update(buffer).digest('hex');

    let signatureUrl: string;
    try {
      const bucket = getStorage(getAdminApp()).bucket();
      const file = bucket.file(storagePath);
      const uuidToken = nanoid(32);
      await file.save(buffer, {
        metadata: {
          contentType: 'image/png',
          metadata: {
            firebaseStorageDownloadTokens: uuidToken,
          },
        },
      });
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const bname = bucketName || (projectId ? `${projectId}.firebasestorage.app` : '');
      const encodedPath = encodeURIComponent(storagePath);
      signatureUrl = `https://firebasestorage.googleapis.com/v0/b/${bname}/o/${encodedPath}?alt=media&token=${uuidToken}`;
    } catch (uploadErr: any) {
      console.error('[submit-signature] Storage upload failed', uploadErr);
      return json({ error: 'Failed to save signature' }, { status: 500 });
    }

    const now = new Date();

    const sessionUpdate = sanitizeFirestorePayload({
      status: 'delivered',
      deliveredAt: Timestamp.fromDate(now),
      signature: {
        url: signatureUrl,
        storagePath,
        hash,
      },
    });
    await sessionRef.update(sessionUpdate);

    const orderRef = db.collection('orders').doc(payload.orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }
    const orderData = orderDoc.data()!;

    const orderUpdateBase: Record<string, unknown> = {
      transactionStatus: 'COMPLETED' as TransactionStatus,
      status: 'buyer_confirmed',
      deliveredAt: now,
      buyerConfirmedAt: now,
      acceptedAt: now,
      buyerAcceptedAt: now,
      completedAt: now,
      updatedAt: now,
      lastUpdatedByRole: 'buyer',
      'delivery.sessionId': payload.sessionId,
      'delivery.signatureUrl': signatureUrl,
      'delivery.confirmedAt': now,
      'delivery.confirmedMethod': 'qr_public',
      'delivery.deliveredAt': now,
      deliveryProofUrls: [signatureUrl],
      'delivery.proofUploads': [
        { type: 'DELIVERY_PROOF', url: signatureUrl, uploadedAt: now },
      ],
    };
    if (orderData.protectedTransactionDaysSnapshot && (!orderData.protectedDisputeStatus || orderData.protectedDisputeStatus === 'none')) {
      orderUpdateBase.status = 'ready_to_release';
      (orderUpdateBase as any).payoutHoldReason = 'none';
    }
    const orderUpdate = sanitizeFirestorePayload(orderUpdateBase);
    await orderRef.update(orderUpdate);

    // Enqueue review request for buyer (idempotent); dispatch email immediately when created.
    try {
      const reviewRes = await enqueueReviewRequest({ db: db as any, orderId: payload.orderId, order: orderData });
      if (reviewRes?.created && reviewRes?.eventId) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: reviewRes.eventId, waitForJob: true }).catch(() => {});
      }
    } catch {
      /* best-effort */
    }

    await orderRef.collection('documents').add({
      type: 'DELIVERY_PROOF',
      documentUrl: signatureUrl,
      status: 'uploaded',
      uploadedBy: 'qr_public',
      uploadedAt: Timestamp.fromDate(now),
      metadata: { deliverySessionId: payload.sessionId, method: 'qr_signature' },
    });

    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId: payload.orderId,
        event: {
          id: `QR_SIGNATURE:${payload.sessionId}`,
          type: 'SELLER_SHIPPED',
          label: 'Buyer confirmed delivery (QR signature)',
          actor: 'buyer',
          visibility: 'seller',
          timestamp: Timestamp.fromDate(now),
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
        type: 'Order.Delivered',
        actorId: orderData.buyerId,
        entityType: 'order',
        entityId: payload.orderId,
        targetUserId: orderData.sellerId,
        payload: {
          type: 'Order.Delivered',
          orderId: payload.orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/seller/orders/${payload.orderId}`,
        },
        optionalHash: `qr_delivered:${now.getTime()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.Delivered',
            jobId: ev.eventId,
            orderId: payload.orderId,
            endpoint: '/api/delivery/submit-signature',
          });
        });
      }
    } catch (e) {
      console.error('Error emitting Order.Delivered notification:', e);
    }

    try {
      const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = (listingDoc.data() as any)?.title || 'Your order';
      await emitAndProcessEventForUser({
        type: 'Order.ReceiptConfirmed',
        actorId: orderData.buyerId,
        entityType: 'order',
        entityId: payload.orderId,
        targetUserId: orderData.sellerId,
        payload: {
          type: 'Order.ReceiptConfirmed',
          orderId: payload.orderId,
          listingId: orderData.listingId,
          listingTitle,
          orderUrl: `${getSiteUrl()}/seller/orders/${payload.orderId}`,
        },
        optionalHash: `qr_receipt_confirmed:${now.getTime()}`,
      });
    } catch (e) {
      console.error('Error emitting Order.ReceiptConfirmed:', e);
    }

    return json({
      success: true,
      message: 'Delivery confirmed. Transaction complete.',
    });
  } catch (error: any) {
    if (error?.message?.includes('DELIVERY_TOKEN_SECRET')) {
      return json({ error: 'Server misconfigured' }, { status: 503 });
    }
    console.error('[submit-signature]', error);
    return json({ error: 'Failed to submit signature', message: error?.message }, { status: 500 });
  }
}
