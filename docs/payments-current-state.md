# Wildlife.Exchange Payments — Current State (Evidence-Based)

## A) Quick Summary (Founder-Friendly)

- **What buyers can do today**: Buyers can pay for a listing using **Stripe Checkout** (card payments) for **fixed-price listings**, **accepted offers**, and **auction wins** (if they’re the winning bidder).
- **What sellers receive and when**: Sellers do **not** get paid at the moment the buyer pays. Money is captured into **your platform Stripe account**, then later **released** to the seller’s **Stripe Connect Express** account via a **Stripe Transfer**.
- **Where funds are “held”**: The “hold” is implemented by **not creating the Transfer** until release conditions are met. This is **not Stripe’s delayed capture**—it’s **post-capture**, platform-controlled payout timing.
- **What happens after payment succeeds**: The `checkout.session.completed` webhook **creates an `orders` Firestore record**, marks the listing as **sold**, and sets fields used to control release (dispute deadline, protection window, admin hold flags).

## B) What We Offer Today

### Payment methods offered (buyers)

- **Card only** for marketplace checkout.
  - Evidence: `payment_method_types: ['card']` in checkout session creation.

```447:484:project/app/api/stripe/checkout/create-session/route.ts
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      // ...
      mode: 'payment',
      success_url: `${baseUrl}/dashboard/orders?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: offerId ? `${baseUrl}/listing/${listingId}?offer=${offerId}` : `${baseUrl}/listing/${listingId}`,
      // NO payment_intent_data.transfer_data - funds stay in platform account (payout hold / delayed payout release)
      // Admin will release funds via transfer after delivery confirmation
      metadata: {
        listingId: listingId,
        buyerId: buyerId,
        sellerId: listingData.sellerId,
        sellerStripeAccountId: sellerStripeAccountId,
        // ...
      },
      customer_email: decodedToken.email || undefined,
    };
