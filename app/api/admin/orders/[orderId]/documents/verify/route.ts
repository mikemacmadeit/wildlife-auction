/**
 * POST /api/admin/orders/[orderId]/documents/verify
 * 
 * Admin-only: Verify or reject an order compliance document
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, dev bundling can attempt to resolve a missing internal Next module
// (`next/dist/server/web/exports/next-response`) and crash compilation.
// Route handlers work fine with standard Web `Request` / `Response`.
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, json } from '@/app/api/admin/_util';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { recomputeOrderComplianceDocsStatus } from '@/lib/orders/complianceDocsStatus';
import { createAuditLog } from '@/lib/audit/logger';

export async function POST(
  request: Request,
  { params }: { params: { orderId: string } }
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

    const orderId = params.orderId;

    // Parse body
    const body = await request.json();
    const { documentId, status, rejectionReason } = body;

    if (!documentId || !status) {
      return json({ error: 'documentId and status are required' }, { status: 400 });
    }

    if (status !== 'verified' && status !== 'rejected') {
      return json({ error: 'status must be "verified" or "rejected"' }, { status: 400 });
    }

    // Get document
    const documentRef = db.collection('orders').doc(orderId).collection('documents').doc(documentId);
    const documentDoc = await documentRef.get();

    if (!documentDoc.exists) {
      return json({ error: 'Document not found' }, { status: 404 });
    }

    const beforeDoc = documentDoc.data() as any;

    // Update document status
    const updateData: any = {
      status,
      verifiedBy: adminId,
      verifiedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    if (status === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    } else if (status === 'verified') {
      updateData.rejectionReason = null;
    }

    await documentRef.update(updateData);

    // Audit log (best-effort).
    try {
      await createAuditLog(db as any, {
        actorUid: adminId,
        actorRole: 'admin',
        actionType: status === 'verified' ? 'admin_order_document_verified' : 'admin_order_document_rejected',
        orderId,
        beforeState: {
          documentId,
          type: beforeDoc?.type,
          status: beforeDoc?.status,
          rejectionReason: beforeDoc?.rejectionReason,
        },
        afterState: {
          documentId,
          type: beforeDoc?.type,
          status,
          ...(status === 'rejected' ? { rejectionReason: String(rejectionReason || '').trim() } : {}),
        },
        metadata: { documentId, type: beforeDoc?.type },
        source: 'admin_ui',
      });
    } catch {
      // ignore
    }

    // If TPWD_TRANSFER_APPROVAL is verified, update order transferPermitStatus
    const documentData = documentDoc.data()!;
    if (documentData.type === 'TPWD_TRANSFER_APPROVAL' && status === 'verified') {
      const orderRef = db.collection('orders').doc(orderId);
      await orderRef.update({
        transferPermitStatus: 'pending_review', // Admin can then approve payout
        updatedAt: Timestamp.now(),
      });

      // Timeline (server-authored, idempotent).
      try {
        await appendOrderTimelineEvent({
          db: db as any,
          orderId,
          event: {
            id: `TRANSFER_PERMIT_APPROVED:${documentId}`,
            type: 'TRANSFER_PERMIT_APPROVED',
            label: 'Transfer permit verified',
            actor: 'admin',
            visibility: 'buyer',
            timestamp: Timestamp.now(),
            meta: { documentId },
          },
        });
      } catch {
        // best-effort
      }
    }

    // If TAHC_CVI is verified/rejected, keep the order's compliance snapshot current and clear/set payout holds (best-effort).
    if (documentData.type === 'TAHC_CVI') {
      const orderRef = db.collection('orders').doc(orderId);

      try {
        const orderSnap = await orderRef.get();
        const existingHold = orderSnap.exists ? (orderSnap.data() as any)?.payoutHoldReason : null;

        // If CVI is now verified, clear the "missing CVI" hold reason (if it was set).
        const nextHold =
          status === 'verified'
            ? (existingHold === 'MISSING_TAHC_CVI' ? 'none' : existingHold)
            : 'MISSING_TAHC_CVI';

        await orderRef.set(
          {
            payoutHoldReason: nextHold,
            updatedAt: Timestamp.now(),
            lastUpdatedByRole: 'admin',
          },
          { merge: true }
        );
      } catch {
        // best-effort
      }

      try {
        await recomputeOrderComplianceDocsStatus({ db: db as any, orderId });
      } catch {
        // best-effort
      }
    }

    return json({
      success: true,
      documentId,
      status,
    });
  } catch (error: any) {
    console.error('Error verifying order document:', error);
    return json({ error: error.message || 'Failed to verify document' }, { status: 500 });
  }
}
