export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/audit/logger';
import { emitAndProcessEventToUsers } from '@/lib/notifications/emitEvent';
import { listAdminRecipientUids } from '@/lib/admin/adminRecipients';
import { getSiteUrl } from '@/lib/site-url';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
}

type SellerPermitStatus = 'pending' | 'verified' | 'rejected';
type SellerPermitDoc = {
  sellerId: string;
  type: 'TPWD_BREEDER_PERMIT';
  status: SellerPermitStatus;
  permitNumber?: string | null;
  documentUrl: string;
  storagePath: string;
  uploadedAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  reviewedAt?: FirebaseFirestore.Timestamp | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
  expiresAt?: FirebaseFirestore.Timestamp | null;
};

async function requireUser(request: Request): Promise<
  | { ok: true; uid: string; auth: ReturnType<typeof getAdminAuth>; db: ReturnType<typeof getAdminDb> }
  | { ok: false; response: Response }
> {
  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return {
      ok: false,
      response: json(
        { ok: false, error: 'Server not configured', code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED', message: e?.message },
        { status: 503 }
      ),
    };
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return { ok: false, response: json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  const token = authHeader.slice('Bearer '.length);

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return { ok: false, response: json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const uid = decoded?.uid as string | undefined;
  if (!uid) return { ok: false, response: json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  return { ok: true, uid, auth, db };
}

function toIso(ts: any): string | null {
  try {
    if (!ts) return null;
    if (typeof ts?.toDate === 'function') return ts.toDate().toISOString();
    if (ts instanceof Date) return ts.toISOString();
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user.ok) return user.response;

  const ref = user.db.collection('sellerPermits').doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) return json({ ok: true, permit: null });

  const data = snap.data() as any;
  return json({
    ok: true,
    permit: {
      sellerId: user.uid,
      status: data?.status || null,
      permitNumber: data?.permitNumber || null,
      documentUrl: data?.documentUrl || null,
      storagePath: data?.storagePath || null,
      rejectionReason: data?.rejectionReason || null,
      expiresAt: toIso(data?.expiresAt),
      uploadedAt: toIso(data?.uploadedAt),
      reviewedAt: toIso(data?.reviewedAt),
      reviewedBy: data?.reviewedBy || null,
      updatedAt: toIso(data?.updatedAt),
    },
  });
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user.ok) return user.response;

  const body = await request.json().catch(() => ({}));
  const documentUrl = typeof body?.documentUrl === 'string' ? body.documentUrl.trim() : '';
  const storagePath = typeof body?.storagePath === 'string' ? body.storagePath.trim() : '';
  const permitNumber = typeof body?.permitNumber === 'string' ? body.permitNumber.trim() : '';
  const expiresAtIso = typeof body?.expiresAt === 'string' ? body.expiresAt.trim() : '';

  if (!documentUrl || !storagePath) {
    return json({ ok: false, error: 'documentUrl and storagePath are required' }, { status: 400 });
  }

  // Prevent writing arbitrary storage paths.
  if (!storagePath.startsWith(`seller-permits/${user.uid}/`)) {
    return json({ ok: false, error: 'Invalid storagePath' }, { status: 400 });
  }

  const expiresAt = expiresAtIso ? new Date(expiresAtIso) : null;
  if (expiresAtIso && Number.isNaN(expiresAt?.getTime() || NaN)) {
    return json({ ok: false, error: 'expiresAt must be an ISO date string' }, { status: 400 });
  }

  const ref = user.db.collection('sellerPermits').doc(user.uid);
  const now = Timestamp.now();

  const next: SellerPermitDoc = {
    sellerId: user.uid,
    type: 'TPWD_BREEDER_PERMIT',
    status: 'pending',
    permitNumber: permitNumber ? permitNumber : null,
    documentUrl,
    storagePath,
    uploadedAt: now,
    updatedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    ...(expiresAt ? { expiresAt: Timestamp.fromDate(expiresAt) } : {}),
  };

  await ref.set(next, { merge: true });

  // Audit log (best-effort).
  try {
    await createAuditLog(user.db as any, {
      actorUid: user.uid,
      actorRole: 'seller',
      actionType: 'seller_breeder_permit_submitted',
      targetUserId: user.uid,
      afterState: { status: 'pending', permitNumber: permitNumber || null, storagePath },
      source: 'seller_ui',
    });
  } catch {
    // ignore
  }

  // Admin notification (best-effort): alert admins immediately (in-app + email) that a new breeder permit is ready to review.
  try {
    const adminUids = await listAdminRecipientUids(user.db as any);
    if (adminUids.length > 0) {
      const baseUrl = getSiteUrl();
      const adminComplianceUrl = `${baseUrl}/dashboard/admin/compliance?tab=breeder_permits`;

      // Fetch seller display name for notification
      let sellerName: string | undefined;
      try {
        const profileSnap = await user.db.collection('users').doc(user.uid).get();
        const profile = profileSnap.exists ? (profileSnap.data() as any) : null;
        sellerName = profile?.displayName || profile?.profile?.fullName || profile?.profile?.businessName || undefined;
      } catch {
        // ignore
      }

      await emitAndProcessEventToUsers({
        type: 'Admin.BreederPermit.Submitted',
        actorId: user.uid,
        entityType: 'user',
        entityId: user.uid,
        targetUserIds: adminUids,
        payload: {
          type: 'Admin.BreederPermit.Submitted',
          sellerId: user.uid,
          sellerName: sellerName || undefined,
          permitNumber: permitNumber ? permitNumber : null,
          storagePath,
          documentUrl,
          adminComplianceUrl,
        },
        optionalHash: storagePath,
      });
    }
  } catch {
    // ignore
  }

  return json({ ok: true, status: 'pending' });
}