```

**NOT IMPLEMENTED** (buyers): ACH / bank transfer / wire / “Pay by invoice” rails for marketplace checkout. There are no `payment_method_types` for ACH or bank-based methods in the marketplace checkout route.

### Supported price ranges (what the code enforces)

- **No explicit max/min limits** are enforced in code for checkout amount beyond “must be > 0 and listing/offer must be valid”.
  - Evidence: checkout amount is derived from listing price / accepted offer amount / winning bid server-side (see “C”).
- **Needs verification (Stripe account settings)**: Whether Stripe will allow $5k–$100k card charges depends on your Stripe account risk settings, MCC/category, Radar, and customer authentication requirements—this is not visible in code.

### UI notes (what buyer sees)

- Listing detail page triggers checkout session creation and then redirects to the Stripe-hosted URL.
  - Evidence: `ListingDetailPage` calls `createCheckoutSession(listing!.id)` and uses returned `url`.

```186:227:project/lib/stripe/api.ts
export async function createCheckoutSession(
  listingId: string,
  offerId?: string
): Promise<{ url: string; sessionId: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }
  const token = await getIdToken(user, true);
  const response = await fetch(`${API_BASE}/checkout/create-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ listingId, ...(offerId ? { offerId } : {}) }),
  });
  if (!response.ok) {
    const error = await response.json();
    const errorMessage =
      error.message ||
      (error.code ? `${error.code}: ${error.error || 'Checkout failed'}` : undefined) ||
      error.error ||
      'Failed to create checkout session';
    throw new Error(errorMessage);
  }
  return response.json();
}
```

## C) How Checkout Works (End-to-End)

### Diagram (end-to-end)

Buyer → (Listing page “Buy Now” / “Pay Now”) → `createCheckoutSession()` → `POST /api/stripe/checkout/create-session` → `stripe.checkout.sessions.create(...)` → Stripe-hosted Checkout → `POST /api/stripe/webhook` (`checkout.session.completed`) → Firestore `orders` created → Later: Admin/manual or cron auto-release → `stripe.transfers.create(...)` to seller

### Frontend entrypoints (buttons/components)

- **Listing detail page** triggers checkout:
  - Evidence: `project/app/listing/[id]/page.tsx` calls `createCheckoutSession(...)` (see grep result lines).
  - (I’m not pasting the full page here—this doc focuses on payment plumbing.)

### Backend endpoints / server functions (marketplace payments)

- **Create checkout session**: `POST /api/stripe/checkout/create-session`
  - File: `project/app/api/stripe/checkout/create-session/route.ts`
- **Webhook receiver**: `POST /api/stripe/webhook`
  - File: `project/app/api/stripe/webhook/route.ts`
- **Manual release (admin-only)**: `POST /api/stripe/transfers/release`
  - File: `project/app/api/stripe/transfers/release/route.ts`
- **Auto-release job:** RETIRED. Payments are direct buyer→seller; no platform release. (Historical: `autoReleaseProtected` was removed; health check is informational only.)
- **Refund processing (admin-only)**: `POST /api/stripe/refunds/process`
  - File: `project/app/api/stripe/refunds/process/route.ts`

### Stripe objects created (marketplace checkout)

- **Stripe Checkout Session** with:
  - `mode: 'payment'`
  - `payment_method_types: ['card']`
  - `line_items` containing `unit_amount` derived server-side
  - **metadata** snapshot containing `listingId`, `buyerId`, `sellerId`, `sellerStripeAccountId`, `sellerAmount`, `platformFee`, fee snapshot fields
  - **No** `payment_intent_data.transfer_data` or destination settings (funds stay on platform).

Evidence (no destination charges; platform payout-hold / delayed payout release):

```434:493:project/app/api/stripe/checkout/create-session/route.ts
    // Calculate fees (flat fee for all sellers/categories; never trust client)
    const feePercent = MARKETPLACE_FEE_PERCENT;
    const amount = Math.round(purchaseAmount * 100); // Convert to cents
    const platformFee = calculatePlatformFee(amount);
    const sellerAmount = amount - platformFee;

    // Create Stripe Checkout Session with payout hold (no destination charge)
    // Funds are held in platform account until admin confirms delivery
    const baseUrl = getAppUrl();
    const requiresAddress = animalCategories.includes(listingData.category);

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      // ...
      // NO payment_intent_data.transfer_data - funds stay in platform account (payout hold / delayed payout release)
      // Admin will release funds via transfer after delivery confirmation
      metadata: {
        listingId: listingId,
        buyerId: buyerId,
        sellerId: listingData.sellerId,
        sellerStripeAccountId: sellerStripeAccountId,
        sellerAmount: sellerAmount.toString(),
        platformFee: platformFee.toString(),
        platformFeePercent: feePercent.toString(),
      },
    };
```

### How the purchase amount is determined (server-authoritative)

The server derives the amount from Firestore:
- Offer checkout: accepted offer amount
- Fixed listing: listing price
- Auction: winning bid amount, and the requester must be the winning bidder

Evidence:

```220:289:project/app/api/stripe/checkout/create-session/route.ts
    if (offerId) {
      const accepted = Number(offerData?.acceptedAmount ?? offerData?.currentAmount);
      purchaseAmount = accepted;
    } else if (listingData.type === 'fixed') {
      purchaseAmount = listingData.price;
    } else if (listingData.type === 'auction') {
      const winningBidQuery = await bidsRef
        .where('listingId', '==', listingId)
        .orderBy('amount', 'desc')
        .limit(1)
        .get();
      const winningBidData = winningBidQuery.docs[0].data();
      const winningBidderId = winningBidData.bidderId;
      const winningBidAmount = winningBidData.amount;
      if (winningBidderId !== buyerId) {
        return NextResponse.json({ error: 'You are not the winning bidder' }, { status: 403 });
      }
      purchaseAmount = winningBidAmount;
    }
```

### Database writes

Marketplace order creation happens in the **webhook**, not in the “create session” route:
- `checkout.session.completed` handler creates `orders/{orderId}` and updates `listings/{listingId}` to `sold`.
  - File: `project/app/api/stripe/webhook/handlers.ts`

Evidence (order created as `status: 'paid'`, includes hold/release fields):

```304:340:project/app/api/stripe/webhook/handlers.ts
    const disputeWindowHours = parseInt(process.env.ESCROW_DISPUTE_WINDOW_HOURS || '72', 10);
    const disputeDeadline = new Date(now.getTime() + disputeWindowHours * 60 * 60 * 1000);

    const orderRef = db.collection('orders').doc();
    const orderData: any = {
      listingId,
      buyerId,
      sellerId,
      amount: amount / 100,
      platformFee: platformFee / 100,
      sellerAmount: sellerAmount / 100,
      status: 'paid',
      stripeCheckoutSessionId: checkoutSessionId,
      stripePaymentIntentId: paymentIntentId,
      sellerStripeAccountId: sellerStripeAccountId,
      paidAt: now,
      disputeDeadlineAt: disputeDeadline,
      adminHold: false,
      protectedTransactionDaysSnapshot: protectedTransactionDays,
      payoutHoldReason: payoutHoldReason,
      protectedDisputeStatus: 'none',
    };
```

## D) “Escrow” / Funds Holding Behavior (If Any)

### Is capture immediate or delayed?

- **Capture is immediate** (Stripe Checkout `mode: 'payment'` with no `capture_method: 'manual'` configuration).
  - Evidence: Checkout session is created with `mode: 'payment'` and no `payment_intent_data.capture_method` fields in `project/app/api/stripe/checkout/create-session/route.ts` (see excerpts above).

**NOT IMPLEMENTED**: Stripe “authorize now, capture later” (manual capture) for inspection periods.

### Is payout immediate or delayed?

- **Delayed** by design: you only move money to the seller when you create a **Stripe Transfer** later.
- Release happens via:
  - **Admin manual release** endpoint (admin-only)
  - **Auto-release scheduled function** (every ~10 minutes in Netlify)

Evidence (Transfer creation to connected account):

```202:235:project/lib/stripe/release-payment.ts
    const transfer = await stripe.transfers.create({
      amount: transferAmount,
      currency: 'usd',
      destination: sellerStripeAccountId,
      metadata: {
        orderId: orderId,
        listingId: orderData.listingId,
        buyerId: orderData.buyerId,
        sellerId: orderData.sellerId,
        releasedBy: releasedBy || 'system',
        releaseType: releasedBy ? 'manual' : 'auto',
      },
    });

    await orderRef.update({
      status: 'completed',
      stripeTransferId: transfer.id,
      completedAt: new Date(),
      updatedAt: new Date(),
      releasedBy: releasedBy || 'system',
      releasedAt: new Date(),
    });
```

### Where is the “hold” enforced?

- **In Firestore + release logic**, not in Stripe:
  - `orders.status` + `orders.disputeDeadlineAt` + `orders.protectionEndsAt` + `orders.adminHold` are used to decide if release is allowed.
  - Shared release gate: `releasePaymentForOrder(...)` in `project/lib/stripe/release-payment.ts` checks:
    - open disputes → block
    - admin hold → block
    - protection window active → block
    - TPWD transfer approval requirement (for `whitetail_breeder`) → block until verified doc exists

### What triggers “release”?

- **Buyer accept** sets status to `ready_to_release` for protected transactions (buyer confirmation step):
  - File: `project/app/api/orders/[orderId]/accept/route.ts` (sets `status = 'ready_to_release'` under conditions).
- **Time-based auto-release:** RETIRED. Current model is direct buyer→seller; no platform-held funds or release job.

## E) Webhooks

### Endpoint + signature verification

- Webhook endpoint: `POST /api/stripe/webhook` (`project/app/api/stripe/webhook/route.ts`)
- Signature verification: `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` using `STRIPE_WEBHOOK_SECRET`.

Evidence:

```99:145:project/app/api/stripe/webhook/route.ts
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500, headers: responseHeaders });
    }
    const rawBody = await getRawBody(request);
    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400, headers: responseHeaders });
    }
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error: any) {
      return NextResponse.json({ error: `Webhook signature verification failed: ${error.message}` }, { status: 400, headers: responseHeaders });
    }
```

### Events handled (marketplace payments + disputes)

In `project/app/api/stripe/webhook/route.ts`, events explicitly handled include:
- `checkout.session.completed` → create order, mark listing sold (`handleCheckoutSessionCompleted`)
- `charge.dispute.created/closed/funds_withdrawn/funds_reinstated` → create/update `chargebacks` record; place order on hold; etc.
- `account.updated` → updates Connect onboarding status in Firestore user doc

### Idempotency / duplicate prevention

- Webhook stores processed Stripe event IDs in Firestore `stripeEvents/{eventId}` inside a transaction, and returns early if already processed.
  - Evidence: `project/app/api/stripe/webhook/route.ts` transaction around `stripeEvents` document.

## F) Refunds, Cancellations, Disputes

### Refunds (implemented)

- **Admin-only refund endpoint**: `POST /api/stripe/refunds/process` creates a Stripe refund against `orderData.stripePaymentIntentId` and updates Firestore order fields (`stripeRefundId`, `refundedAt`, `refundReason`, status).
  - File: `project/app/api/stripe/refunds/process/route.ts`
- **Automatic refund for TX-only compliance violations** in webhook:
  - File: `project/app/api/stripe/webhook/handlers.ts` creates `stripe.refunds.create({ payment_intent: ... })` and stores an order with `status: 'refunded'` if buyer is not TX for animal categories.

### Disputes (two different concepts exist)

1) **Platform “order dispute”** (buyer opens dispute inside Wildlife.Exchange):
   - Endpoint: `POST /api/orders/[orderId]/dispute` (`project/app/api/orders/[orderId]/dispute/route.ts`)
   - Effect: sets `orders.status = 'disputed'` and blocks release (and blocks if funds already released).
