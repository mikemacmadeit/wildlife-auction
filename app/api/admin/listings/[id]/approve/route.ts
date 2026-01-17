/**
 * POST /api/admin/listings/[id]/approve
 * Admin-only: approves a pending listing and notifies the seller.
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

  const listingRef = db.collection('listings').doc(listingId);
  const snap = await listingRef.get();
  if (!snap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

  const listing = snap.data() as any;
  const sellerId = String(listing?.sellerId || '');
  const title = String(listing?.title || 'Listing');
  if (!sellerId) return json({ ok: false, error: 'Listing is missing sellerId' }, { status: 400 });

  // Whitetail breeder: require compliance approval first.
  if (listing?.category === 'whitetail_breeder' && listing?.complianceStatus !== 'approved') {
    return json(
      {
        ok: false,
        error: 'Compliance review required',
        message: 'Whitetail breeder listings require compliance approval before admin approval.',
      },
      { status: 400 }
    );
  }

  await listingRef.update({
    status: 'active',
    complianceStatus: listing?.complianceStatus === 'pending_review' ? 'approved' : listing?.complianceStatus || 'none',
    approvedBy: uid,
    approvedAt: Timestamp.now(),
    publishedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  });

  // Create in-app notification (server-only).
  const notifRef = db.collection('users').doc(sellerId).collection('notifications').doc();
  await notifRef.set({
    userId: sellerId,
    type: 'listing_approved',
    title: 'Listing approved',
    body: `Your listing “${title}” is now live.`,
    read: false,
    createdAt: Timestamp.now(),
    linkUrl: `/listing/${listingId}`,
    linkLabel: 'View listing',
    listingId,
    metadata: { status: 'active' },
  });

  return json({ ok: true });
}

