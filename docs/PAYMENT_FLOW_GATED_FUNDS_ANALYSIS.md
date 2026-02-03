# AgChange Payment Flow: Gated Funds Feasibility Analysis

**Date:** February 2025  
**Scope:** Current payment implementation, MoR determination, feasibility of "authorize at checkout → capture at delivery-confirmation → payout seller after capture"

---

## 1. Where Payments Are Implemented

| File | Purpose |
|------|---------|
| `app/api/stripe/checkout/create-session/route.ts` | Creates Stripe Checkout Session for card/ACH/wire; sets `payment_intent_data` with destination charge + application fee |
| `app/api/stripe/wire/create-intent/route.ts` | Creates PaymentIntent for wire/bank transfer; same destination charge pattern |
| `app/api/stripe/webhook/route.ts` | Stripe webhook endpoint; verifies signature, routes events to handlers |
| `app/api/stripe/webhook/handlers.ts` | Handles `checkout.session.completed`, `checkout.session.async_payment_succeeded/failed`, `payment_intent.succeeded` (wire), `charge.dispute.*` |
| `app/api/stripe/refunds/process/route.ts` | Admin-only refund endpoint; creates Stripe refund, updates order |
| `lib/stripe/config.ts` | Stripe client, `calculatePlatformFee`, policy comments |

---

## 2. Current End-to-End Payment Sequence

1. **Buyer clicks "Pay" / "Buy Now"**  
   - Client calls `POST /api/stripe/checkout/create-session` with `{ listingId, paymentMethod, quantity?, ... }`

2. **create-session route** (`create-session/route.ts` lines 619–687)  
   - Validates listing, seller payout readiness, Texas-only rules  
   - Calls `stripe.checkout.sessions.create()` with:
     - `payment_intent_data.application_fee_amount: platformFee` (10%)
     - `payment_intent_data.transfer_data.destination: sellerStripeAccountId`
     - **No** `capture_method` → **automatic capture**
   - Returns `sessionId` + `url`; redirects buyer to Stripe Checkout

3. **Buyer completes payment on Stripe**  
   - Stripe charges card / initiates ACH / shows wire instructions  
   - Stripe **captures immediately** (default)  
   - Stripe **transfers** to seller Connect account and platform fee in one step

4. **Stripe webhook: `checkout.session.completed`** (or `async_payment_succeeded` for bank rails)  
   - `handleCheckoutSessionCompleted` / `handleCheckoutSessionAsyncPaymentSucceeded`  
   - Creates order in `orders` collection  
   - Sets `status: 'paid_held' | 'paid'`, `transactionStatus`, `paidAt`, `stripePaymentIntentId`, `stripeCheckoutSessionId`  
   - Marks listing sold, reserves inventory  
   - **No** capture call; payment already captured by Stripe

5. **Delivery flow**  
   - `POST /api/delivery/complete-delivery` (driver: PIN + signature + photo)  
   - `POST /api/orders/[orderId]/confirm-receipt` (buyer confirms)  
   - Both set `transactionStatus: 'COMPLETED'`, `buyerConfirmedAt`  
   - **No** Stripe calls; payment was captured at step 3

---

## 3. Merchant of Record Determination

**MoR: Platform (AgChange)**

Evidence:

- Charges are created on the platform’s Stripe account.
- `payment_intent_data.transfer_data.destination` routes funds to the seller’s Connect account.
- Platform fee is taken via `application_fee_amount`.
- `lib/stripe/config.ts` lines 5–8: “Funds are always direct from buyer to seller. We use Stripe Connect destination charges… The app never holds or releases funds.”
- `docs/PAYMENT_PROCESSOR_BRIEF.md`: “The platform never receives the full payment and never performs a release or transfer to the seller. Sellers are paid at payment time by Stripe.”

---

## 4. Gating Readiness Score: 2/10

**Current state:** Gating is **not possible** without design and code changes.

**Reason:** Sellers are paid **immediately** when the buyer pays. Funds are captured and transferred at payment time; there is no authorization-only step and no delayed payout.

| Aspect | Current | Required for gating |
|--------|---------|----------------------|
| Capture timing | Automatic (immediate) | Manual (authorize now, capture later) |
| Seller payout | At payment (destination charge) | After capture (same destination charge, but capture triggered by delivery) |
| `capture_method` | Not set (default automatic) | `capture_method: 'manual'` |
| Webhook logic | Treats payment as complete | Must treat as “authorized only” until delivery confirmation |
| Capture trigger | N/A | Call `paymentIntents.capture()` on delivery confirmation |

---

## 5. Minimum Changes to Support Gated Delivery

### 5.1 Checkout: Add manual capture

**File:** `app/api/stripe/checkout/create-session/route.ts`  

In `payment_intent_data`:

```ts
payment_intent_data: {
  capture_method: 'manual',  // NEW: authorize only; capture on delivery confirmation
  application_fee_amount: platformFee,
  transfer_data: { destination: sellerStripeAccountId },
  metadata: { ... },
},
```

