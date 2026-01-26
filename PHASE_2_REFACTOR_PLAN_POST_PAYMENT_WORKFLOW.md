# PHASE 2 — REFACTOR PLAN: Post-Payment Workflow

## EXECUTIVE SUMMARY

**Current State:**
- Dual status system (`status` legacy + `transactionStatus` new) causing confusion
- `transportOption` stored but not used in workflow differentiation
- Fulfillment fields (`pickup`, `delivery`) exist in schema but not populated
- Admin Ops still references "escrow" and payout-hold logic
- Status transitions use legacy `status` field, not `transactionStatus`
- No pickup workflow for BUYER_TRANSPORT
- No delivery scheduling for SELLER_TRANSPORT

**Target State:**
- Single unified `transactionStatus` field (deprecate legacy `status` gradually)
- Transport-option-aware workflows with proper UI differentiation
- Populated `pickup` and `delivery` objects for tracking
- Admin Ops focused on fulfillment enforcement, not payout management
- Clear status transitions based on transport option
- Full pickup workflow (scheduling, codes, confirmation)
- Full delivery workflow (ETA, tracking, proof)

---

## 1. STATUS MODEL (Unified)

### New TransactionStatus Enum (Already Defined)

**File:** `lib/types.ts` (lines 554-568)

```typescript
export type TransactionStatus =
  | 'PENDING_PAYMENT'           // Payment not yet confirmed (async methods)
  | 'PAID'                      // Payment confirmed - seller already paid
  | 'FULFILLMENT_REQUIRED'      // Payment complete, awaiting fulfillment start
  | 'READY_FOR_PICKUP'          // BUYER_TRANSPORT: Ready for buyer to schedule pickup
  | 'PICKUP_SCHEDULED'          // BUYER_TRANSPORT: Pickup window selected
  | 'PICKED_UP'                 // BUYER_TRANSPORT: Buyer confirmed pickup
  | 'DELIVERY_SCHEDULED'        // SELLER_TRANSPORT: Delivery ETA set
  | 'OUT_FOR_DELIVERY'          // SELLER_TRANSPORT: Optional - seller marked out for delivery
  | 'DELIVERED_PENDING_CONFIRMATION' // SELLER_TRANSPORT: Seller marked delivered, awaiting buyer confirmation
  | 'COMPLETED'                 // Buyer confirmed receipt OR pickup confirmed
  | 'DISPUTE_OPENED'            // Buyer opened dispute
  | 'SELLER_NONCOMPLIANT'       // Seller failed SLA (auto-flagged by system)
  | 'REFUNDED'                  // Refund processed
  | 'CANCELLED';                // Order cancelled
```

### Status Transition Rules

**Payment Success:**
- `PENDING_PAYMENT` → `PAID` (if payment confirmed)
- `PAID` → `FULFILLMENT_REQUIRED` (immediately after payment)

**BUYER_TRANSPORT Flow:**
1. `FULFILLMENT_REQUIRED` → `READY_FOR_PICKUP` (seller sets pickup info)
2. `READY_FOR_PICKUP` → `PICKUP_SCHEDULED` (buyer selects window)
3. `PICKUP_SCHEDULED` → `PICKED_UP` (buyer confirms pickup with code)
4. `PICKED_UP` → `COMPLETED` (automatic after pickup confirmation)

**SELLER_TRANSPORT Flow:**
1. `FULFILLMENT_REQUIRED` → `DELIVERY_SCHEDULED` (seller sets ETA)
2. `DELIVERY_SCHEDULED` → `OUT_FOR_DELIVERY` (optional - seller marks out)
3. `OUT_FOR_DELIVERY` → `DELIVERED_PENDING_CONFIRMATION` (seller marks delivered)
4. `DELIVERED_PENDING_CONFIRMATION` → `COMPLETED` (buyer confirms receipt)

**Dispute Flow:**
- Any status → `DISPUTE_OPENED` (buyer opens dispute)
- `DISPUTE_OPENED` → `COMPLETED` or `REFUNDED` (admin resolves)

**Non-Compliance:**
- SLA timer expires → `SELLER_NONCOMPLIANT` (auto-flagged)
- Admin can freeze seller account

---

## 2. DATA MODEL CHANGES

### Fields to ADD to Order Document

