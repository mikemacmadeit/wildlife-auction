/**
 * GET /api/admin/stripe-events
 *
 * Admin-only: fetch recent Stripe webhook events for Health tab "Stripe Webhook Events".
 * Returns latest 50 stripeEvents ordered by createdAt desc.
 */
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { assertInt32 } from '@/lib/debug/int32Tripwire';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMIT = 50;

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') {
    const d = v.toDate();
    return d instanceof Date ? d.toISOString() : null;
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
  return null;
}

export async function GET(request: Request) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { db } = admin.ctx;

  try {
    const safeLimit = Math.min(LIMIT, 100);
    assertInt32(safeLimit, 'Firestore.limit');

    const snap = await db
      .collection('stripeEvents')
      .orderBy('createdAt', 'desc')
      .limit(safeLimit)
      .get();

    const events = snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        eventId: d.id,
        type: String(data.type || ''),
        status: data.status ?? 'processed',
        createdAt: tsToIso(data.createdAt),
        processedAt: tsToIso(data.processedAt),
        errorMessage: data.errorMessage ?? null,
        checkoutSessionId: data.checkoutSessionId ?? null,
        paymentIntentId: data.paymentIntentId ?? null,
        disputeId: data.disputeId ?? null,
      };
    });

    return json({ ok: true, events });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'Failed to fetch stripe events' }, { status: 500 });
  }
}
