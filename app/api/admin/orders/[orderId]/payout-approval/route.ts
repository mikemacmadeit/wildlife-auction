/**
 * POST /api/admin/orders/[orderId]/payout-approval
 *
 * Admin-only: set/clear `adminPayoutApproval` for policy-driven payout holds.
 * This is a marketplace workflow approval (not regulator approval).
 */
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';

export async function POST(request: Request, { params }: { params: { orderId: string } }) {
  try {
    const rate = await requireRateLimit(request);
    if (!rate.ok) return rate.response;

    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;

    const { db, actorUid } = admin.ctx;
    const orderId = params.orderId;
    if (!orderId) return json({ ok: false, error: 'Missing orderId' }, { status: 400 });

    const body = await request.json().catch(() => ({} as any));
    const approved = body?.approved !== false;

    const orderRef = db.collection('orders').doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) return json({ ok: false, error: 'Order not found' }, { status: 404 });

    const existing = snap.data() as any;
    const existingHold = existing?.payoutHoldReason as string | undefined;

    // If we are approving and the only hold reason is "review required", clear it.
    // (Missing-doc holds are managed separately by doc verification + payout release checks.)
    const reviewHoldReasons = new Set<string>([
      'EXOTIC_CERVID_REVIEW_REQUIRED',
      'ESA_REVIEW_REQUIRED',
      'OTHER_EXOTIC_REVIEW_REQUIRED',
    ]);
    const nextHold = approved && reviewHoldReasons.has(String(existingHold || '')) ? 'none' : existingHold;

    await orderRef.set(
      {
        adminPayoutApproval: approved,
        adminPayoutApprovalBy: actorUid,
        adminPayoutApprovalAt: Timestamp.now(),
        payoutHoldReason: nextHold,
        updatedAt: Timestamp.now(),
        lastUpdatedByRole: 'admin',
      },
      { merge: true }
    );

    return json({ ok: true, orderId, approved });
  } catch (e: any) {
    console.error('Failed to set payout approval:', e);
    return json({ ok: false, error: 'Failed to set payout approval', message: e?.message }, { status: 500 });
  }
}

