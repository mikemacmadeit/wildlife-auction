/**
 * POST /api/orders/[orderId]/bill-of-sale/generate-with-signature
 *
 * Generates a Bill of Sale PDF that includes the buyer's delivery signature.
 * Seller-only. Order must be in a completed/delivered state with delivery.signatureUrl.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import type { BillOfSaleParty, BillOfSaleData, BillOfSaleHorse } from '@/lib/orders/billOfSale';
import {
  validateBillOfSaleInputs,
  renderBillOfSalePdfBuffer,
  uploadPdfToFirebaseStorage,
  getBillOfSaleSignedStoragePath,
  BILL_OF_SALE_DOC_ID,
  BILL_OF_SALE_VERSION,
} from '@/lib/orders/billOfSale';
import type { ListingCategory } from '@/lib/types';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function clean(s: any): string {
  return String(s ?? '').trim();
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> | { orderId: string } }
) {
  const params = typeof (ctx.params as any)?.then === 'function' ? await (ctx.params as Promise<{ orderId: string }>) : (ctx.params as { orderId: string });
  const orderId = String(params?.orderId ?? '').trim();
  if (!orderId) return json({ error: 'Missing orderId' }, { status: 400 });

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json({ error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, { status: 401 });
  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ error: 'Unauthorized' }, { status: 401 });

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) return json({ error: 'Order not found' }, { status: 404 });
  const orderData = orderSnap.data() as any;

  if (String(orderData?.sellerId ?? '') !== uid) return json({ error: 'Forbidden' }, { status: 403 });

  const delivery = orderData?.delivery ?? {};
  const signatureUrl = delivery.signatureUrl;
  if (!signatureUrl || typeof signatureUrl !== 'string') {
    return json({ error: 'No delivery signature on this order', message: 'Recipient must sign for delivery before generating a Bill of Sale.' }, { status: 400 });
  }

  const status = String(orderData?.status ?? '');
  const completedStatuses = ['buyer_confirmed', 'ready_to_release', 'completed'];
  if (!completedStatuses.includes(status)) {
    return json({ error: 'Order not complete', message: 'Generate Bill of Sale only after delivery is confirmed.' }, { status: 400 });
  }

  const listingId = String(orderData?.listingId ?? '');
  const listingRef = db.collection('listings').doc(listingId);
  const listingSnap = await listingRef.get();
  const listingData = listingSnap.exists ? (listingSnap.data() as any) : null;
  const listingTitle = clean(listingData?.title ?? orderData?.listingTitle ?? orderData?.listingSnapshot?.title) || 'Listing';
  const listingCategory = (listingData?.category ?? orderData?.listingSnapshot?.category ?? 'other') as ListingCategory;

  const buyerId = String(orderData?.buyerId ?? '');
  const sellerId = String(orderData?.sellerId ?? '');
  const [buyerSnap, sellerSnap] = await Promise.all([
    db.collection('users').doc(buyerId).get(),
    db.collection('users').doc(sellerId).get(),
  ]);
  const buyerProfile = buyerSnap.exists ? ((buyerSnap.data() as any)?.profile ?? {}) : {};
  const sellerProfile = sellerSnap.exists ? ((sellerSnap.data() as any)?.profile ?? {}) : {};
  const buyerLoc = buyerProfile?.location ?? {};
  const sellerLoc = sellerProfile?.location ?? {};

  const buyer: BillOfSaleParty = {
    uid: buyerId,
    fullName: clean(buyerProfile?.displayName ?? buyerProfile?.name ?? 'Buyer'),
    email: (orderData?.buyerEmail ?? buyerProfile?.email) ?? null,
    phoneNumber: buyerProfile?.phoneNumber ?? null,
    location: {
      address: clean(buyerLoc?.address) || null,
      city: clean(buyerLoc?.city) || '—',
      state: clean(buyerLoc?.state) || '—',
      zip: clean(buyerLoc?.zip) || '—',
    },
  };
  const seller: BillOfSaleParty = {
    uid: sellerId,
    fullName: clean(sellerProfile?.displayName ?? sellerProfile?.name ?? orderData?.sellerSnapshot?.displayName ?? 'Seller'),
    email: sellerProfile?.email ?? null,
    phoneNumber: sellerProfile?.phoneNumber ?? null,
    location: {
      address: clean(sellerLoc?.address) || null,
      city: clean(sellerLoc?.city) || '—',
      state: clean(sellerLoc?.state) || '—',
      zip: clean(sellerLoc?.zip) || '—',
    },
  };

  const attrs = listingData?.attributes ?? {};
  const horse: BillOfSaleHorse = {
    listingId: listingId || orderId,
    listingTitle,
    registrationOrg: clean(attrs?.registrationOrg) || null,
    registrationNumber: clean(attrs?.registrationNumber) || null,
    sex: clean(attrs?.sex) || '—',
    age: attrs?.age ?? null,
    identifiers: {
      microchip: clean(attrs?.identification?.microchip) || null,
      brand: clean(attrs?.identification?.brand) || null,
      tattoo: clean(attrs?.identification?.tattoo) || null,
      markings: clean(attrs?.identification?.markings) || '—',
    },
  };

  const orderAmount = Number(orderData?.amount ?? 0) || 0;
  const now = Timestamp.now();
  const saleDateIso = now.toDate().toISOString().slice(0, 10);

  const data: BillOfSaleData = {
    orderId,
    saleDateIso,
    purchasePriceUsd: orderAmount,
    seller,
    buyer,
    horse,
    lienDisclosureText: 'Seller discloses any liens/encumbrances as stated in the listing and represents that transfer will be free of undisclosed liens.',
    asIsDisclaimerText: 'Buyer accepts the horse/property in "as-is" condition with no warranties except as expressly stated in writing.',
    possessionText: 'Possession transfers upon agreed delivery/pickup and completion of platform requirements.',
  };

  try {
    validateBillOfSaleInputs(data, { requireHorseIdentifiers: false });
  } catch (e: any) {
    return json({
      error: 'Bill of sale data incomplete',
      message: e?.message ?? 'Missing required fields',
      missing: e?.missing,
    }, { status: 400 });
  }

  let signatureBuffer: Buffer | undefined;
  try {
    const res = await fetch(signatureUrl, { method: 'GET' });
    if (res.ok) {
      const arr = await res.arrayBuffer();
      signatureBuffer = Buffer.from(arr);
    }
  } catch {
    // continue without image
  }

  const confirmedAt = delivery.confirmedAt;
  const buyerSignedAtIso =
    confirmedAt?.toDate?.()?.toISOString?.() ??
    (typeof confirmedAt === 'string' ? confirmedAt : null);

  const pdf = await renderBillOfSalePdfBuffer(data, {
    buyerSignatureImage: signatureBuffer,
    buyerSignedAtIso: buyerSignedAtIso ?? undefined,
  });

  const bucket = getStorage().bucket();
  const storagePath = getBillOfSaleSignedStoragePath(orderId);
  const uploaded = await uploadPdfToFirebaseStorage({ bucket, path: storagePath, pdf });

  const docRef = orderRef.collection('documents').doc(BILL_OF_SALE_DOC_ID);
  await docRef.set(
    {
      type: 'BILL_OF_SALE',
      documentUrl: uploaded.url,
      status: 'uploaded',
      uploadedBy: 'system',
      uploadedAt: now,
      metadata: {
        source: 'generated_with_signature',
        version: BILL_OF_SALE_VERSION,
        storagePath,
        mimeType: 'application/pdf',
        sha256: uploaded.sha256,
        buyerSignedAtIso: buyerSignedAtIso ?? undefined,
      },
    },
    { merge: true }
  );

  await orderRef.set(
    {
      billOfSaleGeneratedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return json({ ok: true, url: uploaded.url });
}