2) **Stripe chargebacks** (external disputes via card networks):
   - Webhook: `charge.dispute.*` handlers in `project/app/api/stripe/webhook/handlers.ts`
   - Effect: creates `chargebacks/{disputeId}` record and places order on admin hold (`adminHold: true`).

**NOT IMPLEMENTED**: Submitting evidence / responding to Stripe disputes via API (there is no code calling Stripe’s dispute evidence endpoints).

## G) Security & Tampering Risks (P0/P1/P2)

### P0 — Funds release and payout safety

- **Risk**: Release logic uses `stripe.transfers.create(...)` based on `orders.sellerStripeAccountId` and `orders.sellerAmount`. If an attacker (or buggy code path) could ever corrupt those fields, funds could be transferred to the wrong connected account.
  - **Evidence**: release uses `orderData.sellerStripeAccountId` and `orderData.sellerAmount` directly (`project/lib/stripe/release-payment.ts`).
  - **Fix**: On release, re-derive seller account ID from `orders.sellerId → users/{sellerId}.stripeAccountId` and compare; also re-derive seller amount from immutable snapshots (`platformFeeAmount`, `sellerPayoutAmount`) or recompute from `amount` + immutable fee percent.

### P0 — Inconsistent Firebase Admin initialization in money-moving endpoints