**Already Exist (Verify Usage):**
- ✅ `transactionStatus: TransactionStatus` - USE THIS as primary status
- ✅ `transportOption: 'SELLER_TRANSPORT' | 'BUYER_TRANSPORT'` - USE THIS for workflow routing
- ✅ `pickup: { location, windows, selectedWindow, pickupCode, confirmedAt, proofPhotos[] }` - POPULATE THIS
- ✅ `delivery: { eta, transporter, proofUploads[], deliveredAt, buyerConfirmedAt }` - POPULATE THIS
- ✅ `issues: { openedAt, reason, notes, photos[] }` - USE THIS for disputes

**Fields to ADD:**
```typescript
{
  // SLA tracking
  fulfillmentSlaStartedAt?: Date;        // When fulfillment must begin (e.g., 24h after payment)
  fulfillmentSlaDeadlineAt?: Date;       // When fulfillment must complete (e.g., 7d after payment)
  sellerNonComplianceReason?: string;   // Why seller was flagged non-compliant
  sellerNonComplianceAt?: Date;         // When seller was flagged
  
  // Admin enforcement
  adminFlags?: string[];                 // ['frozen_seller', 'needs_review', 'dispute_packet_ready']
  adminReviewedAt?: Date;                 // When admin last reviewed
  adminNotes?: string;                    // Admin internal notes
}
```

### Fields to DEPRECATE (Keep for Backward Compatibility)

**Legacy Status Fields:**
- `status: OrderStatus` - Keep but stop using for new transitions
- `paid_held` - Remove from new orders
- `ready_to_release` - Remove from new orders

**Legacy Payout Fields:**
- `payoutHoldReason` - Keep but always set to 'none' for new orders
- `stripeTransferId` - Keep for historical records only
- `releasedAt`, `releasedBy` - Keep for historical records only

**Migration Strategy:**
- New orders: Use `transactionStatus` only
- Existing orders: Derive `transactionStatus` from `status` if missing
- Gradual migration: Update existing orders as they transition

---

## 3. EVENT TRIGGERS FOR STATUS TRANSITIONS

### Payment Success → FULFILLMENT_REQUIRED

**File:** `app/api/stripe/webhook/handlers.ts`
- **Function:** `handleCheckoutSessionCompleted()`
- **Current:** Sets `transactionStatus: 'PAID'` or `'FULFILLMENT_REQUIRED'`
- **Change:** Always set to `'FULFILLMENT_REQUIRED'` when payment confirmed
- **Also Set:** `fulfillmentSlaStartedAt: now`, `fulfillmentSlaDeadlineAt: now + 7 days`

### SELLER_TRANSPORT Workflow

**1. Seller Sets Delivery ETA:**
- **New Endpoint:** `POST /api/orders/[orderId]/fulfillment/schedule-delivery`
- **Sets:** `transactionStatus: 'DELIVERY_SCHEDULED'`, `delivery.eta: Date`
- **Requires:** `transportOption === 'SELLER_TRANSPORT'`

**2. Seller Marks Out for Delivery (Optional):**
- **New Endpoint:** `POST /api/orders/[orderId]/fulfillment/mark-out-for-delivery`
- **Sets:** `transactionStatus: 'OUT_FOR_DELIVERY'`
- **Optional:** Upload transporter info to `delivery.transporter`

**3. Seller Marks Delivered:**
- **Existing:** `POST /api/orders/[orderId]/mark-delivered`
- **Change:** Set `transactionStatus: 'DELIVERED_PENDING_CONFIRMATION'`
- **Sets:** `delivery.deliveredAt: Date`, `deliveryProofUrls[]`

**4. Buyer Confirms Receipt:**
- **Existing:** `POST /api/orders/[orderId]/confirm-receipt`
- **Change:** Set `transactionStatus: 'COMPLETED'`
- **Sets:** `delivery.buyerConfirmedAt: Date`

### BUYER_TRANSPORT Workflow

**1. Seller Sets Pickup Info:**
- **New Endpoint:** `POST /api/orders/[orderId]/fulfillment/set-pickup-info`
- **Sets:** `transactionStatus: 'READY_FOR_PICKUP'`
- **Sets:** `pickup.location: string`, `pickup.windows: Array<{start, end}>`, `pickup.pickupCode: string`

