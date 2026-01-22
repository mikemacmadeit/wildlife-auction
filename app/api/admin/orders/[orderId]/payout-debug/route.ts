/**
 * GET /api/admin/orders/[orderId]/payout-debug
 *
 * Admin-only payout debug endpoint:
 * - Loads the order from Firestore
 * - Loads seller stripeAccountId (Connect) from user doc
 * - If order has stripeTransferId, retrieves the Stripe Transfer
 * - Otherwise scans recent transfers and tries to find one with metadata.orderId == orderId
 * - Returns connected account balance + recent payouts (best-effort)
 *
 * This helps diagnose cases where a seller reports "available balance" but Ops still shows the order.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireAdmin, json } from '@/app/api/admin/_util';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';

export async function GET(request: Request, { params }: { params: { orderId: string } }) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { db } = admin.ctx;

  if (!isStripeConfigured() || !stripe) {
    return json({ ok: false, error: 'Stripe is not configured' }, { status: 503 });
  }

  const orderId = String(params?.orderId || '').trim();
  if (!orderId) return json({ ok: false, error: 'Missing orderId' }, { status: 400 });

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) return json({ ok: false, error: 'Order not found' }, { status: 404 });

  const order = orderSnap.data() as any;
  const sellerId = String(order?.sellerId || '').trim();
  const sellerStripeAccountIdFromOrder = typeof order?.sellerStripeAccountId === 'string' ? order.sellerStripeAccountId : null;
  const stripeTransferId = typeof order?.stripeTransferId === 'string' ? order.stripeTransferId : null;

  let sellerStripeAccountId: string | null = null;
  try {
    if (sellerId) {
      const sellerSnap = await db.collection('users').doc(sellerId).get();
      sellerStripeAccountId = sellerSnap.exists ? (sellerSnap.data() as any)?.stripeAccountId || null : null;
      if (sellerStripeAccountId) sellerStripeAccountId = String(sellerStripeAccountId);
    }
  } catch {
    // ignore
  }

  const result: any = {
    ok: true,
    orderId,
    order: {
      status: order?.status || null,
      listingId: order?.listingId || null,
      buyerId: order?.buyerId || null,
      sellerId: sellerId || null,
      amount: order?.amount ?? null,
      platformFee: order?.platformFee ?? null,
      sellerAmount: order?.sellerAmount ?? null,
      stripePaymentIntentId: order?.stripePaymentIntentId || null,
      stripeCheckoutSessionId: order?.stripeCheckoutSessionId || null,
      stripeTransferId: stripeTransferId,
      releasedAt: order?.releasedAt || null,
      releasedBy: order?.releasedBy || null,
      payoutHoldReason: order?.payoutHoldReason || null,
      adminHold: order?.adminHold === true,
      sellerStripeAccountId: sellerStripeAccountIdFromOrder,
    },
    sellerStripeAccountId: sellerStripeAccountId || sellerStripeAccountIdFromOrder || null,
    stripe: {
      transfer: null as any,
      foundByMetadataScan: null as any,
      platformBalanceUsd: null as any,
      sellerBalanceUsd: null as any,
      sellerPayouts: null as any,
    },
    diagnosis: [] as string[],
  };

  // Platform balance (context)
  try {
    const bal = await stripe.balance.retrieve();
    const avail = Array.isArray((bal as any)?.available) ? (bal as any).available : [];
    const pend = Array.isArray((bal as any)?.pending) ? (bal as any).pending : [];
    const availUsd = avail.find((x: any) => String(x?.currency || '').toLowerCase() === 'usd');
    const pendUsd = pend.find((x: any) => String(x?.currency || '').toLowerCase() === 'usd');
    result.stripe.platformBalanceUsd = {
      availableCents: typeof availUsd?.amount === 'number' ? availUsd.amount : null,
      pendingCents: typeof pendUsd?.amount === 'number' ? pendUsd.amount : null,
    };
  } catch {
    // ignore
  }

  // If order claims transfer, retrieve it.
  if (stripeTransferId) {
    try {
      const transfer = await stripe.transfers.retrieve(stripeTransferId);
      result.stripe.transfer = {
        id: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        destination: (transfer as any).destination || null,
        created: transfer.created,
        reversed: (transfer as any).reversed || false,
        metadata: (transfer as any).metadata || {},
      };
    } catch (e: any) {
      result.diagnosis.push(`Order has stripeTransferId=${stripeTransferId} but Stripe retrieval failed: ${e?.message || String(e)}`);
    }
  } else {
    // No transfer id on the order; scan recent transfers and try to match metadata.orderId.
    try {
      const list = await stripe.transfers.list({ limit: 100 });
      const match = (list.data || []).find((t: any) => String(t?.metadata?.orderId || '') === orderId);
      if (match) {
        result.stripe.foundByMetadataScan = {
          id: match.id,
          amount: match.amount,
          currency: match.currency,
          destination: match.destination || null,
          created: match.created,
          reversed: match.reversed || false,
          metadata: match.metadata || {},
        };
        result.diagnosis.push('Found a Stripe Transfer by scanning recent transfers (metadata.orderId match) but order.stripeTransferId is missing. Ops UI may be stale.');
      } else {
        result.diagnosis.push('No Stripe Transfer found for this order by scanning recent transfers. If seller sees a balance, it may be from another order or Stripe payout schedule.');
      }
    } catch (e: any) {
      result.diagnosis.push(`Failed to scan Stripe transfers: ${e?.message || String(e)}`);
    }
  }

  // Seller connected account balance/payouts (best-effort).
  const acct = result.sellerStripeAccountId as string | null;
  if (acct) {
    try {
      const bal = await stripe.balance.retrieve({ stripeAccount: acct });
      const avail = Array.isArray((bal as any)?.available) ? (bal as any).available : [];
      const pend = Array.isArray((bal as any)?.pending) ? (bal as any).pending : [];
      const availUsd = avail.find((x: any) => String(x?.currency || '').toLowerCase() === 'usd');
      const pendUsd = pend.find((x: any) => String(x?.currency || '').toLowerCase() === 'usd');
      result.stripe.sellerBalanceUsd = {
        availableCents: typeof availUsd?.amount === 'number' ? availUsd.amount : null,
        pendingCents: typeof pendUsd?.amount === 'number' ? pendUsd.amount : null,
      };
    } catch (e: any) {
      result.diagnosis.push(`Failed to read seller Stripe balance: ${e?.message || String(e)}`);
    }

    try {
      const payouts = await stripe.payouts.list({ limit: 10 }, { stripeAccount: acct });
      result.stripe.sellerPayouts = (payouts.data || []).map((p: any) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        arrival_date: p.arrival_date,
        created: p.created,
      }));
    } catch {
      // ignore
    }
  } else {
    result.diagnosis.push('Seller has no stripeAccountId on user doc; they may not be payout-ready.');
  }

  return json(result);
}

