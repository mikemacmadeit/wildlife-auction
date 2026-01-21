/**
 * GET /api/admin/stripe/balance
 *
 * Admin-only: returns Stripe platform account + balance snapshot for the configured STRIPE_SECRET_KEY.
 * This is used to debug "dashboard shows funds but transfers fail" (usually key/account mismatch).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';

export async function GET(request: Request) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  if (!isStripeConfigured() || !stripe) {
    return json({ ok: false, error: 'Stripe is not configured (missing STRIPE_SECRET_KEY)' }, { status: 503 });
  }

  try {
    const acct = (await stripe.accounts.retrieve()) as any;
    const bal = (await stripe.balance.retrieve()) as any;

    const norm = (arr: any[]) =>
      (Array.isArray(arr) ? arr : []).map((x: any) => ({
        currency: String(x?.currency || '').toLowerCase(),
        amount: typeof x?.amount === 'number' ? x.amount : Number(x?.amount || 0),
      }));

    const available = norm(bal?.available);
    const pending = norm(bal?.pending);

    const availableUsdCents = available.find((x: any) => x.currency === 'usd')?.amount ?? 0;
    const pendingUsdCents = pending.find((x: any) => x.currency === 'usd')?.amount ?? 0;

    return json({
      ok: true,
      platformAccountId: acct?.id,
      platformLivemode: acct?.livemode,
      balance: {
        available,
        pending,
        availableUsdCents,
        pendingUsdCents,
      },
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: 'Failed to retrieve Stripe balance',
        message: e?.message || 'Unknown error',
        stripe: {
          type: e?.type,
          code: e?.code,
          requestId: e?.requestId,
          requestLogUrl: (e?.raw as any)?.request_log_url,
        },
      },
      { status: 500 }
    );
  }
}