**2. Buyer Selects Pickup Window:**
- **New Endpoint:** `POST /api/orders/[orderId]/fulfillment/select-pickup-window`
- **Sets:** `transactionStatus: 'PICKUP_SCHEDULED'`
- **Sets:** `pickup.selectedWindow: {start, end}`

**3. Buyer Confirms Pickup:**
- **New Endpoint:** `POST /api/orders/[orderId]/fulfillment/confirm-pickup`
- **Sets:** `transactionStatus: 'PICKED_UP'` → `'COMPLETED'`
- **Requires:** `pickup.pickupCode` match
- **Sets:** `pickup.confirmedAt: Date`, `pickup.proofPhotos[]` (optional)

### Dispute Flow

**1. Buyer Opens Dispute:**
- **Existing:** `POST /api/orders/[orderId]/disputes/open`
- **Change:** Set `transactionStatus: 'DISPUTE_OPENED'`
- **Sets:** `issues.openedAt: Date`, `issues.reason: string`, `issues.photos[]`

**2. Admin Resolves Dispute:**
- **Existing:** `POST /api/orders/[orderId]/disputes/resolve`
- **Change:** Set `transactionStatus: 'COMPLETED'` (release) or `'REFUNDED'` (refund)
- **No Stripe transfer** - seller already paid

### Non-Compliance Flow

**1. SLA Timer Expires:**
- **New:** Background job or webhook timer
- **Sets:** `transactionStatus: 'SELLER_NONCOMPLIANT'`
- **Sets:** `sellerNonComplianceReason: string`, `sellerNonComplianceAt: Date`
- **Flags:** `adminFlags: ['frozen_seller']`

**2. Admin Freezes Seller:**
- **New Endpoint:** `POST /api/admin/sellers/[sellerId]/freeze`
- **Sets:** User document `sellingDisabled: true`, `sellingDisabledReason: string`
- **Blocks:** New listings, new checkouts for that seller

---

## 4. SOLD TAB REFACTOR

### Current Implementation
**File:** `app/seller/sales/page.tsx`
- Query: `getOrdersForUser(userId, 'seller')`
- Filters: Excludes abandoned pending checkouts
- Displays: Status badge, buyer info, amount, payment details

### New Implementation

**Query:** Same (no change needed)

**Display Changes:**
1. **Status Badge:** Use `transactionStatus` instead of `status`
2. **Next Action:** Show transport-option-specific action required
3. **Fulfillment Progress:** Show pickup/delivery progress based on `transportOption`

**Seller Actions (Based on transportOption):**

**BUYER_TRANSPORT:**
- "Set Pickup Info" → Opens dialog to set location, windows, pickup code
- "View Pickup Details" → Shows selected window, pickup code
- "Upload Pickup Proof" → After buyer confirms

**SELLER_TRANSPORT:**
- "Schedule Delivery" → Set ETA, transporter info
- "Mark Out for Delivery" → Optional step
- "Mark Delivered" → Existing action, upload proof
- "View Delivery Details" → Shows ETA, transporter, proof

**Code Changes:**
- **File:** `app/seller/sales/page.tsx`
- Add transport-option-aware action buttons
- Show fulfillment progress indicators
- Update status badge to use `transactionStatus`

---

## 5. PURCHASES TAB REFACTOR

### Current Implementation
**File:** `app/dashboard/orders/page.tsx`
- Query: `getOrdersForUser(userId, 'buyer')`
- Filters: Excludes abandoned pending checkouts
- Displays: Status, seller info, amount, next action

### New Implementation

**Query:** Same (no change needed)

**Display Changes:**
1. **Status Badge:** Use `transactionStatus` instead of `status`
2. **Next Action:** Show transport-option-specific action required
3. **Fulfillment Progress:** Show pickup/delivery progress

**Buyer Actions (Based on transportOption):**

**BUYER_TRANSPORT:**
- "Select Pickup Window" → Choose from seller's available windows
- "Confirm Pickup" → Enter pickup code, upload proof photos
- "View Pickup Details" → Shows location, selected window, code

**SELLER_TRANSPORT:**
- "Confirm Receipt" → Existing action
- "View Delivery Details" → Shows ETA, transporter, proof
- "Open Dispute" → Existing action

**Code Changes:**
- **File:** `app/dashboard/orders/page.tsx`
- Add transport-option-aware action buttons
- Show fulfillment progress indicators
- Update `deriveOrderUIState()` to use `transactionStatus`

