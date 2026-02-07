/**
 * POST /api/reviews/create
 *
 * Buyer-only: create a verified review for a completed order.
 */
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { REVIEW_WINDOW_DAYS } from '@/lib/reviews/constants';
import { applyReviewDelta, initReviewStats } from '@/lib/reviews/aggregates';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { getSiteUrl } from '@/lib/site-url';

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

export async function POST(request: Request) {
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

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const orderId = String(body?.orderId || '').trim();
  const rating = Number(body?.rating || 0);
  const text = typeof body?.text === 'string' ? body.text.trim() : null;
  const tags = Array.isArray(body?.tags) ? body.tags.map((t: any) => String(t || '').trim()).filter(Boolean).slice(0, 5) : null;

  if (!orderId) return json({ ok: false, error: 'Missing orderId' }, { status: 400 });
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return json({ ok: false, error: 'Invalid rating' }, { status: 400 });

  try {
    const now = Timestamp.now();
    const reviewRef = db.collection('reviews').doc(orderId);
    const orderRef = db.collection('orders').doc(orderId);

    await db.runTransaction(async (tx) => {
      // Firestore transactions require ALL reads before ANY writes.
      const [orderSnap, existingReviewSnap] = await Promise.all([tx.get(orderRef), tx.get(reviewRef)]);
      if (!orderSnap.exists) throw new Error('Order not found');
      if (existingReviewSnap.exists) throw new Error('ALREADY_REVIEWED');

      const order = orderSnap.data() as any;
      const buyerId = String(order?.buyerId || '');
      if (buyerId !== decoded.uid) throw new Error('NOT_BUYER');

      const txStatus = String(order?.transactionStatus || '');
      if (txStatus !== 'COMPLETED') throw new Error('ORDER_NOT_COMPLETE');

      const completionAt =
        toDateSafe(order?.completedAt) ||
        toDateSafe(order?.buyerConfirmedAt) ||
        toDateSafe(order?.acceptedAt) ||
        null;
      if (!completionAt) throw new Error('MISSING_COMPLETION_TIMESTAMP');

      const windowMs = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      if (Date.now() - completionAt.getTime() > windowMs) throw new Error('REVIEW_WINDOW_EXPIRED');

      const sellerId = String(order?.sellerId || '');
      const listingId = String(order?.listingId || '');

      // Read user and publicProfile BEFORE any writes
      const userRef = db.collection('users').doc(sellerId);
      const publicRef = db.collection('publicProfiles').doc(sellerId);
      const [userSnap, publicSnap] = await Promise.all([tx.get(userRef), tx.get(publicRef)]);

      const userData = userSnap.exists ? (userSnap.data() as any) : null;
      const publicData = publicSnap.exists ? (publicSnap.data() as any) : null;
      const currentStats = userData?.sellerReviewStats || initReviewStats();
      const publicStats = publicData?.sellerReviewStats || initReviewStats();
      const nextStats = applyReviewDelta(currentStats, rating, 1, now.toDate());
      const nextPublicStats = applyReviewDelta(publicStats, rating, 1, now.toDate());

      // All reads done. Now perform all writes.
      tx.set(reviewRef, {
        orderId,
        listingId,
        buyerId,
        sellerId,
        rating,
        text: text || null,
        tags: tags || null,
        status: 'published',
        verified: true,
        createdAt: now,
        updatedAt: now,
      });
      tx.set(userRef, { sellerReviewStats: nextStats, updatedAt: now }, { merge: true });
      tx.set(publicRef, { sellerReviewStats: nextPublicStats, updatedAt: now }, { merge: true });
    });

    // Notify seller of new review (in-app + email)
    const orderSnapAfter = await orderRef.get();
    const orderData = orderSnapAfter.exists ? (orderSnapAfter.data() as any) : null;
    const sellerId = String(orderData?.sellerId || '');
    const listingId = String(orderData?.listingId || '');
    const listingTitle = String(orderData?.listingSnapshot?.title || '').trim() || 'Your listing';
    const reputationUrl = `${getSiteUrl()}/seller/reputation`;

    if (sellerId) {
      try {
        const ev = await emitAndProcessEventForUser({
          type: 'Review.Received',
          actorId: decoded.uid,
          entityType: 'order',
          entityId: orderId,
          targetUserId: sellerId,
          payload: {
            type: 'Review.Received',
            orderId,
            listingId,
            listingTitle,
            rating,
            reviewText: text || null,
            reputationUrl,
          },
          optionalHash: `review:${orderId}`,
        });
        if (ev?.ok && ev.created) {
          void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch(() => {});
        }
      } catch {
        // best-effort; do not fail review creation
      }
    }

    return json({ ok: true });
  } catch (e: any) {
    const code = String(e?.message || '');
    if (code === 'ALREADY_REVIEWED') return json({ ok: false, error: 'Already reviewed' }, { status: 409 });
    if (code === 'NOT_BUYER') return json({ ok: false, error: 'Unauthorized' }, { status: 403 });
    if (code === 'ORDER_NOT_COMPLETE') return json({ ok: false, error: 'Order not complete' }, { status: 400 });
    if (code === 'MISSING_COMPLETION_TIMESTAMP') return json({ ok: false, error: 'Missing completion timestamp' }, { status: 400 });
    if (code === 'REVIEW_WINDOW_EXPIRED') return json({ ok: false, error: 'Review window expired' }, { status: 400 });
    return json({ ok: false, error: e?.message || 'Failed to create review' }, { status: 500 });
  }
}
