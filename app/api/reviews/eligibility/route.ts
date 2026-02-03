/**
 * GET /api/reviews/eligibility?orderId=
 *
 * Buyer-only: checks if user can leave a verified review for this order.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { REVIEW_WINDOW_DAYS } from '@/lib/reviews/constants';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
}

function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
  return null;
}

export async function GET(request: Request) {
  const auth = getAdminAuth();
  const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.split('Bearer ')[1];
  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return json({ ok: false, error: 'Invalid token' }, { status: 401 });
  }

  const url = new URL(request.url);
  const orderId = String(url.searchParams.get('orderId') || '').trim();
  if (!orderId) return json({ ok: false, error: 'Missing orderId' }, { status: 400 });

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) return json({ ok: false, error: 'Order not found' }, { status: 404 });
  const order = orderSnap.data() as any;

  const buyerId = String(order?.buyerId || '');
  if (buyerId !== decoded.uid) {
    return json({ ok: false, eligible: false, reason: 'NOT_BUYER' }, { status: 403 });
  }

  const txStatus = String(order?.transactionStatus || '');
  if (txStatus !== 'COMPLETED') {
    return json({ ok: true, eligible: false, reason: 'ORDER_NOT_COMPLETE' });
  }

  const completionAt =
    toDateSafe(order?.completedAt) ||
    toDateSafe(order?.buyerConfirmedAt) ||
    toDateSafe(order?.acceptedAt) ||
    null;
  if (!completionAt) {
    return json({ ok: true, eligible: false, reason: 'MISSING_COMPLETION_TIMESTAMP' });
  }

  const windowMs = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() - completionAt.getTime() > windowMs) {
    return json({ ok: true, eligible: false, reason: 'REVIEW_WINDOW_EXPIRED', completionAt: completionAt.toISOString() });
  }

  const reviewSnap = await db.collection('reviews').doc(orderId).get();
  if (reviewSnap.exists) {
    return json({ ok: true, eligible: false, reason: 'ALREADY_REVIEWED', completionAt: completionAt.toISOString() });
  }

  return json({ ok: true, eligible: true, completionAt: completionAt.toISOString() });
}
