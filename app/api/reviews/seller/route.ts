/**
 * GET /api/reviews/seller?sellerId=&cursor=
 *
 * Public: returns seller review aggregates + recent reviews (published).
 */
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { initReviewStats } from '@/lib/reviews/aggregates';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
}

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return null;
}

export async function GET(request: Request) {
  const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
  const url = new URL(request.url);
  const sellerId = String(url.searchParams.get('sellerId') || '').trim();
  const cursor = String(url.searchParams.get('cursor') || '').trim();
  const limit = 10;

  if (!sellerId) return json({ ok: false, error: 'Missing sellerId' }, { status: 400 });

  try {
    const userSnap = await db.collection('users').doc(sellerId).get();
    const stats = userSnap.exists ? ((userSnap.data() as any)?.sellerReviewStats || initReviewStats()) : initReviewStats();

    let q = db
      .collection('reviews')
      .where('sellerId', '==', sellerId)
      .where('status', '==', 'published')
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (cursor) {
      const cursorSnap = await db.collection('reviews').doc(cursor).get();
      if (cursorSnap.exists) {
        q = q.startAfter(cursorSnap);
      }
    }

    const snap = await q.get();
    const reviews = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        orderId: d.id,
        listingId: data.listingId || null,
        buyerId: data.buyerId || null,
        sellerId: data.sellerId || null,
        rating: data.rating || null,
        text: data.text || null,
        tags: data.tags || null,
        status: data.status || 'published',
        verified: true,
        createdAt: tsToIso(data.createdAt),
      };
    });

    const nextCursor = snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

    return json({ ok: true, stats, reviews, nextCursor });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Failed to load reviews' }, { status: 500 });
  }
}
