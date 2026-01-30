# Payment Policy: Direct Buyer → Seller

**The app never holds or releases funds.** Payments are always **direct from buyer to seller**.

## How it works

- **Stripe Connect destination charges**: When a buyer pays, Stripe routes the payment so that:
  - The **seller’s share** goes directly to the seller’s Stripe Connect account.
  - The **platform fee** (e.g. 10%) goes to the platform account.
- The platform **never** receives the full payment and **never** performs a “release” or transfer to the seller. The seller is paid at payment time by Stripe.

## Implementation

- Checkout: `app/api/stripe/checkout/create-session/route.ts` uses `payment_intent_data.transfer_data.destination` (seller’s Connect account) and `application_fee_amount` (platform fee).
- Wire (bank transfer): `app/api/stripe/wire/create-intent/route.ts` uses the same destination charge pattern.
- There is no “payout release” flow: `releasePayment()` in `lib/stripe/api.ts` is deprecated and throws. No code calls `stripe.transfers.create`.

## Admin / disputes

- **Protected Transactions** and **Compliance** UIs may still show legacy terms like “ready to release” or “payout hold.” These refer to **workflow state** (e.g. protection window ended, dispute closed), not to moving money. Resolving a dispute “in seller’s favor” means “no refund”; the seller already has the funds.
- Refunds (full or partial) are the only case where money moves after payment; those use Stripe’s refund API, not a “release” from the platform to the seller.
