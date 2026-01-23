/**
 * Support Tickets (User)
 *
 * GET  /api/support/tickets
 * - Auth required
 * - Lists tickets for the signed-in user
 *
 * POST /api/support/tickets
 * - Auth required
 * - Creates a support ticket (in-app)
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { json, getRequestMeta } from '@/app/api/admin/_util';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';

const CreateSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(10).max(5000),
  listingId: z.string().trim().max(128).optional(),
  orderId: z.string().trim().max(128).optional(),
  category: z
    .enum(['orders', 'payments', 'listings', 'offers', 'messages', 'compliance', 'technical', 'other'])
    .optional(),
});

async function requireUser(request: Request): Promise<{ uid: string; auth: ReturnType<typeof getAdminAuth>; db: ReturnType<typeof getAdminDb>; decoded: any } | Response> {
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
  const uid = String(decoded?.uid || '').trim();
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  return { uid, auth, db, decoded };
}

function toIsoSafe(v: any): string | null {
  try {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v?.toDate === 'function') {
      const d = v.toDate();
      return d instanceof Date ? d.toISOString() : null;
    }
    if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
    if (v instanceof Date) return v.toISOString();
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const rl = await rateLimitMiddleware(RATE_LIMITS.support)(request as any);
  if (!rl.allowed) {
    return json(rl.body, { status: rl.status, headers: { 'Retry-After': String(rl.body.retryAfter || 60) } });
  }

  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const { uid, db } = ctx;

  const url = new URL(request.url);
  const status = String(url.searchParams.get('status') || 'all').trim(); // open|resolved|all
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 50) || 50));

  let q: FirebaseFirestore.Query = db.collection('supportTickets').where('userId', '==', uid).orderBy('createdAt', 'desc').limit(limit);
  if (status === 'open' || status === 'resolved') {
    q = db.collection('supportTickets').where('userId', '==', uid).where('status', '==', status).orderBy('createdAt', 'desc').limit(limit);
  }

  let snap: FirebaseFirestore.QuerySnapshot;
  let usedFallback = false;
  try {
    snap = await q.get();
  } catch (e: any) {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    const isMissingIndex =
      code === 'failed-precondition' || msg.toLowerCase().includes('requires an index') || msg.toLowerCase().includes('failed-precondition');
    if (!isMissingIndex) throw e;
    usedFallback = true;
    const fq = db.collection('supportTickets').where('userId', '==', uid).limit(Math.max(limit, 200));
    const fsnap = await fq.get();
    const mapped = fsnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const sorted = mapped.sort((a: any, b: any) => {
      const at = a?.createdAt?.toMillis?.() || new Date(a?.createdAt || 0).getTime();
      const bt = b?.createdAt?.toMillis?.() || new Date(b?.createdAt || 0).getTime();
      return bt - at;
    });
    const tickets = sorted
      .filter((t: any) => (status === 'all' ? true : String(t.status || '') === status))
      .slice(0, limit)
      .map((t: any) => ({
        ticketId: t.ticketId || t.id,
        status: t.status || 'open',
        subject: t.subject || '',
        messagePreview: String(t.message || '').slice(0, 240),
        listingId: t.listingId || null,
        orderId: t.orderId || null,
        createdAt: toIsoSafe(t.createdAt),
        updatedAt: toIsoSafe(t.updatedAt),
        lastPublicReplyAt: toIsoSafe(t.lastPublicReplyAt),
      }));
    return json({ ok: true, tickets, ...(usedFallback ? { warning: 'missing_index_supportTickets_userId_createdAt' } : {}) }, { status: 200 });
  }

  const tickets = snap.docs.map((d) => {
    const data: any = d.data();
    return {
      ticketId: d.id,
      status: data?.status || 'open',
      subject: data?.subject || '',
      messagePreview: String(data?.message || '').slice(0, 240),
      listingId: data?.listingId || null,
      orderId: data?.orderId || null,
      createdAt: toIsoSafe(data?.createdAt),
      updatedAt: toIsoSafe(data?.updatedAt),
      lastPublicReplyAt: toIsoSafe(data?.lastPublicReplyAt),
    };
  });

  return json({ ok: true, tickets, ...(usedFallback ? { warning: 'missing_index_supportTickets_userId_createdAt' } : {}) }, { status: 200 });
}

export async function POST(request: Request) {
  const rl = await rateLimitMiddleware(RATE_LIMITS.support)(request as any);
  if (!rl.allowed) {
    return json(rl.body, { status: rl.status, headers: { 'Retry-After': String(rl.body.retryAfter || 60) } });
  }

  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const { uid, auth, db, decoded } = ctx;

  const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, error: 'Validation error', details: parsed.error.flatten() }, { status: 400 });

  const meta = getRequestMeta(request);
  const now = Timestamp.now();

  const userRec = await auth.getUser(uid).catch(() => null as any);
  const email = String(userRec?.email || '').trim();
  const name = String(userRec?.displayName || '').trim() || 'User';
  if (!email) return json({ ok: false, error: 'No email on account', code: 'EMAIL_REQUIRED' }, { status: 400 });

  const docRef = db.collection('supportTickets').doc();
  await docRef.set(
    {
      ticketId: docRef.id,
      status: 'open',
      source: 'in_app',
      category: parsed.data.category || 'other',
      name,
      email,
      subject: parsed.data.subject,
      message: parsed.data.message,
      ...(parsed.data.listingId ? { listingId: parsed.data.listingId } : {}),
      ...(parsed.data.orderId ? { orderId: parsed.data.orderId } : {}),
      userId: uid,
      meta: {
        hasAuth: true,
        emailVerified: decoded?.email_verified === true ? true : undefined,
        ipPresent: !!meta.ip,
        userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 200) : undefined,
      },
      createdAt: now,
      updatedAt: now,
      lastPublicReplyAt: now,
      lastPublicReplyBy: 'user',
    },
    { merge: true }
  );

  await docRef.collection('messages').doc(`m_${Date.now()}`).set(
    {
      kind: 'user',
      by: uid,
      body: parsed.data.message,
      createdAt: now,
    },
    { merge: true }
  );

  return json({ ok: true, ticketId: docRef.id }, { status: 201 });
}