- **Risk**: Some Stripe money-moving routes use ad-hoc Admin init patterns (including module-scope init) rather than the hardened `getAdminDb/getAdminAuth`. This can cause production 5xx and/or misconfiguration handling differences.
  - **Evidence**: `project/app/api/stripe/transfers/release/route.ts` and `project/app/api/stripe/refunds/process/route.ts` contain their own `initializeFirebaseAdmin()` logic.
  - **Fix**: Normalize all Stripe routes to use `project/lib/firebase/admin.ts` helpers (same approach as checkout + webhook).

### P1 — No Stripe-side payout-hold primitives / no delayed capture

- **Risk**: Because capture is immediate, your platform is holding customer funds on the platform Stripe balance during the “protection window”. This has operational and compliance implications (refund timing, disputes, negative balances if chargebacks happen after transfer, etc.).
  - **Evidence**: Checkout uses `mode: 'payment'` and “hold” is implemented by delaying transfer (see “D”).
  - **Fix**: Consider PaymentIntents with manual capture for inspection flows, or align business rules and reserves for chargebacks if keeping post-capture holds.

### P1 — High-ticket payment rails missing (ACH/wire)

- **Risk**: $5k–$100k card payments are high-friction and more likely to fail (limits, fraud checks, 3DS). You have no ACH/wire path in marketplace checkout.
  - **Evidence**: only `payment_method_types: ['card']` for checkout session (see “B”).
  - **Fix**: Add bank transfer rails (see “H”).

