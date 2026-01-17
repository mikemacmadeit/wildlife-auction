/**
 * POST /api/admin/listings/[id]/reject
 * Admin-only: rejects a listing and notifies the seller.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { isAdminUid } from '@/app/api/admin/notifications/_admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const listingId = String(ctx?.params?.id || '').trim();
  if (!listingId) return json({ ok: false, error: 'Missing listingId' }, { status: 400 });

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const authHeader = req.headers.get('authorization');
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

  const body = await req.json().catch(() => ({}));
  const reason = String(body?.reason || '').trim();

  const listingRef = db.collection('listings').doc(listingId);
  const snap = await listingRef.get();
  if (!snap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

  const listing = snap.data() as any;
  const sellerId = String(listing?.sellerId || '');
  const title = String(listing?.title || 'Listing');
  if (!sellerId) return json({ ok: false, error: 'Listing is missing sellerId' }, { status: 400 });

  await listingRef.update({
    status: 'removed',
    rejectedBy: uid,
    rejectedAt: Timestamp.now(),
    rejectionReason: reason || undefined,
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  });

  const bodyText = reason
    ? `Your listing “${title}” was rejected. Reason: ${reason}`
    : `Your listing “${title}” was rejected.`;

  const notifRef = db.collection('users').doc(sellerId).collection('notifications').doc();
  await notifRef.set({
    userId: sellerId,
    type: 'listing_rejected',
    title: 'Listing rejected',
    body: bodyText,
    read: false,
    createdAt: Timestamp.now(),
    linkUrl: `/seller/listings/${listingId}/edit`,
    linkLabel: 'Edit listing',
    listingId,
    metadata: { status: 'removed', reason: reason || undefined },
  });

  return json({ ok: true });
}

