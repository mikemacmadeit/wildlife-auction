# PHASE 1 — CODEBASE AUDIT OUTPUT

## 1. ESCROW/HOLD/RELEASE CODE REFERENCES

### Critical Files with Escrow/Hold/Release Logic

#### A) Admin Ops Page
**File:** `app/dashboard/admin/ops/page.tsx`
- **Line 6:** Comment mentions "escrow" (legacy key)
- **Line 94-96:** Tab type includes `'escrow'` and `'ready_to_release'`
- **Line 74:** Imports `getHoldInfo` from `lib/orders/hold-reasons.ts`
- **Line 445-452:** Filters orders by `status === 'paid' || status === 'paid_held'` and checks `!stripeTransferId`
- **Line 485-494:** Checks for `stripeTransferId`, `ready_to_release`, `buyer_confirmed` statuses

**Code Blocks:**
```typescript
// Line 94-96
type TabType = 'escrow' | 'protected' | 'disputes' | 'ready_to_release';

// Line 445-452
const paid = orders.filter(o => (o.status === 'paid' || o.status === 'paid_held') && !o.stripeTransferId).length;
const pendingPayouts = orders
  .filter(o => (o.status === 'paid' || o.status === 'paid_held') && !o.stripeTransferId)
  .reduce((sum, o) => sum + o.sellerAmount, 0);

// Line 485-494
if (order.stripeTransferId || order.status === 'completed') return false;
// ...
return order.status === 'ready_to_release' || order.status === 'buyer_confirmed' || order.status === 'accepted';
```

#### B) Admin Orders API
**File:** `app/api/admin/orders/route.ts`
- **Line 6:** Comment mentions "escrow" as legacy key
- **Line 79-80:** Comment mentions "paid_held orders"
- **Line 93-109:** Filter for `'escrow'` queries for payout-hold statuses
- **Line 165-183:** Client-side filter checks for payout-hold statuses

**Code Blocks:**
```typescript
// Line 93-109
if (filter === 'escrow') {
  ordersQuery = ordersCol
    // Payout-hold queue: includes paid/paid_held as well as post-delivery/buyer-confirm states
    // that are still awaiting admin payout release.
    .where('status', 'in', [
      'paid',
      'paid_held',
      'awaiting_bank_transfer',
      'awaiting_wire',
      'in_transit',
      'delivered',
      'buyer_confirmed',
      'accepted',
      'ready_to_release',
    ])
    .orderBy('createdAt', 'desc')
    .limit(limit);
}

// Line 165-183
if (filter === 'escrow') {
  orders = orders.filter((order: any) => {
    const status = order.status as OrderStatus;
    const hasTransfer = !!order.stripeTransferId;
    if (hasTransfer) return false;
    return (
      status === 'paid' ||
      status === 'paid_held' ||
      // ... more status checks
    );
  });
}
```

#### C) Hold Reasons Library
**File:** `lib/orders/hold-reasons.ts`
- **Entire file** is about payout holds and release eligibility
- **Line 19-104:** `getHoldInfo()` function checks `payoutHoldReason`, `protectionEndsAt`, `disputeDeadlineAt`, `ready_to_release` status
- **Line 109-152:** `generatePayoutExplanation()` generates payout hold explanations

**Code Blocks:**
```typescript
// Line 52-69
if (order.payoutHoldReason === 'protection_window' && order.protectionEndsAt) {
  const protectionEndsAt = new Date(order.protectionEndsAt);
  if (protectionEndsAt > now) {
    reason = 'Protection window active';
    nextAction = `Wait for protection window to end (${protectionEndsAt.toLocaleDateString()})`;
    earliestReleaseDate = protectionEndsAt;
    canRelease = false;
    return { reason, nextAction, earliestReleaseDate, canRelease };
  }
}

// Line 92-97
if (order.status === 'ready_to_release' || order.status === 'accepted') {
  reason = 'Ready to release';
  nextAction = 'Order is eligible for automatic or manual release';
  canRelease = true;
  return { reason, nextAction, earliestReleaseDate, canRelease };
}
```

