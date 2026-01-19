/**
 * POST /api/orders/[orderId]/bill-of-sale/confirm-signed
 *
 * Server-authoritative signature confirmation for Bill of Sale.
 * - Buyer can set billOfSaleBuyerSignedAt
 * - Seller can set billOfSaleSellerSignedAt
 *
 * NOTE: This does not implement e-sign; it records attestation timestamps.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request, ctx: { params: { orderId: string } }) {
  const orderId = String(ctx?.params?.orderId || '').trim();
  if (!orderId) return json({ ok: false, error: 'Missing orderId' }, { status: 400 });

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.slice('Bearer '.length);

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const orderRef = db.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) return json({ ok: false, error: 'Order not found' }, { status: 404 });
  const order = snap.data() as any;

  const isBuyer = String(order?.buyerId || '') === uid;
  const isSeller = String(order?.sellerId || '') === uid;
  if (!isBuyer && !isSeller) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const now = Timestamp.now();
  const updates: any = {
    updatedAt: now,
    lastUpdatedByRole: isBuyer ? 'buyer' : 'seller',
  };
  if (isBuyer) {
    updates.billOfSaleBuyerSignedAt = now;
    updates.billOfSaleBuyerSignedBy = uid;
  }
  if (isSeller) {
    updates.billOfSaleSellerSignedAt = now;
    updates.billOfSaleSellerSignedBy = uid;
  }

  await orderRef.set(updates, { merge: true });
  return json({
    ok: true,
    orderId,
    buyerSignedAt: isBuyer ? now.toDate().toISOString() : null,
    sellerSignedAt: isSeller ? now.toDate().toISOString() : null,
  });
}

