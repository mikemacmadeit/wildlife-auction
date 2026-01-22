/**
 * PATCH /api/messages/thread/[threadId]/archive
 *
 * Server-side archive/unarchive for message threads.
 * Firestore rules do not allow participants to update `archived` directly, by design.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
}

export async function PATCH(request: Request, { params }: { params: { threadId: string } }) {
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

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const uid = String(decoded?.uid || '');
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const threadId = String(params?.threadId || '').trim();
  if (!threadId) return json({ ok: false, error: 'Missing threadId' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const archived = Boolean(body?.archived);

  const ref = db.collection('messageThreads').doc(threadId);
  const snap = await ref.get();
  if (!snap.exists) return json({ ok: false, error: 'Thread not found' }, { status: 404 });
  const t = snap.data() as any;

  const isParticipant = String(t?.buyerId || '') === uid || String(t?.sellerId || '') === uid;
  const isAdmin = (decoded as any)?.role === 'admin' || (decoded as any)?.role === 'super_admin' || (decoded as any)?.superAdmin === true;
  if (!isParticipant && !isAdmin) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const now = Timestamp.now();
  await ref.set(
    {
      archived,
      archivedAt: now,
      archivedBy: uid,
      updatedAt: now,
    },
    { merge: true }
  );

  return json({ ok: true, threadId, archived });
}

