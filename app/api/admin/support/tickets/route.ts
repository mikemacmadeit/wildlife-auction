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
  const priority = url.searchParams.get('priority')?.trim(); // low | normal | high | urgent
  const category = url.searchParams.get('category')?.trim(); // orders | payments | listings | etc.
  const assignedTo = url.searchParams.get('assignedTo')?.trim(); // admin UID or 'unassigned' or 'me'
  const sortBy = (url.searchParams.get('sortBy') || 'newest').trim(); // newest | oldest | updated | priority
  const limit = Math.max(1, Math.min(200, toInt(url.searchParams.get('limit'), 50)));
  const offset = Math.max(0, toInt(url.searchParams.get('offset'), 0));

  const db = admin.ctx.db;
  const actorUid = admin.ctx.actorUid;

  // Build query with filters
  let q = db.collection('supportTickets');

  // Status filter
  if (status === 'open' || status === 'resolved') {
    q = q.where('status', '==', status);
  }

  // Priority filter
  if (priority && ['low', 'normal', 'high', 'urgent'].includes(priority)) {
    q = q.where('priority', '==', priority);
  }

  // Category filter
  if (category) {
    q = q.where('category', '==', category);
  }

  // Assignment filter
  if (assignedTo === 'me') {
    q = q.where('assignedTo', '==', actorUid);
  } else if (assignedTo === 'unassigned') {
    q = q.where('assignedTo', '==', null);
  } else if (assignedTo) {
    q = q.where('assignedTo', '==', assignedTo);
  }

  // Sorting
  if (sortBy === 'oldest') {
    q = q.orderBy('createdAt', 'asc');
  } else if (sortBy === 'updated') {
    q = q.orderBy('updatedAt', 'desc');
  } else if (sortBy === 'priority') {
    // Priority order: urgent > high > normal > low
    // Note: This requires a composite index. For now, we'll sort client-side.
    q = q.orderBy('createdAt', 'desc'); // Fallback, will sort by priority client-side
  } else {
    // Default: newest
    q = q.orderBy('createdAt', 'desc');
  }

  // Apply limit (with offset for pagination)
  const queryLimit = limit + offset;
  q = q.limit(queryLimit);

  let snap: any;
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
      priority: data?.priority || 'normal',
      category: data?.category || 'other',
      source: data?.source || 'contact_form',
      name: data?.name || '',
      email: data?.email || '',
      subject: data?.subject || '',
      messagePreview: String(data?.message || '').slice(0, 240),
      userId: data?.userId || null,
      listingId: data?.listingId || null,
      orderId: data?.orderId || null,
      assignedTo: data?.assignedTo || null,
      createdAt,
      updatedAt,
    };
  });

  // Client-side sorting for priority (since Firestore can't easily sort by enum priority)
  let sorted = [...tickets];
  if (sortBy === 'priority') {
    const priorityOrder: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
    sorted = sorted.sort((a: any, b: any) => {
      const aPriority = priorityOrder[a.priority || 'normal'] || 2;
      const bPriority = priorityOrder[b.priority || 'normal'] || 2;
      if (bPriority !== aPriority) return bPriority - aPriority;
      // If same priority, sort by updatedAt desc
      const at = a?.updatedAt instanceof Date ? a.updatedAt.getTime() : new Date(a?.updatedAt || 0).getTime();
      const bt = b?.updatedAt instanceof Date ? b.updatedAt.getTime() : new Date(b?.updatedAt || 0).getTime();
      return bt - at;
    });
  } else if (sortBy === 'oldest') {
    // Already sorted by createdAt asc, no change needed
  } else if (sortBy === 'updated') {
    // Already sorted by updatedAt desc, no change needed
  } else {
    // Already sorted by createdAt desc, no change needed
  }

  // Apply pagination offset
  const paginated = sorted.slice(offset, offset + limit);

  return json(
    {
      ok: true,
      tickets: paginated,
      total: sorted.length,
      hasMore: offset + limit < sorted.length,
      ...(usedFallback ? { warning: 'missing_index_supportTickets_status_createdAt' } : {}),
    },
    { status: 200 }
  );
}

