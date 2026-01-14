# Phase 8 — Go-Live Hardening + Seller Payout Readiness

## Overview

Phase 8 implements critical production blockers: payout readiness UX, KYC/onboarding enforcement, dispute/hold safety rails, and final operational guardrails. All features are production-ready with proper authentication, audit logging, and error handling.

## Files Changed/Added

### New Files

1. **Payout Readiness Component**:
   - `project/components/seller/PayoutReadinessCard.tsx` - Shows Stripe Connect status and provides "Fix Payout Setup" CTA

2. **Hold Reasons Helper**:
   - `project/lib/orders/hold-reasons.ts` - Helper functions to derive hold reasons and next actions from order state

### Modified Files

1. **Checkout Route** (`project/app/api/stripe/checkout/create-session/route.ts`):
   - Added comprehensive payout readiness check (chargesEnabled, payoutsEnabled, detailsSubmitted, onboardingStatus)
   - Blocks checkout if seller is not payout-ready (unless admin override)
   - Logs audit event when checkout is blocked
   - Returns structured error with details

2. **Seller Overview** (`project/app/seller/overview/page.tsx`):
   - Added `<PayoutReadinessCard />` component

3. **Seller Settings** (`project/app/seller/settings/page.tsx`):
   - Added `<PayoutReadinessCard />` to "Payouts" tab

4. **Auto-Release Function** (`project/netlify/functions/autoReleaseProtected.ts`):
   - Updated to set order status to `ready_to_release` before releasing
   - Checks all eligibility criteria (delivery confirmed, protection window passed, no disputes, no admin hold, no chargeback)
   - Creates audit log for status change

5. **Webhook Order Creation** (`project/app/api/stripe/webhook/handlers.ts`):
   - Already correctly sets `payoutHoldReason` based on protected transaction status (no changes needed)

## Key Features Implemented

### A) Seller Payout Readiness (UX + Enforcement)

**PayoutReadinessCard Component**:
- Shows Stripe Connect status:
  - `hasConnectedAccount` (stripeAccountId)
  - `chargesEnabled`
  - `payoutsEnabled`
  - `detailsSubmitted`
  - `onboardingStatus` (not_started/pending/complete)
- Displays clear status badge:
  - ✅ Ready to receive payouts
  - ⚠️ Action required (missing onboarding steps)
  - ⛔ Not connected
- "Fix Payout Setup" button triggers Connect onboarding flow
- Refresh button to check status

**Checkout Enforcement**:
- Server-side validation in `/api/stripe/checkout/create-session`
- Blocks checkout if seller is NOT payout-ready
- Returns user-friendly error: "Seller is not ready to receive payouts yet. Please contact seller or try later."
- Includes structured error details for debugging
- Admin override available via `x-allow-unready-seller` header (default: block)
- Audit log created when checkout is blocked

**Fix Payout Setup CTA**:
- Button triggers existing Connect onboarding flow:
  - `/api/stripe/connect/create-account` (if no account)
  - `/api/stripe/connect/create-account-link` (to complete onboarding)
- Redirects user to Stripe-hosted onboarding

### B) Automated "Ready to Release" Status

**Status Transition Logic**:
- Orders become `ready_to_release` automatically when:
  - `deliveryConfirmedAt` exists AND
  - (`protectedTransaction` is disabled OR `protectionEndsAt < now`) AND
  - `disputeStatus` is none/cancelled/resolved_release AND
  - no `adminHold` AND
  - no chargeback active/funds_withdrawn

**Implementation**:
- Updated `autoReleaseProtected` scheduled function:
  - Checks eligibility criteria before releasing
  - Sets status to `ready_to_release` if eligible
  - Creates audit log for status change
  - THEN releases payment
- Webhook order creation already sets `payoutHoldReason` correctly (no changes needed)

**Admin Ops UI**:
- "Ready to Release" tab shows orders with `status='ready_to_release'`
- Uses existing `getAdminOrders('ready_to_release')` API call
- Server-side query ensures UI matches truth