---

## 6. ADMIN OPS REFACTOR

### Current Implementation
**File:** `app/dashboard/admin/ops/page.tsx`
- Tabs: All, Fulfillment Issues (escrow), Protected, Disputes, Fulfillment Pending
- Queries: Filter by legacy `status` values
- Actions: View, Release (disabled), Refund, Resolve Dispute

### New Implementation

**Tabs:**
1. **All Purchases** - All orders (no change)
2. **Fulfillment Issues** - Orders needing attention:
   - `transactionStatus === 'SELLER_NONCOMPLIANT'`
   - `transactionStatus === 'FULFILLMENT_REQUIRED'` + SLA deadline passed
   - `transactionStatus === 'DELIVERED_PENDING_CONFIRMATION'` + > 7 days old
3. **Open Disputes** - `transactionStatus === 'DISPUTE_OPENED'`
4. **Fulfillment Pending** - Orders in fulfillment but not completed

**Query Changes:**
- **File:** `app/api/admin/orders/route.ts`
- Filter by `transactionStatus` instead of legacy `status`
- Remove "escrow" filter logic
- Add SLA deadline checks

**Display Per Transaction:**
- `transactionStatus` badge
- `transportOption` indicator
- Fulfillment progress (pickup/delivery steps)
- SLA deadline countdown
- Admin flags
- Seller/buyer info
- Proof uploads

**Admin Actions:**
1. **Freeze Seller** - `POST /api/admin/sellers/[sellerId]/freeze`
   - Blocks new listings/checkouts
   - Sets `adminFlags: ['frozen_seller']`

2. **Add Admin Notes** - `POST /api/orders/[orderId]/admin-notes`
   - Adds to `adminActionNotes[]`

3. **Mark Reviewed** - `POST /api/orders/[orderId]/admin-review`
   - Sets `adminReviewedAt: Date`

4. **Export Dispute Packet** - `GET /api/orders/[orderId]/dispute-packet`
   - Returns: Messages timeline, proof status, deadlines, compliance docs

5. **Refund** - Existing (no change)

6. **Resolve Dispute** - Existing (no change, but remove payout release logic)

**Code Changes:**
- **File:** `app/dashboard/admin/ops/page.tsx`
- Update tab filters to use `transactionStatus`
- Remove "Release" button (seller already paid)
- Add "Freeze Seller" button
- Add "Export Dispute Packet" button
- Update order card to show fulfillment progress

---

## 7. FILES TO CHANGE

### Core Status/Type Files
1. `lib/types.ts` - Verify `TransactionStatus` enum is complete
2. `lib/orders/deriveOrderUIState.ts` - Use `transactionStatus` instead of `status`
3. `lib/orders/getOrderTrustState.ts` - Use `transactionStatus` instead of `status`

### Webhook Handler
4. `app/api/stripe/webhook/handlers.ts` - Set `transactionStatus: 'FULFILLMENT_REQUIRED'` on payment success

### Seller Pages
5. `app/seller/sales/page.tsx` - Show transport-option-aware actions
6. `app/seller/orders/[orderId]/page.tsx` - Add pickup/delivery scheduling UI

### Buyer Pages
7. `app/dashboard/orders/page.tsx` - Show transport-option-aware actions
8. `app/dashboard/orders/[orderId]/page.tsx` - Add pickup window selection, pickup confirmation

### Admin Pages
9. `app/dashboard/admin/ops/page.tsx` - Update filters, remove release logic, add freeze action
10. `app/api/admin/orders/route.ts` - Filter by `transactionStatus`

### New API Endpoints (TO CREATE)
11. `app/api/orders/[orderId]/fulfillment/schedule-delivery/route.ts` - SELLER_TRANSPORT: Set ETA
12. `app/api/orders/[orderId]/fulfillment/mark-out-for-delivery/route.ts` - SELLER_TRANSPORT: Optional step
13. `app/api/orders/[orderId]/fulfillment/set-pickup-info/route.ts` - BUYER_TRANSPORT: Set location/windows/code
14. `app/api/orders/[orderId]/fulfillment/select-pickup-window/route.ts` - BUYER_TRANSPORT: Buyer selects window
15. `app/api/orders/[orderId]/fulfillment/confirm-pickup/route.ts` - BUYER_TRANSPORT: Buyer confirms with code
16. `app/api/admin/sellers/[sellerId]/freeze/route.ts` - Freeze seller account
17. `app/api/orders/[orderId]/admin-notes/route.ts` - Add admin notes
18. `app/api/orders/[orderId]/admin-review/route.ts` - Mark reviewed
19. `app/api/orders/[orderId]/dispute-packet/route.ts` - Export dispute data

