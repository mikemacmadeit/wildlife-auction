/**
 * POST /api/admin/orders/[orderId]/review-request
 *
 * Admin-only: enqueue review request email (idempotent unless force=true by super_admin).
 */
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { getFirestore } from 'firebase-admin/firestore';
import { enqueueReviewRequest } from '@/lib/reviews/reviewRequest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: { params: { orderId: string } }) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { db, isSuperAdmin } = admin.ctx;

  const orderId = String(ctx?.params?.orderId || '').trim();
  if (!orderId) return json({ ok: false, error: 'Missing orderId' }, { status: 400 });

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const force = body?.force === true;
  if (force && !isSuperAdmin) {
    return json({ ok: false, error: 'Super admin required for force resend' }, { status: 403 });
  }

  const orderSnap = await (db as unknown as ReturnType<typeof getFirestore>).collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return json({ ok: false, error: 'Order not found' }, { status: 404 });

  const res = await enqueueReviewRequest({
    db: db as any,
    orderId,
    order: orderSnap.data() as any,
    force,
  });

  return json({ ok: res.ok, created: res.created });
}
