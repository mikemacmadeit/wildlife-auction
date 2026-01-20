/**
 * POST /api/admin/orders/[orderId]/release
 *
 * Admin-only: release held funds to the seller by creating a Stripe Transfer.
 * This is the canonical manual-release endpoint.
 */
import { validateRequest } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { releasePaymentForOrder } from '@/lib/stripe/release-payment';
import { createAuditLog } from '@/lib/audit/logger';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';
import { Timestamp } from 'firebase-admin/firestore';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(request: Request, { params }: { params: { orderId: string } }) {
  try {
    if (!isStripeConfigured() || !stripe) {
      return json({ error: 'Stripe is not configured' }, { status: 503 });
    }

    // Rate limiting (admin)
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    const auth = getAdminAuth();
    const db = getAdminDb();

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await auth.verifyIdToken(token);
    const adminId = decoded.uid;

    // Verify admin role (server-side)
    const adminDoc = await db.collection('users').doc(adminId).get();
    const role = adminDoc.exists ? (adminDoc.data() as any)?.role : null;
    if (!(role === 'admin' || role === 'super_admin')) {
      return json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const orderId = params.orderId;

    // Release using shared logic (includes buyer-confirm + delivery + hold/dispute/chargeback gates)
    const result = await releasePaymentForOrder(db as any, orderId, adminId);
    if (!result.success) {
      return json({ error: result.error || 'Failed to release funds' }, { status: 400 });
    }

    // Audit log (explicit admin action)
    await createAuditLog(db as any, {
      actorUid: adminId,
      actorRole: 'admin',
      actionType: 'payout_released_manual',
      orderId,
      beforeState: {},
      afterState: { stripeTransferId: result.transferId },
      metadata: { transferId: result.transferId, amount: result.amount },
      source: 'admin_ui',
    });

    // Timeline (server-authored, idempotent).
    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId,
        event: {
          id: `FUNDS_RELEASED:${result.transferId}`,
          type: 'FUNDS_RELEASED',
          label: 'Funds released to seller',
          actor: 'admin',
          visibility: 'buyer',
          timestamp: Timestamp.now(),
          meta: { transferId: result.transferId, amount: result.amount },
        },
      });
    } catch {
      // best-effort
    }

    return json({
      success: true,
      orderId,
      transferId: result.transferId,
      amount: result.amount,
      message: result.message || 'Funds released successfully',
    });
  } catch (error: any) {
    console.error('Error releasing order funds:', error);
    return json({ error: 'Failed to release funds', message: error.message }, { status: 500 });
  }
}

