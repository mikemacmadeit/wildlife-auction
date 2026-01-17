/**
 * GET /api/admin/notifications/jobs?kind=email|push
 * Admin-only: lists recent queued jobs.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { isAdminUid } from '../_admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET(request: Request) {
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
  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const claimRole = (decoded as any)?.role;
  const claimSuper = (decoded as any)?.superAdmin === true;
  const claimIsAdmin = claimRole === 'admin' || claimRole === 'super_admin' || claimSuper;
  const docIsAdmin = claimIsAdmin ? true : await isAdminUid(uid);
  if (!docIsAdmin) return json({ ok: false, error: 'Admin access required' }, { status: 403 });

  const url = new URL(request.url);
  const kind = String(url.searchParams.get('kind') || 'email');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)));

  const col = kind === 'push' ? 'pushJobs' : 'emailJobs';
  const snap = await db.collection(col).orderBy('createdAt', 'desc').limit(limit).get();
  const jobs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  return json({ ok: true, kind: col, jobs });
}