### C) Dispute / Holds Quality of Life

**Hold Reasons Helper** (`lib/orders/hold-reasons.ts`):
- `getHoldInfo(order)` function derives:
  - Hold reason (admin hold, chargeback, dispute, protection window, delivery confirmation, dispute deadline)
  - Next action (what needs to happen to release)
  - Earliest release date (if applicable)
  - Can release flag
- `generatePayoutExplanation(order)` function creates plain text explanation for support

**Order Detail Dialog** (Admin Ops):
- Shows "Hold Reason" and "Next Action" fields (derived from `getHoldInfo`)
- "Copy Seller Payout Explanation" button:
  - Generates plain text explanation using `generatePayoutExplanation`
  - Includes: order ID, amount, hold reason, next action, earliest release date, relevant dates
  - No sensitive data
  - Copies to clipboard

### D) Index + Query Hardening

**Firestore Indexes** (added to `firestore.indexes.json`):
- `orders`: `sellerId + status + updatedAt` (for seller order queries)
- `orders`: `status + protectionEndsAt` (for protected transaction queries)
- `orders`: `status + disputeStatus + updatedAt` (for dispute queries)
- `orders`: `status + adminHold + updatedAt` (for admin hold queries)
- `chargebacks`: `orderId + status` (for chargeback queries)

**Note**: Indexes should be deployed via `firebase deploy --only firestore:indexes`

### E) Documentation + Runbook Update

**RUNBOOK_PRODUCTION.md Updates**:
- Added "What to do when payout is blocked" section
- Added "How to complete Stripe Connect onboarding" section
- Added "How to interpret hold reasons" section
- Added "How to safely release / refund" section

## Implementation Details

### Payout Readiness Check Flow

```
Buyer initiates checkout
  ↓
API verifies seller payout readiness:
  - stripeAccountId exists
  - chargesEnabled === true
  - payoutsEnabled === true
  - stripeDetailsSubmitted === true
  - stripeOnboardingStatus === 'complete'
  ↓
If NOT ready:
  - Return 400 with error message
  - Log audit event
  - Block checkout
  ↓
If ready (or admin override):
  - Continue with checkout creation
```

### Ready to Release Status Flow

```
Order created (status='paid')
  ↓
Buyer confirms delivery (deliveryConfirmedAt set)
  ↓
Auto-release function runs (every 10 minutes)
  ↓
Check eligibility:
  - deliveryConfirmedAt exists ✓
  - protection window passed (if applicable) ✓
  - no active dispute ✓
  - no admin hold ✓
  - no chargeback ✓
  ↓
Set status='ready_to_release' (audit log)
  ↓
Release payment (create Stripe transfer)
  ↓
Set status='completed'
```

### Hold Reason Derivation

Priority order:
1. Admin hold (highest priority - blocks all releases)
2. Chargeback active/funds_withdrawn
3. Dispute open/needs_evidence/under_review
4. Protection window active (if protected transaction)
5. Delivery not confirmed
6. Dispute deadline not passed (standard escrow)
7. Ready to release (all checks passed)

## Environment Variables

**No new environment variables required** - Uses existing Stripe configuration.

## Firestore Indexes Required

Add to `firestore.indexes.json` (already added):

```json
{
  "collectionGroup": "orders",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "sellerId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "updatedAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "orders",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "protectionEndsAt", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "orders",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "disputeStatus", "order": "ASCENDING" },
    { "fieldPath": "updatedAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "orders",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "adminHold", "order": "ASCENDING" },
    { "fieldPath": "updatedAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "chargebacks",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "orderId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" }
  ]
}
```

**Deploy indexes**: `firebase deploy --only firestore:indexes`

## Manual Test Checklist

### Payout Readiness

- [ ] **Seller Not Connected**:
  1. Create seller account without Stripe Connect
  2. Try to checkout on seller's listing
  3. Verify checkout is blocked with error message
  4. Verify audit log created

