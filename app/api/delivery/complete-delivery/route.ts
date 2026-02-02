/**
 * POST /api/delivery/complete-delivery
 *
 * Public (driver token only). Driver completes delivery on their device:
 * - Recipient verifies PIN (driver confirms)
 * - Photo of animals (optional)
 * - Recipient signs on driver's phone
 *
 * All attachments go to the seller's order.
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

const MAX_BASE64_SIZE = 3 * 1024 * 1024; // 3MB per image

async function uploadBase64Image(
  base64: string,
  pathPrefix: string,
  contentType: string = 'image/png'
): Promise<string> {
  const b64 = base64.replace(/^data:image\/\w+;base64,/, '');
  if (Buffer.byteLength(b64, 'base64') > MAX_BASE64_SIZE) {
    throw new Error('Image too large');
  }
  const buffer = Buffer.from(b64, 'base64');
  const ext = contentType === 'image/jpeg' ? '.jpg' : '.png';
  const storagePath = `${pathPrefix}/${nanoid(16)}${ext}`;

  const bucket = getStorage(getAdminApp()).bucket();
  const file = bucket.file(storagePath);
  const uuidToken = nanoid(32);
  await file.save(buffer, {
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: uuidToken },
    },
  });

  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const bname = bucketName || (projectId ? `${projectId}.firebasestorage.app` : '');
  return `https://firebasestorage.googleapis.com/v0/b/${bname}/o/${encodeURIComponent(storagePath)}?alt=media&token=${uuidToken}`;
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
    const signaturePngBase64 = typeof body?.signaturePngBase64 === 'string' ? body.signaturePngBase64 : null;
    const deliveryPinRaw = typeof body?.deliveryPin === 'string' ? body.deliveryPin.replace(/\D/g, '') : '';
    const deliveryPin = deliveryPinRaw.length > 4 ? deliveryPinRaw.slice(0, 6) : deliveryPinRaw.slice(0, 4);
    const photoBase64 = typeof body?.photoBase64 === 'string' ? body.photoBase64 : null;

    if (!token || !signaturePngBase64) {
      return json({ error: 'token and signaturePngBase64 required' }, { status: 400 });
    }
    if (!deliveryPin || (deliveryPin.length !== 4 && deliveryPin.length !== 6)) {
      return json({ error: 'Valid 4-digit delivery PIN required. Recipient must confirm PIN to prove they are authorized.' }, { status: 400 });
    }

    const payload = verifyDeliveryToken(token);
    if (!payload || payload.role !== 'driver') {
      return json({ error: 'Invalid or expired driver link' }, { status: 401 });
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
      return json({ error: 'Invalid PIN. Recipient must enter the correct PIN to confirm they are authorized to receive the delivery.' }, { status: 401 });
    }

    const now = new Date();
    const pathPrefix = `delivery-complete/${payload.sessionId}`;

    // Upload signature
    const sigB64 = signaturePngBase64.replace(/^data:image\/png;base64,/, '');
    if (Buffer.byteLength(sigB64, 'base64') > MAX_BASE64_SIZE) {
      return json({ error: 'Signature image too large' }, { status: 400 });
    }
    const signatureBuffer = Buffer.from(sigB64, 'base64');
    const signatureUrl = await uploadBase64Image(
      signaturePngBase64,
      `${pathPrefix}/signature`,
      'image/png'
    );

    // Upload photo if provided
    let photoUrl: string | null = null;
    if (photoBase64 && photoBase64.trim()) {
      try {
        const isJpeg = /^data:image\/jpe?g;base64,/.test(photoBase64);
        photoUrl = await uploadBase64Image(
          photoBase64,
          `${pathPrefix}/photo`,
          isJpeg ? 'image/jpeg' : 'image/png'
        );
      } catch (e: any) {
        console.error('[complete-delivery] Photo upload failed', e);
        return json({ error: 'Failed to upload photo' }, { status: 400 });
      }
    }

    const sessionUpdate = sanitizeFirestorePayload({
      status: 'delivered',
      deliveredAt: Timestamp.fromDate(now),
      signature: {
        url: signatureUrl,
        storagePath: `${pathPrefix}/signature`,
        hash: createHash('sha256').update(signatureBuffer).digest('hex'),
      },
      ...(photoUrl ? { deliveryPhotoUrl: photoUrl } : {}),
    });
    await sessionRef.update(sessionUpdate);

    const orderRef = db.collection('orders').doc(payload.orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }
    const orderData = orderDoc.data()!;

    const proofUrls = [signatureUrl];
    if (photoUrl) proofUrls.push(photoUrl);

    const orderUpdateBase: Record<string, unknown> = {
      transactionStatus: 'COMPLETED' as TransactionStatus,
      status: 'buyer_confirmed',
      deliveredAt: now,
      buyerConfirmedAt: now,
      acceptedAt: now,
      buyerAcceptedAt: now,
      updatedAt: now,
      lastUpdatedByRole: 'buyer',
      'delivery.sessionId': payload.sessionId,
      'delivery.signatureUrl': signatureUrl,
      'delivery.confirmedAt': now,
      'delivery.confirmedMethod': 'qr_public',
      'delivery.deliveredAt': now,
      ...(photoUrl ? { 'delivery.deliveryPhotoUrl': photoUrl } : {}),
      deliveryProofUrls: proofUrls,
      'delivery.proofUploads': [
        { type: 'DELIVERY_PROOF', url: signatureUrl, uploadedAt: now },
        ...(photoUrl ? [{ type: 'DELIVERY_PROOF', url: photoUrl, uploadedAt: now }] : []),
      ],
    };
    if (orderData.protectedTransactionDaysSnapshot && (!orderData.protectedDisputeStatus || orderData.protectedDisputeStatus === 'none')) {
      orderUpdateBase.status = 'ready_to_release';
      (orderUpdateBase as any).payoutHoldReason = 'none';
    }
    const orderUpdate = sanitizeFirestorePayload(orderUpdateBase);
    await orderRef.update(orderUpdate);

    for (const url of proofUrls) {
      await orderRef.collection('documents').add({
        type: 'DELIVERY_PROOF',
        documentUrl: url,
        status: 'uploaded',
        uploadedBy: 'qr_public',
        uploadedAt: Timestamp.fromDate(now),
        metadata: { deliverySessionId: payload.sessionId, method: 'driver_complete' },
      });
    }

    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId: payload.orderId,
        event: {
          id: `DRIVER_COMPLETE:${payload.sessionId}`,
          type: 'SELLER_SHIPPED',
          label: 'Recipient signed for delivery (on driver device)',
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
        optionalHash: `driver_complete:${now.getTime()}`,
      });
      if (ev?.ok && ev.created) {
        void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
          captureException(err instanceof Error ? err : new Error(String(err)), {
            context: 'email-dispatch',
            eventType: 'Order.Delivered',
            jobId: ev.eventId,
            orderId: payload.orderId,
            endpoint: '/api/delivery/complete-delivery',
          });
        });
      }
    } catch (e) {
      console.error('Error emitting Order.Delivered notification:', e);
    }

    try {
      const listingSnap = await db.collection('listings').doc(orderData.listingId).get();
      const listingTitle = (listingSnap.data() as any)?.title || 'Your order';
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
        optionalHash: `driver_complete_receipt:${now.getTime()}`,
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
    console.error('[complete-delivery]', error);
    return json({ error: 'Failed to complete delivery', message: error?.message }, { status: 500 });
  }
}
