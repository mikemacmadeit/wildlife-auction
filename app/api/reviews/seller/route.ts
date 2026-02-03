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

    let reviews: Array<{ id: string; data: any }> = [];

    try {
      // Primary: composite index query (sellerId + status + createdAt)
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
      reviews = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    } catch (idxErr: any) {
      // Fallback if composite index not deployed: query by sellerId only, filter/sort in memory
      const msg = String(idxErr?.message || '');
      if (msg.includes('FAILED_PRECONDITION') || msg.includes('index')) {
        const snap = await db.collection('reviews').where('sellerId', '==', sellerId).limit(200).get();
        let all = snap.docs
          .map((d) => ({ id: d.id, data: d.data() }))
          .filter((r) => String((r.data as any)?.status || '') === 'published')
          .sort((a, b) => {
            const at = (a.data as any).createdAt?.toDate?.() ?? (a.data as any).createdAt ?? 0;
            const bt = (b.data as any).createdAt?.toDate?.() ?? (b.data as any).createdAt ?? 0;
            return (bt instanceof Date ? bt.getTime() : 0) - (at instanceof Date ? at.getTime() : 0);
          });
        const startIdx = cursor ? all.findIndex((r) => r.id === cursor) + 1 : 0;
        reviews = all.slice(Math.max(0, startIdx), startIdx + limit);
      } else {
        throw idxErr;
      }
    }

    const reviewList = reviews.map((r) => {
      const data = r.data as any;
      return {
        orderId: r.id,
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

    const nextCursor = reviews.length === limit ? reviews[reviews.length - 1].id : null;

    return json({ ok: true, stats, reviews: reviewList, nextCursor });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Failed to load reviews' }, { status: 500 });
  }
}
