/**
 * POST /api/listings/[id]/resubmit
 *
 * Seller-only: resubmit a rejected listing for admin approval.
 *
 * Rules:
 * - Listing must currently be rejected (status: 'removed')
 * - Seller must have edited the listing AFTER the rejection (updatedAt > rejectedAt AND updatedBy == seller)
 * - Can only resubmit once per rejection (resubmittedForRejectionAt must not match rejectedAt)
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const listingId = String(ctx?.params?.id || '').trim();
  if (!listingId) return json({ ok: false, error: 'Missing listing id' }, { status: 400 });

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

  const listingRef = db.collection('listings').doc(listingId);
  const snap = await listingRef.get();
  if (!snap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

  const listing = snap.data() as any;
  const sellerId = String(listing?.sellerId || '');
  if (!sellerId) return json({ ok: false, error: 'Listing is missing sellerId' }, { status: 400 });
  if (sellerId !== uid) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const status = String(listing?.status || '');
  if (status !== 'removed') {
    return json(
      { ok: false, error: 'Not rejected', code: 'NOT_REJECTED', message: 'Only rejected listings can be resubmitted.' },
      { status: 400 }
    );
  }

  const rejectedAt: any = listing?.rejectedAt || null;
  const updatedAt: any = listing?.updatedAt || null;
  const updatedBy = String(listing?.updatedBy || '');
  const resubmittedForRejectionAt: any = listing?.resubmittedForRejectionAt || null;

  if (!rejectedAt || typeof rejectedAt?.toMillis !== 'function') {
    return json(
      {
        ok: false,
        error: 'Missing rejectedAt',
        code: 'MISSING_REJECTION_META',
        message: 'This listing is missing rejection metadata. Please contact support.',
      },
      { status: 400 }
    );
  }

  // Only once per rejection.
  if (resubmittedForRejectionAt && typeof resubmittedForRejectionAt?.toMillis === 'function') {
    if (resubmittedForRejectionAt.toMillis() === rejectedAt.toMillis()) {
      return json(
        {
          ok: false,
          error: 'Already resubmitted',
          code: 'ALREADY_RESUBMITTED',
          message: 'This rejected listing has already been resubmitted for review.',
        },
        { status: 400 }
      );
    }
  }

  // Require seller edits after rejection.
  const updatedAtMs = updatedAt && typeof updatedAt?.toMillis === 'function' ? updatedAt.toMillis() : 0;
  const rejectedAtMs = rejectedAt.toMillis();
  const editedAfterRejection = updatedAtMs > rejectedAtMs && updatedBy === uid;

  if (!editedAfterRejection) {
    return json(
      {
        ok: false,
        error: 'Edit required',
        code: 'MUST_EDIT_BEFORE_RESUBMIT',
        message: 'Please edit and save the listing before resubmitting it for review.',
      },
      { status: 400 }
    );
  }

  await listingRef.update({
    status: 'pending',
    pendingReason: 'admin_approval',
    resubmittedAt: Timestamp.now(),
    resubmittedForRejectionAt: rejectedAt,
    resubmissionCount: FieldValue.increment(1),
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  });

  return json({ ok: true });
}

