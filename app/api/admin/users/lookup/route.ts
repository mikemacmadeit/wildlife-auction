/**
 * GET /api/admin/users/lookup?query=...&limit=...
 *
 * Admin-only endpoint to lookup users for admin tools.
 * Supports:
 * - empty query: list recent users (from Firestore `users`)
 * - email query: exact match via Firebase Auth; fallback to Firestore email prefix search
 * - uid query: Firebase Auth getUser(uid) + Firestore doc join
 */
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { isAdminUid } from '@/app/api/admin/notifications/_admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
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

async function requireAdmin(request: Request): Promise<{ uid: string; auth: ReturnType<typeof getAdminAuth>; db: ReturnType<typeof getAdminDb> } | Response> {
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

  return { uid, auth, db };
}

export async function GET(request: Request) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof Response) return ctx;
  const { auth, db } = ctx;

  const url = new URL(request.url);
  const q = String(url.searchParams.get('query') || '').trim();
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') || 25) || 25));

  try {
    const results: any[] = [];

    // Helper: join auth user + firestore profile doc (if present)
    const addUser = async (uid: string, authUser?: any) => {
      const [authRec, docSnap] = await Promise.allSettled([
        authUser ? Promise.resolve(authUser) : auth.getUser(uid),
        db.collection('users').doc(uid).get(),
      ]);

      const au = authRec.status === 'fulfilled' ? authRec.value : null;
      const doc = docSnap.status === 'fulfilled' && docSnap.value.exists ? (docSnap.value.data() as any) : null;

      results.push({
        uid,
        email: au?.email || doc?.email || null,
        displayName: au?.displayName || doc?.displayName || doc?.profile?.fullName || null,
        phoneNumber: au?.phoneNumber || doc?.phoneNumber || null,
        role: doc?.role || null,
        subscriptionTier: doc?.subscriptionTier || null,
        adminPlanOverride: doc?.adminPlanOverride ?? null,
        disabled: !!au?.disabled,
        emailVerified: !!au?.emailVerified,
        createdAt: toIsoSafe(doc?.createdAt) || au?.metadata?.creationTime || null,
        lastSignInAt: au?.metadata?.lastSignInTime || null,
        stripeAccountId: doc?.stripeAccountId || null,
      });
    };

    if (!q) {
      // Default: list recent users from Firestore
      let snap: any = null;
      try {
        snap = await db.collection('users').orderBy('createdAt', 'desc').limit(limit).get();
      } catch {
        snap = await db.collection('users').limit(limit).get();
      }

      const uids = snap.docs.map((d: any) => d.id);
      // Fetch auth records in parallel (bounded by limit<=50)
      await Promise.all(uids.map((uid: string) => addUser(uid)));
      return json({ ok: true, users: results });
    }

    // Email search
    if (q.includes('@')) {
      try {
        const au = await auth.getUserByEmail(q);
        await addUser(au.uid, au);
        return json({ ok: true, users: results });
      } catch {
        // Fallback: Firestore prefix search on email
        const start = q.toLowerCase();
        const end = start + '\uf8ff';
        let snap: any = null;
        try {
          snap = await db.collection('users').orderBy('email').startAt(start).endAt(end).limit(limit).get();
        } catch {
          snap = await db.collection('users').limit(limit).get();
        }
        const uids = snap.docs.map((d: any) => d.id);
        await Promise.all(uids.map((uid: string) => addUser(uid)));
        return json({ ok: true, users: results });
      }
    }

    // UID direct lookup
    if (q.length >= 16) {
      try {
        const au = await auth.getUser(q);
        await addUser(au.uid, au);
        return json({ ok: true, users: results });
      } catch {
        // continue to fallback
      }
    }

    // Fallback: displayName/email prefix search in Firestore (best-effort)
    const start = q.toLowerCase();
    const end = start + '\uf8ff';
    let snap: any = null;
    try {
      snap = await db.collection('users').orderBy('displayName').startAt(start).endAt(end).limit(limit).get();
    } catch {
      try {
        snap = await db.collection('users').orderBy('email').startAt(start).endAt(end).limit(limit).get();
      } catch {
        snap = await db.collection('users').limit(limit).get();
      }
    }
    const uids = snap.docs.map((d: any) => d.id);
    await Promise.all(uids.map((uid: string) => addUser(uid)));
    return json({ ok: true, users: results });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to lookup users', message: e?.message }, { status: 500 });
  }
}

