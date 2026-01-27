/**
 * POST /api/orders/[orderId]/disputes/open
 * 
 * Buyer opens a protected transaction dispute
 * Requires evidence and validates time windows
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { DisputeReason, DisputeEvidence, TransactionStatus } from '@/lib/types';
import { z } from 'zod';
import { createAuditLog } from '@/lib/audit/logger';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { emitEventToUsers } from '@/lib/notifications';
import { listAdminRecipientUids } from '@/lib/admin/adminRecipients';

const disputeSchema = z.object({
  reason: z.enum(['death', 'serious_illness', 'injury', 'escape', 'wrong_animal']),
  notes: z.string().max(1000).optional(),
  evidence: z.array(z.object({
    type: z.enum(['photo', 'video', 'vet_report', 'delivery_doc', 'tag_microchip']),
    url: z.string().url(),
  })).min(1, 'At least one evidence item is required'),
});

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
    }

    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const buyerId = decodedToken.uid;
    const orderId = params.orderId;

    // Parse and validate request body
    const body = await request.json();
    const validation = disputeSchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { reason, notes, evidence } = validation.data;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Verify buyer owns this order
    if (orderData.buyerId !== buyerId) {
      return json({ error: 'Unauthorized - You can only dispute your own orders' }, { status: 403 });
    }

    // Check if protected transaction is enabled
    if (!orderData.protectedTransactionDaysSnapshot) {
      return json({ error: 'Protected transaction not enabled for this order' }, { status: 400 });
    }

    // Check if delivery was confirmed
    if (!orderData.deliveryConfirmedAt) {
      return json({ error: 'Delivery not confirmed yet' }, { status: 400 });
    }

    // Check if protection window has ended
    if (orderData.protectionEndsAt) {
      const protectionEnds = orderData.protectionEndsAt.toDate();
      if (protectionEnds.getTime() < Date.now()) {
        return json({ error: 'Protection window has ended' }, { status: 400 });
      }
    }

    // Check buyer protection eligibility (before transaction)
    const buyerRef = db.collection('users').doc(buyerId);
    const buyerDoc = await buyerRef.get();
    const buyerData = buyerDoc.exists ? buyerDoc.data() : {};
    
    if (buyerData?.buyerProtectionEligible === false) {
      return json({ error: 'You are not eligible for protected transactions due to previous fraudulent claims' }, { status: 403 });
    }

    // Validate time windows based on reason (before transaction)
    const deliveryConfirmedAt = orderData.deliveryConfirmedAt.toDate();
    const hoursSinceDelivery = (Date.now() - deliveryConfirmedAt.getTime()) / (1000 * 60 * 60);
    
    if (reason === 'death' && hoursSinceDelivery > 48) {
      return json({ error: 'Death claims must be filed within 48 hours of delivery' }, { status: 400 });
    }
    
    if (reason === 'wrong_animal' && hoursSinceDelivery > 24) {
      return json({ error: 'Wrong animal claims must be filed within 24 hours of delivery' }, { status: 400 });
    }
    
    if ((reason === 'injury' || reason === 'escape') && hoursSinceDelivery > 72) {
      return json({ error: `${reason === 'injury' ? 'Injury' : 'Escape'} claims must be filed within 72 hours of delivery` }, { status: 400 });
    }

    // Check evidence requirements (before transaction)
    const hasPhotoOrVideo = evidence.some(e => e.type === 'photo' || e.type === 'video');
    if (!hasPhotoOrVideo) {
      return json({ error: 'At least one photo or video is required' }, { status: 400 });
    }

    // For death/serious_illness, require vet report (can be uploaded later)
    const needsVetReport = (reason === 'death' || reason === 'serious_illness');
    const hasVetReport = evidence.some(e => e.type === 'vet_report');
    
    const disputeStatus = needsVetReport && !hasVetReport ? 'needs_evidence' : 'open';

    // Prepare evidence with timestamps
    const evidenceWithTimestamps: DisputeEvidence[] = evidence.map(e => ({
      type: e.type,
      url: e.url,
      uploadedAt: new Date(),
    }));

    // Capture before state for audit
    const beforeState = {
      protectedDisputeStatus: orderData.protectedDisputeStatus || 'none',
      payoutHoldReason: orderData.payoutHoldReason,
    };

    // FIX-003: Transaction guard to prevent dispute vs delivery race condition
    const now = new Date();
    try {
      await db.runTransaction(async (tx) => {
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists) {
          throw new Error('Order not found');
        }
        const txOrderData = orderSnap.data()!;
        
        // Check if dispute already exists
        if (txOrderData.protectedDisputeStatus && txOrderData.protectedDisputeStatus !== 'none') {
          throw new Error('Dispute already exists');
        }
        
        // Check if already delivered (race condition guard)
        const isDelivered = txOrderData.deliveredAt || 
                           txOrderData.transactionStatus === 'DELIVERED_PENDING_CONFIRMATION' ||
                           txOrderData.transactionStatus === 'COMPLETED' ||
                           ['delivered', 'accepted', 'buyer_confirmed', 'ready_to_release', 'completed'].includes(txOrderData.status);
        
        if (isDelivered) {
          throw new Error('CONFLICT_ALREADY_DELIVERED');
        }
        
        // Update order
        tx.update(orderRef, {
          protectedDisputeStatus: disputeStatus,
          protectedDisputeReason: reason,
          protectedDisputeNotes: notes || null,
          protectedDisputeEvidence: evidenceWithTimestamps,
          disputeOpenedAt: now,
          transactionStatus: 'DISPUTE_OPENED' as TransactionStatus, // NEW: Primary status
          // Populate issues object
          issues: {
            openedAt: now,
            reason: reason,
            notes: notes || undefined,
            photos: evidence.filter(e => e.type === 'photo' || e.type === 'video').map(e => e.url),
          },
          // DEPRECATED: payoutHoldReason kept for backward compatibility (seller already paid immediately)
          payoutHoldReason: 'dispute_open',
          updatedAt: now,
          lastUpdatedByRole: 'buyer',
        });
      });
    } catch (error: any) {
      if (error.message === 'CONFLICT_ALREADY_DELIVERED') {
        return json({ 
          error: 'Cannot open dispute - order is already delivered',
          code: 'CONFLICT_ALREADY_DELIVERED'
        }, { status: 409 });
      }
      if (error.message === 'Dispute already exists') {
        return json({ error: 'Dispute already exists for this order' }, { status: 400 });
      }
      throw error;
    }

    // Increment buyer claims count (outside transaction, best-effort)
    const currentClaimsCount = buyerData?.buyerClaimsCount || 0;
    await buyerRef.update({
      buyerClaimsCount: currentClaimsCount + 1,
      updatedAt: Timestamp.now(),
    }).catch(() => {
      // Non-blocking: claims count update failure shouldn't block dispute creation
    });

    // Create audit log
    await createAuditLog(db, {
      actorUid: buyerId,
      actorRole: 'buyer',
      actionType: 'dispute_opened',
      orderId: orderId,
      listingId: orderData.listingId,
      beforeState,
      afterState: {
        protectedDisputeStatus: disputeStatus,
        payoutHoldReason: 'dispute_open',
        disputeOpenedAt: now,
      },
      metadata: {
        reason,
        evidenceCount: evidence.length,
        needsVetReport: needsVetReport && !hasVetReport,
      },
      source: 'buyer_ui',
    });

    // Notify admins (email + in-app). Non-blocking.
    try {
      const origin = 'https://wildlife.exchange';
      const adminUids = await listAdminRecipientUids(db as any);
      if (adminUids.length > 0) {
        await emitEventToUsers({
          type: 'Admin.Order.DisputeOpened',
          actorId: buyerId,
          entityType: 'order',
          entityId: orderId,
          targetUserIds: adminUids,
          payload: {
            type: 'Admin.Order.DisputeOpened',
            orderId,
            listingId: typeof orderData?.listingId === 'string' ? orderData.listingId : undefined,
            listingTitle: typeof orderData?.listingTitle === 'string' ? orderData.listingTitle : undefined,
            buyerId,
            disputeType: 'protected_transaction_dispute',
            reason,
            adminOpsUrl: `${origin}/dashboard/admin/protected-transactions`,
          },
          optionalHash: `admin_dispute_opened:${orderId}`,
        });
      }
    } catch {
      // ignore
    }

    return json({
      success: true,
      orderId,
      disputeStatus,
      message: disputeStatus === 'needs_evidence' 
        ? 'Dispute opened. Please upload vet report within 48 hours.'
        : 'Dispute opened successfully. Admin will review.',
    });
  } catch (error: any) {
    console.error('Error opening dispute:', error);
    return json({ error: 'Failed to open dispute', message: error.message }, { status: 500 });
  }
}