### Update Existing Endpoints
20. `app/api/orders/[orderId]/mark-delivered/route.ts` - Set `transactionStatus: 'DELIVERED_PENDING_CONFIRMATION'`
21. `app/api/orders/[orderId]/confirm-receipt/route.ts` - Set `transactionStatus: 'COMPLETED'`
22. `app/api/orders/[orderId]/disputes/open/route.ts` - Set `transactionStatus: 'DISPUTE_OPENED'`
23. `app/api/orders/[orderId]/disputes/resolve/route.ts` - Remove payout release, set `transactionStatus: 'COMPLETED'` or `'REFUNDED'`

### Components
24. `components/orders/TransactionTimeline.tsx` - Use `transactionStatus` for step highlighting
25. `components/orders/OrderTimeline.tsx` - Update to show transport-option-aware steps

### Background Jobs (TO CREATE)
26. `netlify/functions/checkFulfillmentSla.ts` - Check SLA deadlines, flag non-compliance

---

## 8. MIGRATION STRATEGY

### Phase 1: Add New Fields (Non-Breaking)
- Ensure all new orders have `transactionStatus` set
- Populate `pickup` and `delivery` objects when actions occur
- Keep legacy `status` field for backward compatibility

### Phase 2: Update Status Transitions
- All new status transitions use `transactionStatus`
- Derive `transactionStatus` from `status` for existing orders if missing
- Update UI to prefer `transactionStatus` over `status`

### Phase 3: Remove Legacy Logic
- Remove payout release endpoints (already done)
- Remove escrow filter logic from Admin Ops
- Update all queries to use `transactionStatus`

### Phase 4: Cleanup
- Remove deprecated `status` values from new orders
- Archive old payout release code
- Update documentation

---

## 9. ESCROW/HOLD/RELEASE CODE REMOVAL CHECKLIST

### Files with Escrow References (50 files found)

**Critical Files (Must Update):**
1. `app/dashboard/admin/ops/page.tsx` - Remove escrow tab logic
2. `app/api/admin/orders/route.ts` - Remove escrow filter
3. `lib/orders/hold-reasons.ts` - DEPRECATE (no payout holds)
4. `app/dashboard/admin/payouts/page.tsx` - Update to show fulfillment focus
5. `app/api/orders/[orderId]/disputes/resolve/route.ts` - Remove payout release
6. `lib/stripe/api.ts` - Remove `releasePayment()` function (already deprecated)

**Documentation Files (Update):**
- `docs/payments-current-state.md`
- `docs/internal/RUNBOOK_OPERATIONS.md`
- `knowledge_base/*.md` files mentioning escrow

**Search Results Summary:**
- 386 matches for `paid_held|ready_to_release|payoutHoldReason|stripeTransferId|releasedAt|releasedBy`
- Most are in comments, documentation, or already deprecated code
- Need to verify each file and remove/update as needed

---

## 10. TESTING REQUIREMENTS

### Unit Tests
- Status transition logic
- Transport option routing
- SLA deadline calculations
- Non-compliance flagging

### Integration Tests
- Full BUYER_TRANSPORT workflow
- Full SELLER_TRANSPORT workflow
- Dispute flow
- Admin freeze action

### E2E Tests
- Seller sets pickup info → Buyer selects window → Buyer confirms pickup
- Seller schedules delivery → Seller marks delivered → Buyer confirms receipt
- Dispute opening and resolution
- Admin freeze seller account

---

## NEXT STEPS

1. Review and approve this plan
2. Create new API endpoints for fulfillment workflows
3. Update existing endpoints to use `transactionStatus`
4. Update UI components to show transport-option-aware actions
5. Update Admin Ops to focus on fulfillment enforcement
6. Remove all escrow/hold/release code
7. Add SLA tracking and non-compliance flagging
8. Test end-to-end workflows
9. Deploy and monitor
