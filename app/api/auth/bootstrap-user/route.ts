/**
 * POST /api/auth/bootstrap-user
 *
 * Ensures a Firestore `users/{uid}` doc exists for the currently authenticated user.
 * Also maintains:
 * - `publicProfiles/{uid}` (safe subset for public reads)
 * - `userSummaries/{uid}` (admin directory)
 *
 * Why:
 * - Admin Users UI relies on Firestore users + userSummaries.
 * - Some environments/rules can prevent client-side creation, leaving admin tools empty.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { buildUserSummary } from '@/lib/admin/userSummary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request) {
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

  const uid = String(decoded?.uid || '');
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const now = Timestamp.now();
    const [authUser, userSnap] = await Promise.all([
      auth.getUser(uid),
      db.collection('users').doc(uid).get(),
    ]);

    const existing = userSnap.exists ? (userSnap.data() as any) : null;

    // Minimal canonical user doc fields (safe defaults; expand later via Account settings).
    const baseUserDoc: any = {
      userId: uid,
      email: authUser.email || existing?.email || '',
      emailVerified: authUser.emailVerified === true,
      displayName: authUser.displayName || existing?.displayName || existing?.profile?.fullName || '',
      photoURL: authUser.photoURL || existing?.photoURL || null,
      phoneNumber: authUser.phoneNumber || existing?.phoneNumber || null,
      subscriptionTier: existing?.subscriptionTier || 'standard',
      profile: {
        ...(existing?.profile || {}),
        fullName: existing?.profile?.fullName || authUser.displayName || '',
        location: {
          ...(existing?.profile?.location || {}),
          city: existing?.profile?.location?.city || '',
          state: existing?.profile?.location?.state || '',
          zip: existing?.profile?.location?.zip || '',
        },
      },
      createdAt: userSnap.exists ? (existing?.createdAt || now) : now,
      updatedAt: now,
      lastLoginAt: now,
    };

    // Upsert users doc
    await db.collection('users').doc(uid).set(baseUserDoc, { merge: true });

    // Upsert public profile mirror (never include email/phone/stripe ids)
    const publicProfile: any = {
      userId: uid,
      displayName: baseUserDoc.displayName || '',
      photoURL: baseUserDoc.photoURL || null,
      profile: {
        fullName: baseUserDoc.profile?.fullName || baseUserDoc.displayName || '',
        businessName: baseUserDoc.profile?.businessName || '',
        location: {
          city: baseUserDoc.profile?.location?.city || '',
          state: baseUserDoc.profile?.location?.state || '',
        },
      },
      createdAt: userSnap.exists ? (existing?.createdAt || now) : now,
      updatedAt: now,
    };
    await db.collection('publicProfiles').doc(uid).set(publicProfile, { merge: true });

    // Warm admin directory summary
    const summary = buildUserSummary({ uid, authUser, userDoc: { ...(existing || {}), ...(baseUserDoc || {}) }, now: now.toDate() });
    await db.collection('userSummaries').doc(uid).set(summary as any, { merge: true });

    return json({ ok: true, created: !userSnap.exists, uid });
  } catch (e: any) {
    return json({ ok: false, error: 'Bootstrap failed', message: e?.message || String(e) }, { status: 500 });
  }
}