- [ ] **Seller Connected But Payouts Disabled**:
  1. Create Stripe Connect account but don't complete onboarding
  2. Try to checkout on seller's listing
  3. Verify checkout is blocked
  4. Verify error shows which fields are missing

- [ ] **Seller Completes Onboarding**:
  1. Complete Stripe Connect onboarding
  2. Verify PayoutReadinessCard shows "Ready to receive payouts"
  3. Try to checkout on seller's listing
  4. Verify checkout succeeds

- [ ] **PayoutReadinessCard**:
  1. Navigate to `/seller/overview` or `/seller/settings` (Payouts tab)
  2. Verify card shows current status
  3. Click "Fix Payout Setup" if not ready
  4. Verify redirects to Stripe onboarding
  5. Complete onboarding and return
  6. Verify card updates to "Ready"

### Ready to Release

- [ ] **Protected Order Passes Window**:
  1. Create order with protected transaction
  2. Buyer confirms delivery
  3. Wait for protection window to end
  4. Verify auto-release function sets status to `ready_to_release`
  5. Verify payment is released
  6. Verify status becomes `completed`

- [ ] **Standard Escrow Order**:
  1. Create order without protected transaction
  2. Buyer confirms delivery
  3. Wait for dispute deadline to pass
  4. Verify auto-release function sets status to `ready_to_release`
  5. Verify payment is released

- [ ] **Admin Ops Ready to Release Tab**:
  1. Navigate to `/dashboard/admin/ops`
  2. Click "Ready to Release" tab
  3. Verify only eligible orders are shown
  4. Verify orders have `status='ready_to_release'`

### Hold Reasons

- [ ] **Order Detail Dialog**:
  1. Open order detail dialog in Admin Ops
  2. Verify "Hold Reason" field is displayed
  3. Verify "Next Action" field is displayed
  4. Verify information is accurate based on order state

- [ ] **Copy Payout Explanation**:
  1. Open order detail dialog
  2. Click "Copy Seller Payout Explanation" button
  3. Verify explanation is copied to clipboard
  4. Paste and verify content includes:
     - Order ID
     - Amount
     - Hold reason
     - Next action
     - Earliest release date (if applicable)
     - Relevant dates

### Dispute / Chargeback Holds

- [ ] **Dispute Opens**:
  1. Open dispute on order
  2. Verify order shows hold reason: "Dispute: open"
  3. Verify next action: "Resolve dispute before release"
  4. Verify order cannot be released

- [ ] **Chargeback Created**:
  1. Create chargeback on order
  2. Verify order shows hold reason: "Chargeback active"
  3. Verify next action: "Resolve chargeback before release"
  4. Verify order cannot be released

- [ ] **Admin Hold**:
  1. Place admin hold on order
  2. Verify order shows hold reason: "Admin hold"
  3. Verify next action: "Admin must remove hold before release"
  4. Verify order cannot be released

## Known Limitations / Future Improvements

1. **Payout Readiness Check**: Currently checks all fields. Could add more granular checks (e.g., allow checkout if account exists but onboarding in progress, with warning).

2. **Ready to Release Status**: Currently set by auto-release function. Could also be set immediately when delivery is confirmed and all conditions are met (real-time update).

3. **Hold Reasons**: Currently derived client-side. Could be computed server-side and stored on order document for faster queries.

4. **Copy Payout Explanation**: Currently plain text. Could add formatted version (HTML/Markdown) for email templates.

## Security Verification

✅ All API routes verify Firebase Auth token
✅ Checkout route blocks unready sellers (unless admin override)
✅ Audit logs created for all blocked checkouts
✅ Auto-release function validates all eligibility criteria
✅ Hold reason derivation is deterministic and auditable
✅ No sensitive data in payout explanation

---

**Status**: ✅ Complete - Payout readiness, ready-to-release automation, and hold reason UX fully implemented
