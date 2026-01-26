# PHASE 1 — REMAINING ESCROW/HOLD/RELEASE CODE

## Summary

**Total Matches Found:**
- 50 files contain "escrow|hold.*payout|release.*payment|payout.*release|manual.*capture|capture_method"
- 386 matches for "paid_held|ready_to_release|payoutHoldReason|stripeTransferId|releasedAt|releasedBy"

**Critical Files Requiring Updates:**

---

## 1. ADMIN OPS PAGE

**File:** `app/dashboard/admin/ops/page.tsx`

**Issues:**
- Line 6: Comment mentions "escrow" (legacy key)
- Line 94-96: Tab type includes `'escrow'` and `'ready_to_release'`
- Line 74: Imports `getHoldInfo` from `lib/orders/hold-reasons.ts` (deprecated)
- Line 835: Tab trigger still uses "escrow" key
- Line 149: Query filter uses `'escrow'` which maps to payout-hold statuses

**Code Snippets:**
```typescript
// Line 94-96
type TabType = 'escrow' | 'protected' | 'disputes' | 'ready_to_release';
// NOTE: Tab value `'escrow'` is a legacy internal filter key meaning "payout holds".

// Line 835
<TabsTrigger value="escrow">
  <DollarSign className="h-4 w-4 mr-2" />
  Fulfillment Issues
</TabsTrigger>

// Line 149
const result = await getAdminOrders(
  activeTab === 'escrow' ? 'escrow' : ...
);
```

**Action Required:**
- Change tab key from `'escrow'` to `'fulfillment_issues'`
- Update API filter mapping
- Remove `getHoldInfo` import and usage
- Update tab description to focus on fulfillment, not payouts

---

## 2. ADMIN ORDERS API

**File:** `app/api/admin/orders/route.ts`

**Issues:**
- Line 6: Comment mentions "escrow" as legacy key
- Line 79-80: Comment mentions "paid_held orders"
- Line 93-109: Filter for `'escrow'` queries for payout-hold statuses
- Line 165-183: Client-side filter still checks for payout-hold statuses

**Code Snippets:**
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
  // Orders held for payout release: paid funds awaiting release OR high-ticket awaiting payment confirmation
  // Includes orders in transit/delivered that haven't been released yet
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

**Action Required:**
- Change filter key from `'escrow'` to `'fulfillment_issues'`
- Update query to filter by `transactionStatus` instead of legacy `status`
- Filter for: `SELLER_NONCOMPLIANT`, `FULFILLMENT_REQUIRED` + SLA expired, `DELIVERED_PENDING_CONFIRMATION` + > 7 days

---

## 3. HOLD REASONS LIBRARY

**File:** `lib/orders/hold-reasons.ts`

**Issues:**
- Entire file is about payout holds and release eligibility
- Functions: `getHoldInfo()`, `generatePayoutExplanation()`
- Checks: `payoutHoldReason`, `protectionEndsAt`, `disputeDeadlineAt`, `ready_to_release` status

**Code Snippets:**
```typescript
// Line 19-104
export function getHoldInfo(order: Order): HoldInfo {
  // ... checks payoutHoldReason, protectionEndsAt, disputeDeadlineAt
  // ... returns canRelease: boolean
  if (order.status === 'ready_to_release' || order.status === 'accepted') {
    reason = 'Ready to release';
    nextAction = 'Order is eligible for automatic or manual release';
    canRelease = true;
    return { reason, nextAction, earliestReleaseDate, canRelease };
  }
}
```

**Action Required:**
- **DEPRECATE** this entire file
- Replace with fulfillment-focused helper: `getFulfillmentStatus()` or similar
- Focus on fulfillment progress, not payout eligibility

---

## 4. DISPUTE RESOLUTION

**File:** `app/api/orders/[orderId]/disputes/resolve/route.ts`

**Issues:**
- Lines 193-245: Partial refund still creates Stripe transfer to seller
- Line 196: Calls `getPayoutSafetyBlockReason()` (function doesn't exist - will error)
- Lines 241-244: Sets `stripeTransferId`, `releasedBy`, `releasedAt`

**Code Snippets:**
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

**Action Required:**
- **REMOVE** Stripe transfer creation (seller already paid)
- For partial refunds: Only create refund, don't transfer remaining amount
- Seller already received full payment - partial refund reduces what they keep, but no transfer needed
- Remove `getPayoutSafetyBlockReason()` call (function doesn't exist anyway)

---

## 5. ADMIN PAYOUTS PAGE

**File:** `app/dashboard/admin/payouts/page.tsx`

**Issues:**
- Still references payout release logic
- Queries for payout-hold statuses
- May have "Release" buttons

**Action Required:**
- Review and update to focus on fulfillment tracking
- Remove payout release UI
- Show fulfillment progress instead

---

## 6. TYPES FILE

**File:** `lib/types.ts`

**Issues:**
- `OrderStatus` enum still includes `'paid_held'` and `'ready_to_release'` (marked deprecated)
- `PayoutHoldReason` type still exists (marked deprecated)
- `Order` interface has deprecated fields: `stripeTransferId`, `releasedAt`, `releasedBy`, `payoutHoldReason`

**Action Required:**
- Keep for backward compatibility but ensure new orders don't use deprecated values
- Add comments marking as deprecated
- Ensure `transactionStatus` is used for all new orders

---

## 7. WEBHOOK HANDLER

**File:** `app/api/stripe/webhook/handlers.ts`

**Status:** ✅ MOSTLY CLEAN
- Line 504: Sets `transactionStatus: fulfillmentStatus` (correct)
- Line 523: Sets `payoutHoldReason: 'none'` (correct - deprecated field)
- Comments explain seller is paid immediately

**Action Required:**
- Verify `fulfillmentStatus` is set to `'FULFILLMENT_REQUIRED'` when payment confirmed
- Ensure SLA timers are set

---

## 8. DOCUMENTATION FILES

**Files:**
- `docs/payments-current-state.md`
- `docs/internal/RUNBOOK_OPERATIONS.md`
- `knowledge_base/*.md` files

**Action Required:**
- Update all documentation to remove escrow language
- Update runbook to focus on fulfillment enforcement
- Update knowledge base articles

---

## SUMMARY OF ACTIONS

### High Priority (Code Changes)
1. ✅ Remove payout transfer from dispute resolution (partial refund case)
2. ✅ Update Admin Ops to use `transactionStatus` filters
3. ✅ Deprecate `lib/orders/hold-reasons.ts`
4. ✅ Change `'escrow'` tab key to `'fulfillment_issues'`
5. ✅ Update Admin Orders API filter logic

### Medium Priority (UI Updates)
6. Update Sold tab to show transport-option-aware actions
7. Update Purchases tab to show transport-option-aware actions
8. Remove "Release" buttons from Admin Ops
9. Add "Freeze Seller" functionality

### Low Priority (Documentation)
10. Update all markdown documentation
11. Update knowledge base articles
12. Update runbook operations guide

---

## VERIFICATION CHECKLIST

After implementation, verify:
- [ ] No `stripe.transfers.create()` calls exist (except in deprecated/commented code)
- [ ] No `releasePayment()` function calls exist
- [ ] No `'escrow'` filter keys in active code
- [ ] No `'paid_held'` or `'ready_to_release'` statuses set on new orders
- [ ] All status transitions use `transactionStatus`
- [ ] Admin Ops shows fulfillment focus, not payout management
- [ ] All UI text removed escrow/hold/release language
