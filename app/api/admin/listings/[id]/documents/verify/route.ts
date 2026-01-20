/**
 * POST /api/admin/listings/[id]/documents/verify
 * 
 * Admin-only: Verify or reject a compliance document
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, dev bundling can attempt to resolve a missing internal Next module
// (`next/dist/server/web/exports/next-response`) and crash compilation.
// Route handlers work fine with standard Web `Request` / `Response`.
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, json } from '@/app/api/admin/_util';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await requireAdmin(request);
    if (!admin.ok) {
      if (admin.response.status === 401) return json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
      if (admin.response.status === 403) return json({ error: 'Forbidden - Admin access required' }, { status: 403 });
      return admin.response;
    }

    const adminId = admin.ctx.actorUid;
    const db = admin.ctx.db;

    const listingId = params.id;
    const body = await request.json();
    const { documentId, status, rejectionReason } = body;

    if (!documentId || !status) {
      return json({ error: 'documentId and status are required' }, { status: 400 });
    }

    if (!['verified', 'rejected'].includes(status)) {
      return json({ error: 'status must be "verified" or "rejected"' }, { status: 400 });
    }

    if (status === 'rejected' && (!rejectionReason || String(rejectionReason).trim().length === 0)) {
      return json({ error: 'rejectionReason is required when rejecting a document' }, { status: 400 });
    }

    // Update document
    const docRef = db.collection('listings').doc(listingId).collection('documents').doc(documentId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return json({ error: 'Document not found' }, { status: 404 });
    }

    const updateData: Record<string, any> = {
      status,
      verifiedBy: adminId,
      verifiedAt: Timestamp.now(),
    };

    // Never write undefined to Firestore. Only include rejectionReason when rejecting; clear otherwise.
    if (status === 'rejected') {
      updateData.rejectionReason = String(rejectionReason).trim();
    } else {
      updateData.rejectionReason = null;
    }

    await docRef.update(updateData);

    // If TPWD_BREEDER_PERMIT is verified, update listing compliance status
    const docData = docSnap.data()!;
    if (docData.type === 'TPWD_BREEDER_PERMIT' && status === 'verified') {
      const listingRef = db.collection('listings').doc(listingId);
      await listingRef.update({
        complianceStatus: 'approved',
        complianceReviewedBy: adminId,
        complianceReviewedAt: Timestamp.now(),
      });
    }

    // Seller-level badge: TPWD breeder permit verified (public seller trust doc).
    if (docData.type === 'TPWD_BREEDER_PERMIT') {
      try {
        const listingSnap = await db.collection('listings').doc(listingId).get();
        const listing = listingSnap.exists ? (listingSnap.data() as any) : null;
        const sellerId = listing?.sellerId ? String(listing.sellerId) : '';

        if (sellerId) {
          // Prefer explicit doc expiresAt, fallback to listing attributes.
          const expiresAtRaw = docData?.expiresAt || listing?.attributes?.tpwdPermitExpirationDate || null;
          const expiresAt: Date | null =
            expiresAtRaw?.toDate?.() || (expiresAtRaw instanceof Date ? expiresAtRaw : null);
          const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;

          const trustRef = db.collection('publicSellerTrust').doc(sellerId);
          const trustSnap = await trustRef.get();
          const existing = trustSnap.exists ? (trustSnap.data() as any) : {};
          const prev: string[] = Array.isArray(existing?.badgeIds) ? existing.badgeIds : [];
          const next = new Set(prev.filter((b) => b !== 'tpwd_breeder_permit_verified'));

          if (status === 'verified' && !isExpired) next.add('tpwd_breeder_permit_verified');

          await trustRef.set(
            {
              userId: sellerId,
              badgeIds: Array.from(next),
              tpwdBreederPermit: {
                status,
                verifiedAt: Timestamp.now(),
                ...(expiresAt ? { expiresAt: Timestamp.fromDate(expiresAt) } : {}),
              },
              updatedAt: Timestamp.now(),
            },
            { merge: true }
          );
        }
      } catch (e) {
        console.error('Failed to update publicSellerTrust TPWD badge', e);
      }
    }

    return json({
      success: true,
      message: `Document ${status}`,
    });
  } catch (error: any) {
    console.error('Error verifying document:', error);
    return json({ error: error.message || 'Failed to verify document' }, { status: 500 });
  }
}
