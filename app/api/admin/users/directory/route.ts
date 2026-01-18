/**
 * GET /api/admin/users/directory
 *
 * Cursor-paginated directory backed by `userSummaries/{uid}` (no broad joins/scans).
 *
 * Query params:
 * - q (optional): single-token search (name/email/phone/uid token) via `searchTokens` array-contains
 * - role (optional): user|admin|super_admin
 * - status (optional): active|disabled|suspended|banned
 * - verification (optional): identityVerified|sellerVerified|any
 * - risk (optional): low|med|high|unknown
 * - activity (optional): 24h|7d|30d
 * - sort (optional): newest|last_activity (default newest)
 * - limit (optional): 10..50 (default 25)
 * - cursor (optional): last uid from previous page
 */
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json } from '../../_util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().optional(),
  role: z.enum(['user', 'admin', 'super_admin']).optional(),
  status: z.enum(['active', 'disabled', 'suspended', 'banned']).optional(),
  verification: z.enum(['identityVerified', 'sellerVerified', 'any']).optional(),
  risk: z.enum(['low', 'med', 'high', 'unknown']).optional(),
  activity: z.enum(['24h', '7d', '30d']).optional(),
  sort: z.enum(['newest', 'last_activity']).optional(),
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

function windowStart(activity?: '24h' | '7d' | '30d'): Date | null {
  if (!activity) return null;
  const now = Date.now();
  const ms = activity === '24h' ? 24 * 60 * 60 * 1000 : activity === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return new Date(now - ms);
}

export async function GET(request: Request) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { db } = admin.ctx;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q') || undefined,
    role: (url.searchParams.get('role') as any) || undefined,
    status: (url.searchParams.get('status') as any) || undefined,
    verification: (url.searchParams.get('verification') as any) || undefined,
    risk: (url.searchParams.get('risk') as any) || undefined,
    activity: (url.searchParams.get('activity') as any) || undefined,
    sort: (url.searchParams.get('sort') as any) || undefined,
    limit: url.searchParams.get('limit') || undefined,
    cursor: url.searchParams.get('cursor') || undefined,
  });
  if (!parsed.success) return json({ ok: false, error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 });

  const limit = Math.max(10, Math.min(50, Number(parsed.data.limit || 25) || 25));
  const sort = parsed.data.sort || 'newest';
  const activityStart = windowStart(parsed.data.activity);

  try {
    let qref: FirebaseFirestore.Query = db.collection('userSummaries');

    // Filters
    if (parsed.data.role) qref = qref.where('role', '==', parsed.data.role);
    if (parsed.data.status) qref = qref.where('status', '==', parsed.data.status);
    if (parsed.data.risk) qref = qref.where('risk.label', '==', parsed.data.risk);
    if (activityStart) qref = qref.where('lastActivityAt', '>=', activityStart);

    if (parsed.data.verification === 'identityVerified') qref = qref.where('verification.identityVerified', '==', true);
    if (parsed.data.verification === 'sellerVerified') qref = qref.where('verification.sellerVerified', '==', true);
    if (parsed.data.verification === 'any') {
      // Firestore doesn't support OR; keep as a best-effort in-memory filter after fetch.
    }

    const q = String(parsed.data.q || '').trim().toLowerCase();
    if (q) {
      // Token search (single-token) via array-contains.
      qref = qref.where('searchTokens', 'array-contains', q);
    }

    // Ordering
    if (sort === 'last_activity') qref = qref.orderBy('lastActivityAt', 'desc');
    else qref = qref.orderBy('createdAt', 'desc');

    // Cursor
    if (parsed.data.cursor) {
      const cursorSnap = await db.collection('userSummaries').doc(parsed.data.cursor).get();
      if (cursorSnap.exists) qref = qref.startAfter(cursorSnap);
    }

    qref = qref.limit(limit);

    const snap = await qref.get();
    let rows = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));

    if (parsed.data.verification === 'any') {
      rows = rows.filter((r) => r?.verification?.identityVerified === true || r?.verification?.sellerVerified === true);
    }

    const nextCursor = snap.size === limit ? snap.docs[snap.docs.length - 1]?.id : null;
    return json({ ok: true, users: rows, nextCursor });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to load directory', code: 'DIRECTORY_FAILED', message: e?.message || String(e) }, { status: 500 });
  }
}