#### D) Dispute Resolution
**File:** `app/api/orders/[orderId]/disputes/resolve/route.ts`
- **Line 193-245:** Partial refund still creates Stripe transfer to seller
- **Line 196:** Calls `getPayoutSafetyBlockReason()` (function doesn't exist - will error)
- **Line 241-244:** Sets `stripeTransferId`, `releasedBy`, `releasedAt`

**Code Blocks:**
```typescript
// Line 193-245
// Release remaining amount to seller
const remainingAmount = orderData.sellerAmount - refundAmountValue;
if (remainingAmount > 0 && orderData.sellerStripeAccountId) {
  const safetyBlock = getPayoutSafetyBlockReason(orderData); // ERROR: Function doesn't exist
  if (safetyBlock) {
    return json({ error: safetyBlock, code: 'PAYOUT_BLOCKED' }, { status: 400 });
  }
  
  // ... TPWD transfer approval checks ...
  
  const transfer = await stripe.transfers.create({
    amount: transferAmount,
    currency: 'usd',
    destination: orderData.sellerStripeAccountId,
    // ...
  });
  updateData.stripeTransferId = transfer.id;
  updateData.completedAt = now;
  updateData.releasedBy = adminId;
  updateData.releasedAt = now;
}
```

#### E) Buyer Order Detail
**File:** `app/dashboard/orders/[orderId]/page.tsx`
- **Line 130-136:** Checks `!order.stripeTransferId` for `canConfirmReceipt`
- **Line 137-143:** Checks `!order.stripeTransferId` for `canDispute`

**Code Blocks:**
```typescript
// Line 130-136
const canConfirmReceipt =
  !!order &&
  (order.status === 'in_transit' ||
    order.status === 'delivered' ||
    !!order.deliveredAt ||
    !!order.deliveryConfirmedAt) &&
  !order.stripeTransferId; // Checks for transfer ID (escrow logic)
```

#### F) Seller Sales Page
**File:** `app/seller/sales/page.tsx`
- **Line 134:** Filters by `status === 'pending'`
- **Line 225-226:** Filters by `'paid_held'`, `'paid'`, `'ready_to_release'`, `'delivered'`, `'disputed'`
- **Line 235:** Filters by `status === 'completed'`

**Code Blocks:**
```typescript
// Line 225-226
const isNeedsAction = (s: string) =>
  ['paid_held', 'paid', 'ready_to_release', 'delivered', 'disputed'].includes(s);

// Line 235
return base.filter((o) => String(o.status || '') === 'completed');
```

#### G) Seller Order Detail
**File:** `app/seller/orders/[orderId]/page.tsx`
- **Line 93-96:** Checks `order.status` for `'paid'`, `'paid_held'`, `'in_transit'`

**Code Blocks:**
```typescript
// Line 93-96
const canMarkPreparing = !!order && ['paid', 'paid_held'].includes(order.status) && !hasPreparing;
const canMarkInTransit = !!order && (hasPreparing || ['paid', 'paid_held'].includes(order.status));
const canMarkDelivered = !!order && ['paid', 'paid_held', 'in_transit'].includes(order.status) && !order.deliveredAt;
```

#### H) Purchases Page
**File:** `app/dashboard/orders/page.tsx`
- **Line 143:** Filters by `status === 'pending'`
- **Line 570-571:** Checks `status` for `'paid'`, `'paid_held'`, `'in_transit'`, `'delivered'` and `!order.stripeTransferId`

**Code Blocks:**
```typescript
// Line 570-571
const status = order.status as OrderStatus;
return ['paid', 'paid_held', 'in_transit', 'delivered'].includes(status) && !order.stripeTransferId;
```

---

## 2. PLATFORM FEE COMPUTATIONS

### Current Fee: 5% (MUST CHANGE TO 10%)

#### A) Fee Constant
**File:** `lib/pricing/plans.ts`
- **Line 17:** `export const MARKETPLACE_FEE_PERCENT = 0.05;` ← **MUST CHANGE TO 0.10**
- **Line 5:** Comment says "Marketplace fee is flat at 5%"
- **Line 26:** Comment says "always 5%"
- **Line 38, 46, 54:** Uses `MARKETPLACE_FEE_PERCENT` in plan configs

**Code Block:**
```typescript
// Line 17
export const MARKETPLACE_FEE_PERCENT = 0.05; // ← CHANGE TO 0.10
```

#### B) Stripe Config
**File:** `lib/stripe/config.ts`
- **Line 6:** Imports `MARKETPLACE_FEE_PERCENT`
- **Line 41:** `PLATFORM_COMMISSION_PERCENT = MARKETPLACE_FEE_PERCENT`
- **Line 47-49:** `calculatePlatformFee()` uses `PLATFORM_COMMISSION_PERCENT`

**Code Block:**
```typescript
// Line 47-49
export function calculatePlatformFee(amount: number): number {
  return Math.round(amount * PLATFORM_COMMISSION_PERCENT);
}
```

#### C) Checkout Session Creation
**File:** `app/api/stripe/checkout/create-session/route.ts`
- **Line 951:** Comment says "Platform fee (5%)"
- **Line 984:** `application_fee_amount: platformFee` (calculated using 5%)
- **Line 16:** Imports `calculatePlatformFee` from `@/lib/stripe/config`

**Code Blocks:**
```typescript
// Line 951
* - Platform fee (5%) is deducted automatically via application_fee_amount.

// Line 984
application_fee_amount: platformFee, // 5% platform fee (in cents)
```

**Fee Calculation Location:**
- Need to find where `platformFee` is calculated in this file

#### D) Wire Intent Creation
**File:** `app/api/stripe/wire/create-intent/route.ts`
- **Line 387:** Comment says "5% platform fee (in cents)"
- **Line 387:** `application_fee_amount: platformFeeCents`

**Code Block:**
```typescript
// Line 387
application_fee_amount: platformFeeCents, // 5% platform fee (in cents)
```

**Fee Calculation Location:**
- Need to find where `platformFeeCents` is calculated in this file

#### E) Webhook Handler
**File:** `app/api/stripe/webhook/handlers.ts`
- **Line 10:** Imports `calculatePlatformFee`
- **Line 15:** Imports `MARKETPLACE_FEE_PERCENT`
- **Line 165-176:** Calculates `platformFee` using `feePercentAtCheckout` or `MARKETPLACE_FEE_PERCENT`

**Code Blocks:**
```typescript
// Line 165-176
const feePercentAtCheckout = platformFeePercentStr
  ? parseFloat(platformFeePercentStr)
  : MARKETPLACE_FEE_PERCENT;

// Use fees from metadata if available (they were calculated at checkout using correct plan)
// Otherwise recalculate (fallback, but metadata should always be present)
const platformFee = platformFeeCents
  ? parseInt(platformFeeCents, 10)
  : Math.round(amount * feePercentAtCheckout);
const sellerAmount = sellerAmountCents
  ? parseInt(sellerAmountCents, 10)
  : (amount - platformFee);
```

---

## 3. APPLICATION_FEE_AMOUNT USAGE

### Checkout Session
**File:** `app/api/stripe/checkout/create-session/route.ts`
- **Line 984:** `application_fee_amount: platformFee`
- **Line 985-987:** `transfer_data: { destination: sellerStripeAccountId }`

**Code Block:**
```typescript
// Line 984-987
application_fee_amount: platformFee, // 5% platform fee (in cents)
transfer_data: {
  destination: sellerStripeAccountId, // Seller's Stripe Connect account ID
},
```

### Wire Intent
**File:** `app/api/stripe/wire/create-intent/route.ts`
- **Line 387:** `application_fee_amount: platformFeeCents`
- **Line 388-390:** `transfer_data: { destination: sellerStripeAccountId }`

**Code Block:**
```typescript
// Line 387-390
application_fee_amount: platformFeeCents, // 5% platform fee (in cents)
transfer_data: {
  destination: String(sellerStripeAccountId || ''), // Seller's Stripe Connect account ID
},
```

---

## 4. ORDER.STATUS BRANCHING

### A) Seller Sales Page
**File:** `app/seller/sales/page.tsx`
- **Uses:** `order.status` directly for filtering and display
- **Line 134:** `o.status === 'pending'`
- **Line 225-226:** `isNeedsAction()` checks `'paid_held'`, `'paid'`, `'ready_to_release'`, `'delivered'`, `'disputed'`
- **Line 235:** `o.status === 'completed'`
- **NOT USING:** `transactionStatus` at all

### B) Seller Order Detail
**File:** `app/seller/orders/[orderId]/page.tsx`
- **Uses:** `order.status` directly for action checks
- **Line 93-96:** Checks `['paid', 'paid_held']`, `['paid', 'paid_held', 'in_transit']`
- **NOT USING:** `transactionStatus` or `transportOption` for workflow routing

### C) Purchases Page
**File:** `app/dashboard/orders/page.tsx`
- **Uses:** `order.status` directly
- **Line 143:** `o.status === 'pending'`
- **Line 570-571:** Checks `['paid', 'paid_held', 'in_transit', 'delivered']` and `!order.stripeTransferId`
- **NOT USING:** `transactionStatus` or `transportOption`

### D) Buyer Order Detail
**File:** `app/dashboard/orders/[orderId]/page.tsx`
- **Uses:** `order.status` directly
- **Line 130-136:** Checks `order.status === 'in_transit' || order.status === 'delivered'` and `!order.stripeTransferId`
- **NOT USING:** `transactionStatus` or `transportOption`

### E) Admin Ops Page
**File:** `app/dashboard/admin/ops/page.tsx`
- **Uses:** `order.status` directly for filtering and display
- **Line 445-452:** Filters by `status === 'paid' || status === 'paid_held'` and checks `!stripeTransferId`
- **Line 485-494:** Checks `status === 'ready_to_release'`, `'buyer_confirmed'`, `'accepted'`
- **NOT USING:** `transactionStatus` for filtering

### F) Derive Order UI State
**File:** `lib/orders/deriveOrderUIState.ts`
- **Uses:** `order.status` directly throughout
- **Line 26:** `order.status === 'disputed'`
- **Line 60:** `order.status === 'delivered'`
- **Line 70:** `order.status === 'in_transit'`
- **Line 81:** `order.status === 'buyer_confirmed' || order.status === 'ready_to_release'`
- **Line 91:** `order.status === 'completed'`
- **Line 102:** `order.status === 'paid_held' || order.status === 'paid'`
- **Line 104:** Reads `transportOption` but doesn't use it for workflow differentiation
- **NOT USING:** `transactionStatus` as primary source

### G) Get Order Trust State
**File:** `lib/orders/getOrderTrustState.ts`
- **Uses:** `order.status` directly throughout
- **Line 33:** `const status = order.status;`
- **Line 36-37:** `status === 'refunded'`, `status === 'completed'`
- **Line 45-46:** `status === 'pending' || status === 'awaiting_bank_transfer' || status === 'awaiting_wire'`
- **Line 51:** `status === 'in_transit'`
- **Line 54:** `status === 'paid' || status === 'paid_held'`
- **Line 65-68:** Checks `status === 'delivered'`, `'buyer_confirmed'`, `'accepted'`, `'ready_to_release'`
- **Line 75:** Checks `payoutHoldReason === 'protection_window'` (escrow logic)
- **Line 78-80:** Checks `status === 'ready_to_release'`, `'buyer_confirmed'`, `'accepted'`
- **NOT USING:** `transactionStatus` as primary source

---

## 5. SUMMARY: STATUS USAGE BY COMPONENT

### Components Using Legacy `status` (NOT `transactionStatus`):

1. **app/seller/sales/page.tsx**
   - Filters: `status === 'pending'`, `'paid_held'`, `'paid'`, `'ready_to_release'`, `'delivered'`, `'disputed'`, `'completed'`
   - **Action Required:** Use `getEffectiveTransactionStatus()` and filter by `transactionStatus`

2. **app/seller/orders/[orderId]/page.tsx**
   - Action checks: `['paid', 'paid_held']`, `['paid', 'paid_held', 'in_transit']`
   - **Action Required:** Use `transactionStatus` and `transportOption` for workflow routing

3. **app/dashboard/orders/page.tsx**
   - Filters: `status === 'pending'`
   - Action checks: `['paid', 'paid_held', 'in_transit', 'delivered']` and `!stripeTransferId`
   - **Action Required:** Use `transactionStatus` and `transportOption`

4. **app/dashboard/orders/[orderId]/page.tsx**
   - Action checks: `status === 'in_transit' || status === 'delivered'` and `!stripeTransferId`
   - **Action Required:** Use `transactionStatus` and `transportOption`

5. **app/dashboard/admin/ops/page.tsx**
   - Filters: `status === 'paid' || status === 'paid_held'`, `'ready_to_release'`, `'buyer_confirmed'`, `'accepted'`
   - Checks: `!stripeTransferId`
   - **Action Required:** Filter by `transactionStatus` instead

6. **lib/orders/deriveOrderUIState.ts**
   - **All logic** branches on `order.status`
   - **Action Required:** Use `getEffectiveTransactionStatus()` and branch on `transactionStatus`

7. **lib/orders/getOrderTrustState.ts**
   - **All logic** branches on `order.status`
   - **Action Required:** Use `getEffectiveTransactionStatus()` and branch on `transactionStatus`

---

## 6. PLATFORM FEE REFERENCES TO UPDATE

### Files with "5%" or "0.05" References:

1. **lib/pricing/plans.ts**
   - Line 5: Comment "Marketplace fee is flat at 5%"
   - Line 17: `MARKETPLACE_FEE_PERCENT = 0.05` ← **PRIMARY CHANGE**
   - Line 26: Comment "always 5%"

2. **app/api/stripe/checkout/create-session/route.ts**
   - Line 951: Comment "Platform fee (5%)"
   - Line 984: Comment "5% platform fee (in cents)"

3. **app/api/stripe/wire/create-intent/route.ts**
   - Line 387: Comment "5% platform fee (in cents)"

4. **UI Display Files** (need to check for hardcoded "5%" in receipts, breakdowns, etc.)
   - `app/seller/sales/page.tsx` - May show fee breakdown
   - `app/dashboard/admin/ops/page.tsx` - Shows `totalFees`
   - Any receipt/breakdown components

---

## 7. FILES REQUIRING CHANGES (SUMMARY)

### Critical (Must Change):
1. `lib/pricing/plans.ts` - Change `MARKETPLACE_FEE_PERCENT` to 0.10
2. `lib/orders/status.ts` - **CREATE** helper function
3. `app/api/stripe/checkout/create-session/route.ts` - Update fee to 10%, update comments
4. `app/api/stripe/wire/create-intent/route.ts` - Update fee to 10%, update comments
5. `app/api/stripe/webhook/handlers.ts` - Set `transactionStatus: 'FULFILLMENT_REQUIRED'`, add SLA timestamps
6. `app/api/orders/[orderId]/disputes/resolve/route.ts` - Remove payout transfer logic
7. `app/dashboard/admin/ops/page.tsx` - Remove escrow filters, use `transactionStatus`
8. `app/api/admin/orders/route.ts` - Remove escrow filter, use `transactionStatus`
9. `lib/orders/deriveOrderUIState.ts` - Use `transactionStatus` instead of `status`
10. `lib/orders/getOrderTrustState.ts` - Use `transactionStatus` instead of `status`
11. `app/seller/sales/page.tsx` - Use `transactionStatus`, add transport-aware actions
12. `app/seller/orders/[orderId]/page.tsx` - Use `transactionStatus`, add transport-aware UI
13. `app/dashboard/orders/page.tsx` - Use `transactionStatus`, add transport-aware actions
14. `app/dashboard/orders/[orderId]/page.tsx` - Use `transactionStatus`, add transport-aware UI

### New Endpoints (To Create):
15. `app/api/orders/[orderId]/fulfillment/schedule-delivery/route.ts`
16. `app/api/orders/[orderId]/fulfillment/mark-out-for-delivery/route.ts`
17. `app/api/orders/[orderId]/fulfillment/set-pickup-info/route.ts`
18. `app/api/orders/[orderId]/fulfillment/select-pickup-window/route.ts`
19. `app/api/orders/[orderId]/fulfillment/confirm-pickup/route.ts`
20. `app/api/admin/sellers/[sellerId]/freeze/route.ts`
21. `app/api/orders/[orderId]/admin-notes/route.ts`
22. `app/api/orders/[orderId]/admin-review/route.ts`
23. `app/api/orders/[orderId]/dispute-packet/route.ts`

### Update Existing Endpoints:
24. `app/api/orders/[orderId]/mark-delivered/route.ts` - Set `transactionStatus: 'DELIVERED_PENDING_CONFIRMATION'`
25. `app/api/orders/[orderId]/confirm-receipt/route.ts` - Set `transactionStatus: 'COMPLETED'`
26. `app/api/orders/[orderId]/disputes/open/route.ts` - Set `transactionStatus: 'DISPUTE_OPENED'`

### Background Jobs (To Create):
27. `netlify/functions/checkFulfillmentSla.ts` - SLA monitoring

### Deprecate:
28. `lib/orders/hold-reasons.ts` - **DEPRECATE** entire file (no payout holds)

---

## NEXT: PROCEED TO PHASE 2

After this audit is reviewed, proceed to:
- Phase 2: Create status helper and migrate to `transactionStatus`
- Phase 3: Update platform fee to 10%
- Phase 4: Update webhook handlers
- Phase 5: Create fulfillment endpoints
- Phase 6: Update UI components
- Phase 7: Refactor Admin Ops
- Phase 8: SLA/noncompliance
- Phase 9: Cleanup
- Phase 10: Testing
