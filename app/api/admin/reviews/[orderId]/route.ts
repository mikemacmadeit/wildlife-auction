/**
 * GET /api/admin/reviews/[orderId]
 *
 * Admin-only: fetch a review by orderId.
 */
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return null;
}

export async function GET(request: Request, ctx: { params: { orderId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { db } = admin.ctx;

  const orderId = String(ctx?.params?.orderId || '').trim();
  if (!orderId) return json({ ok: false, error: 'Missing orderId' }, { status: 400 });

  const snap = await (db as unknown as ReturnType<typeof getFirestore>).collection('reviews').doc(orderId).get();
  if (!snap.exists) return json({ ok: true, review: null });
  const data = snap.data() as any;
  return json({
    ok: true,
    review: {
      orderId,
      listingId: data.listingId || null,
      buyerId: data.buyerId || null,
      sellerId: data.sellerId || null,
      rating: data.rating || null,
      text: data.text || null,
      tags: data.tags || null,
      status: data.status || 'published',
      verified: true,
      createdAt: tsToIso(data.createdAt),
      moderatedAt: tsToIso(data.moderatedAt),
      moderatedBy: data.moderatedBy || null,
      moderationReason: data.moderationReason || null,
    },
  });
}