**File:** `app/api/stripe/wire/create-intent/route.ts`  

In `stripe.paymentIntents.create()`:

```ts
capture_method: 'manual',  // NEW
```

### 5.2 Webhook: Treat payment as authorized, not captured

**File:** `app/api/stripe/webhook/handlers.ts`  

In `handleCheckoutSessionCompleted` / `handleCheckoutSessionAsyncPaymentSucceeded`:

- Read PaymentIntent and check `status === 'requires_capture'` (authorized, not captured).
- Create order with:
  - `paymentStatus: 'authorized'` (new field)
  - `capturedAt: null`
  - `transactionStatus` / `status` unchanged
- Do **not** treat as fully paid from a funds perspective; seller has not been paid yet.

### 5.3 New event: `payment_intent.requires_capture`

**File:** `app/api/stripe/webhook/route.ts`  

Add handler for `payment_intent.requires_capture` (or ensure `checkout.session.completed` correctly handles authorized-only sessions).

### 5.4 Capture on delivery confirmation

**File:** `app/api/delivery/complete-delivery/route.ts`  

Before or after updating order to `COMPLETED`:

```ts
const order = await orderRef.get();
const piId = order.data()?.stripePaymentIntentId;
if (piId) {
  await stripe.paymentIntents.capture(piId);
}
await orderRef.update({ capturedAt: now, paymentStatus: 'captured', ... });
```

**File:** `app/api/orders/[orderId]/confirm-receipt/route.ts`  

Same logic when buyer confirms receipt (for flows that don’t go through complete-delivery).

### 5.5 New DB fields (orders)

| Field | Type | Purpose |
|-------|------|---------|
| `paymentStatus` | `'authorized' \| 'captured' \| 'refunded' \| 'canceled'` | Explicit payment lifecycle |
| `capturedAt` | `Date \| null` | When capture happened (used as trigger for payout) |

### 5.6 Refund behavior

- **Authorized only:** Call `paymentIntents.cancel()` instead of refund.
- **Already captured:** Use existing `stripe.refunds.create()` flow.

### 5.7 Underwriting-safe language

- Avoid: “escrow,” “hold,” “release,” “funds held.”
- Prefer: “authorization at checkout,” “capture at delivery confirmation,” “payment completes when buyer confirms receipt.”

---

## 6. Risk/Edge Cases to Handle

| Risk | Mitigation |
|------|------------|
| **Auth expiry** | Card auth typically expires in 7 days. Capture before expiry or cancel. Consider shorter delivery windows or proactive messaging. |
| **Partial fulfillment** | Multi-quantity orders: capture only for fulfilled units; partial capture supported by `paymentIntents.capture({ amount_to_capture })`. |
| **Order cancelled before delivery** | Call `paymentIntents.cancel()`; no capture, no transfer. |
| **Refund after capture** | Same as today: `stripe.refunds.create()`; seller already received funds, may need platform or seller to cover. |
| **Chargebacks** | Same as today: Stripe dispute flow; with destination charges, funds already transferred to seller. |
| **Wire/ACH timing** | Wire uses `paymentIntents.create` with `confirm: true`; bank transfers settle later. Manual capture may need special handling for these rails. |
| **Async payment (bank transfer)** | `checkout.session.async_payment_succeeded` fires when funds land. With manual capture, PaymentIntent may already be in `requires_capture`; clarify whether bank transfers support manual capture in your flows. |

---

## Current Flow Diagram (Exact Objects/Routes)

```
[Buyer] → POST /api/stripe/checkout/create-session
          → stripe.checkout.sessions.create(payment_intent_data:
               application_fee_amount, transfer_data.destination,
               NO capture_method → automatic)
          → Redirect to Stripe Checkout

[Stripe] → Charge card / initiate ACH / wire
          → CAPTURE IMMEDIATELY (default)
          → Transfer to seller Connect + platform fee

[Stripe] → Webhook: checkout.session.completed
          → handlers.handleCheckoutSessionCompleted
          → Create order (orders/{orderId})
          → status: paid_held/paid, paidAt: now
          → Mark listing sold

[Driver] → POST /api/delivery/complete-delivery (PIN + signature)
          → Update order: transactionStatus: COMPLETED
          → NO Stripe capture (already captured)

[Buyer]  → POST /api/orders/[orderId]/confirm-receipt
          → Update order: transactionStatus: COMPLETED
          → NO Stripe capture (already captured)
```

---

## Verdict

| Question | Answer |
|----------|--------|
| **Already possible with small changes?** | ❌ No |
| **Requires redesign?** | ⚠️ Moderate redesign: checkout config, webhook semantics, capture trigger, and DB fields |
| **Main blocker** | Immediate capture + immediate transfer to seller; no authorization-only step today |
| **Minimum path** | Add `capture_method: 'manual'`, capture on delivery confirmation, treat “authorized” vs “captured” in order state and UI |
