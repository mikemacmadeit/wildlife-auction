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

  let snap: FirebaseFirestore.QuerySnapshot;
  let usedFallback = false;
  try {
    snap = await q.get();
  } catch (e: any) {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    const isMissingIndex =
      code === 'failed-precondition' ||
      msg.toLowerCase().includes('requires an index') ||
      msg.toLowerCase().includes('failed-precondition');
    if (!isMissingIndex) throw e;

    // Fallback query: avoid composite index requirement while indexes build.
    // We fetch more, sort server-side, then slice.
    usedFallback = true;
    const fallbackLimit = Math.max(limit, 200);
    let fq = db.collection('supportTickets').limit(fallbackLimit);
    if (status === 'open' || status === 'resolved') {
      fq = db.collection('supportTickets').where('status', '==', status).limit(fallbackLimit);
    }
    snap = await fq.get();
  }
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

  const sorted = [...tickets].sort((a: any, b: any) => {
    const at = a?.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a?.createdAt || 0).getTime();
    const bt = b?.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b?.createdAt || 0).getTime();
    return bt - at;
  });

  return json(
    { ok: true, tickets: sorted.slice(0, limit), ...(usedFallback ? { warning: 'missing_index_supportTickets_status_createdAt' } : {}) },
    { status: 200 }
  );
}

