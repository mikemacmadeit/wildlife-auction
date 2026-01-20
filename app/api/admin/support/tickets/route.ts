/**
 * GET /api/admin/support/tickets
 *
 * Admin-only: list contact form tickets.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';

function toInt(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export async function GET(request: Request) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const status = (url.searchParams.get('status') || 'open').trim(); // open | resolved | all
  const limit = Math.max(1, Math.min(200, toInt(url.searchParams.get('limit'), 50)));

  const db = admin.ctx.db;
  let q = db.collection('supportTickets').orderBy('createdAt', 'desc').limit(limit);
  if (status === 'open' || status === 'resolved') {
    q = db.collection('supportTickets').where('status', '==', status).orderBy('createdAt', 'desc').limit(limit);
  }

  const snap = await q.get();
  const tickets = snap.docs.map((d) => {
    const data: any = d.data();
    const createdAt = data?.createdAt?.toDate?.() || data?.createdAt || null;
    const updatedAt = data?.updatedAt?.toDate?.() || data?.updatedAt || null;
    return {
      ticketId: d.id,
      status: data?.status || 'open',
      source: data?.source || 'contact_form',
      name: data?.name || '',
      email: data?.email || '',
      subject: data?.subject || '',
      messagePreview: String(data?.message || '').slice(0, 240),
      userId: data?.userId || null,
      listingId: data?.listingId || null,
      orderId: data?.orderId || null,
      createdAt,
      updatedAt,
    };
  });

  return json({ ok: true, tickets }, { status: 200 });
}

