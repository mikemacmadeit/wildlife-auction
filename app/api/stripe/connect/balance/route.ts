/**
 * GET /api/stripe/connect/balance
 *
 * Returns the authenticated seller's Stripe Connect account balance
 * (available and pending funds). Used for "Available to withdraw" display.
 */
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function GET(request: Request) {
  try {
    if (!isStripeConfigured() || !stripe) {
      return json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const auth = getAdminAuth();
    const db = getAdminDb();
    const token = authHeader.slice('Bearer '.length);

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = decodedToken.uid;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return json({ error: 'User not found' }, { status: 404 });

    const stripeAccountId = userDoc.data()?.stripeAccountId;
    if (!stripeAccountId) {
      return json({ availableCents: 0, pendingCents: 0, nextPayoutArrivalDate: null, hasAccount: false });
    }

    const [bal, payoutsRes] = await Promise.all([
      stripe.balance.retrieve({ stripeAccount: stripeAccountId }),
      stripe.payouts.list({ limit: 10 }, { stripeAccount: stripeAccountId }).catch(() => ({ data: [] })),
    ]);

    const avail = Array.isArray((bal as any)?.available) ? (bal as any).available : [];
    const pend = Array.isArray((bal as any)?.pending) ? (bal as any).pending : [];
    const availUsd = avail.find((x: any) => String(x?.currency || '').toLowerCase() === 'usd');
    const pendUsd = pend.find((x: any) => String(x?.currency || '').toLowerCase() === 'usd');

    const availableCents = typeof availUsd?.amount === 'number' ? availUsd.amount : 0;
    const pendingCents = typeof pendUsd?.amount === 'number' ? pendUsd.amount : 0;

    // Find next payout (pending or in_transit)
    let nextArrivalDate: string | null = null;
    for (const p of payoutsRes?.data ?? []) {
      const status = (p as any)?.status;
      const arrival = (p as any)?.arrival_date;
      if ((status === 'pending' || status === 'in_transit') && typeof arrival === 'number') {
        nextArrivalDate = new Date(arrival * 1000).toISOString().slice(0, 10);
        break;
      }
    }

    return json({
      availableCents,
      pendingCents,
      nextPayoutArrivalDate: nextArrivalDate,
      hasAccount: true,
    });
  } catch (error: any) {
    console.error('[stripe/connect/balance]', error);
    return json(
      { error: error?.message || 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}