### P2 — Connect account readiness blocks checkout globally

- **Risk**: Checkout is blocked if seller is not payout-ready, which may reduce conversions early on.
  - **Evidence**: `SELLER_NOT_PAYOUT_READY` logic in `project/app/api/stripe/checkout/create-session/route.ts` around `isPayoutReady`.
  - **Fix**: Consider allowing payment into platform payout hold even if seller onboarding incomplete, but prevent release until seller finishes Connect onboarding.

## H) Gaps for High-Ticket Marketplace ($5k–$100k)

### Missing payment rails

- **NOT IMPLEMENTED**: ACH / bank transfer / wire / “pay by invoice” for marketplace orders (only card checkout).
- **NOT IMPLEMENTED**: Split deposits / staged payments.
- **NOT IMPLEMENTED**: Manual capture (authorize now, capture later) for inspection periods.

### Manual release controls (partially implemented)

- **Implemented**: Admin hold + manual release endpoint + scheduled auto-release.
- **Missing**: A first-class “release/refund/partial refund” admin workflow that ties together:
  - Order disputes (platform)
  - Stripe chargebacks (network disputes)
  - Evidence collection and Stripe dispute response

### Verification / risk escalation

- **Implemented**: Seller must be Connect payout-ready before checkout by default.
- **Missing**: Buyer identity / KYC escalation for large transactions, velocity limits, and enhanced fraud checks (no explicit code-level policy beyond email verification gate).

## I) Recommended Next Steps (Prioritized)

### P0 (must fix before real money)

1) **Release hardening**: On release, re-derive and verify `sellerStripeAccountId` and payout amount before creating a transfer.
2) **Unify Admin SDK init** across *all* Stripe routes (checkout + webhook already do it; others should follow).
3) **Add Stripe-side idempotency** on money-moving calls (Transfers/Refunds) using idempotency keys, not only Firestore checks.
4) **Chargeback safety**: ensure no auto-release occurs if a Stripe chargeback is active; verify that `chargebackStatus` is actually written/maintained (currently, `chargebacks` records exist but order field handling is partial).

### P1 (soon)

1) Add ACH/bank rails for high-ticket payments (either Stripe ACH debit, bank transfer, or invoice flow).
2) Consider a “seller not payout-ready” policy change: allow checkout into payout hold but block release until onboarding complete.
3) Build a dedicated admin “Escrow Console” page that shows: paid orders, holds, deadlines, disputes, and one-click release/refund.

### P2 (later)

1) Manual-capture inspection model (if your marketplace terms require a true authorization window).
2) Partial release / partial refunds as first-class workflows (beyond the admin refund endpoint).

## Technical Appendix

### Key Stripe initialization + env vars

- Stripe client initialized server-side from `STRIPE_SECRET_KEY`:

```13:36:project/lib/stripe/config.ts
function getStripeClient(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    typescript: true,
    // Let Stripe use the account's default API version
  });
}
export const stripe = getStripeClient();
export function isStripeConfigured(): boolean {
  return stripe !== null;
}
```

Environment variables referenced in this payment flow include (see `project/env.example`):
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (client)
- `APP_URL` / `NEXT_PUBLIC_APP_URL` / `NETLIFY_URL` / `VERCEL_URL` (callback URLs)
- `ESCROW_DISPUTE_WINDOW_HOURS` (dispute window duration; default 72 hours)

### Stripe API calls used (marketplace flow)

- `stripe.checkout.sessions.create(...)`: `project/app/api/stripe/checkout/create-session/route.ts`
- `stripe.webhooks.constructEvent(...)`: `project/app/api/stripe/webhook/route.ts`
- `stripe.paymentIntents.retrieve(...)`: `project/app/api/stripe/webhook/handlers.ts` (used to get final amount)
- `stripe.transfers.create(...)`: `project/lib/stripe/release-payment.ts`
- `stripe.refunds.create(...)`: `project/app/api/stripe/refunds/process/route.ts` and TX-only refund path in `project/app/api/stripe/webhook/handlers.ts`

