/**
 * POST /api/support/tickets/[ticketId]/reply
 *
 * User-authored reply to an existing ticket.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { json } from '@/app/api/admin/_util';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';

const BodySchema = z.object({
  message: z.string().trim().min(1).max(5000),
});

async function requireUser(request: Request): Promise<{ uid: string; db: ReturnType<typeof getAdminDb> } | Response> {
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
  return { uid, db };
}

export async function POST(request: Request, ctx: { params: { ticketId: string } }) {
  const rl = await rateLimitMiddleware(RATE_LIMITS.support)(request as any);
  if (!rl.allowed) {
    return json(rl.body, { status: rl.status, headers: { 'Retry-After': String(rl.body.retryAfter || 60) } });
  }

  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { uid, db } = auth;

  const ticketId = String(ctx?.params?.ticketId || '').trim();
  if (!ticketId) return json({ ok: false, error: 'Missing ticketId' }, { status: 400 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, error: 'Validation error', details: parsed.error.flatten() }, { status: 400 });

  const ref = db.collection('supportTickets').doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) return json({ ok: false, error: 'Not found' }, { status: 404 });

  const data: any = snap.data();
  if (String(data?.userId || '') !== uid) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const now = Timestamp.now();
  await ref.collection('messages').doc(`m_${Date.now()}`).set(
    { kind: 'user', by: uid, body: parsed.data.message, createdAt: now },
    { merge: true }
  );

  await ref.set(
    {
      status: 'open', // user reply reopens
      updatedAt: now,
      lastPublicReplyAt: now,
      lastPublicReplyBy: 'user',
      resolvedAt: null,
      resolvedBy: null,
    },
    { merge: true }
  );

  return json({ ok: true }, { status: 200 });
}

