/**
 * GET /api/admin/notifications/deadletters?kind=event|email|push&limit=100
 * POST /api/admin/notifications/deadletters { kind, id, action: retry|suppress, reason? }
 *
 * Admin-only: visibility + basic controls for notification pipeline dead letters.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { isAdminUid } from '../_admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function requireAdmin(request: Request) {
  const auth = getAdminAuth();
  const db = getAdminDb();

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, response: json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  const token = authHeader.slice('Bearer '.length);

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return { ok: false as const, response: json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  const uid = decoded?.uid as string | undefined;
  if (!uid) return { ok: false as const, response: json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };

  const claimRole = (decoded as any)?.role;
  const claimSuper = (decoded as any)?.superAdmin === true;
  const claimIsAdmin = claimRole === 'admin' || claimRole === 'super_admin' || claimSuper;
  const docIsAdmin = claimIsAdmin ? true : await isAdminUid(uid);
  if (!docIsAdmin) return { ok: false as const, response: json({ ok: false, error: 'Admin access required' }, { status: 403 }) };

  return { ok: true as const, db, uid };
}

export async function GET(request: Request) {
  let db: ReturnType<typeof getAdminDb>;
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;
    db = admin.db;
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const url = new URL(request.url);
  const kind = String(url.searchParams.get('kind') || 'event');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)));

  const col =
    kind === 'email' ? 'emailJobDeadLetters' : kind === 'push' ? 'pushJobDeadLetters' : 'notificationDeadLetters';

  const snap = await db.collection(col).orderBy('createdAt', 'desc').limit(limit).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  return json({ ok: true, kind: col, items });
}

const actionSchema = z.object({
  kind: z.enum(['event', 'email', 'push']),
  id: z.string().min(1),
  action: z.enum(['retry', 'suppress']),
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  let db: ReturnType<typeof getAdminDb>;
  let actorUid: string;
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;
    db = admin.db;
    actorUid = admin.uid;
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const parsed = actionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  const { kind, id, action, reason } = parsed.data;
  const now = Timestamp.now();

  const dlqCol = kind === 'email' ? 'emailJobDeadLetters' : kind === 'push' ? 'pushJobDeadLetters' : 'notificationDeadLetters';
  const primaryCol = kind === 'email' ? 'emailJobs' : kind === 'push' ? 'pushJobs' : 'events';

  const dlqRef = db.collection(dlqCol).doc(id);
  const primaryRef = db.collection(primaryCol).doc(id);

  if (action === 'suppress') {
    await dlqRef.set(
      {
        suppressed: true,
        suppressedAt: now,
        suppressedBy: actorUid,
        suppressedReason: reason || null,
      },
      { merge: true }
    );
    return json({ ok: true, action: 'suppress' });
  }

  const primarySnap = await primaryRef.get();
  if (!primarySnap.exists) {
    return json({ ok: false, error: 'Primary document not found', kind: primaryCol, id }, { status: 404 });
  }

  // retry
  if (kind === 'event') {
    const cur = primarySnap.data() as any;
    if (String(cur?.status || '') === 'processed') {
      return json({ ok: false, error: 'Event is already processed; refusing to retry', id }, { status: 409 });
    }
    await primaryRef.set(
      {
        status: 'pending',
        processing: { error: null, lastAttemptAt: null },
        manualRetryAt: now,
        manualRetryBy: actorUid,
      },
      { merge: true }
    );
  } else {
    const cur = primarySnap.data() as any;
    if (String(cur?.status || '') === 'sent') {
      return json({ ok: false, error: 'Job is already sent; refusing to retry', id }, { status: 409 });
    }
    await primaryRef.set(
      {
        status: 'queued',
        error: null,
        errorCode: null,
        deliverAfterAt: null,
        lastAttemptAt: null,
        manualRetryAt: now,
        manualRetryBy: actorUid,
      },
      { merge: true }
    );
  }

  await dlqRef.set(
    {
      suppressed: false,
      manualRetryCount: FieldValue.increment(1),
      lastManualRetryAt: now,
      lastManualRetryBy: actorUid,
    },
    { merge: true }
  );

  return json({ ok: true, action: 'retry' });
}

