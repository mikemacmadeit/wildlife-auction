# PHASE 6 UI IMPLEMENTATION — REMAINING WORK

## STATUS: Core Backend Complete, UI Updates In Progress

### ✅ COMPLETED

1. **Status Migration** - `getEffectiveTransactionStatus()` helper created and integrated
2. **Platform Fee** - Updated to 10% everywhere
3. **Webhook Handlers** - Set `FULFILLMENT_REQUIRED` + SLA timestamps
4. **Fulfillment Endpoints** - All 6 new endpoints created
5. **Admin Actions** - All 4 admin endpoints created
6. **SLA Monitoring** - Background job created
7. **Core Helpers** - `deriveOrderUIState` and `getOrderTrustState` use transactionStatus
8. **Seller Sales Page** - Partially updated (badge, filters, next action buttons added)
9. **Buyer Orders Page** - Partially updated (status functions, action routing)

### ⚠️ REMAINING UI WORK

#### 1. Seller Sales Page (`app/seller/sales/page.tsx`)
**Status:** Partially complete
- ✅ Badge uses transactionStatus
- ✅ Filters use transactionStatus
- ✅ Next action buttons added
- ⚠️ Need to verify all status displays use transactionStatus
- ⚠️ Need to ensure fee display shows 10%

#### 2. Seller Order Detail (`app/seller/orders/[orderId]/page.tsx`)
**Status:** Needs transport-aware panel replacement
- ⚠️ Replace "Delivery actions" card with transport-aware fulfillment panel
- ⚠️ Add dialogs for:
  - Schedule Delivery (SELLER_TRANSPORT)
  - Mark Out for Delivery (SELLER_TRANSPORT)
  - Set Pickup Info (BUYER_TRANSPORT)
- ✅ Dialogs added at end of file
- ⚠️ Need to replace CardContent section (exact match issue)

#### 3. Buyer Orders Page (`app/dashboard/orders/page.tsx`)
**Status:** Partially complete
- ✅ Status functions updated
- ✅ Action routing updated
- ⚠️ Need to verify all displays use transactionStatus

#### 4. Buyer Order Detail (`app/dashboard/orders/[orderId]/page.tsx`)
**Status:** Needs transport-aware panels
- ⚠️ Add pickup workflow UI (BUYER_TRANSPORT)
- ⚠️ Add delivery workflow UI (SELLER_TRANSPORT)
- ⚠️ Add pickup window selection form
- ⚠️ Add pickup confirmation form (with code input)

#### 5. Admin Ops (`app/dashboard/admin/ops/page.tsx`)
**Status:** Partially complete
- ✅ Tab keys updated
- ✅ Stats calculation updated
- ✅ Dispute dialog updated
- ⚠️ Need to update OrderCard component
- ⚠️ Remove "Payout Hold Information" section
- ⚠️ Add "Fulfillment Status" section
- ⚠️ Add "Freeze Seller" button
- ⚠️ Add "Export Dispute Packet" button

---

## QUICK FIXES NEEDED

### File: `app/seller/orders/[orderId]/page.tsx`
**Issue:** CardContent section still has legacy "Mark preparing", "Mark in transit" buttons
**Fix:** Replace lines 209-293 with transport-aware content (see code above)

### File: `app/dashboard/orders/[orderId]/page.tsx`
**Issue:** Needs pickup/delivery UI panels
**Fix:** Add transport-aware fulfillment panels similar to seller order detail

### File: `app/dashboard/admin/ops/page.tsx`
**Issue:** OrderCard still uses legacy status, has "Payout Hold Information"
**Fix:** 
- Update OrderCard to use `getEffectiveTransactionStatus()`
- Replace "Payout Hold Information" with "Fulfillment Status"
- Add freeze/export buttons

---

## MANUAL QA CHECKLIST

### SELLER_TRANSPORT Workflow:
1. ✅ Buy listing → Order created → Status: `FULFILLMENT_REQUIRED`
2. ⚠️ Seller schedules delivery → Status: `DELIVERY_SCHEDULED` (UI needs dialog)
3. ⚠️ Seller marks out → Status: `OUT_FOR_DELIVERY` (UI needs button)
4. ⚠️ Seller marks delivered → Status: `DELIVERED_PENDING_CONFIRMATION` (UI needs button)
5. ⚠️ Buyer confirms receipt → Status: `COMPLETED` (UI needs button)
6. ⚠️ Admin sees fulfillment progress, no payout controls (Admin Ops needs update)

### BUYER_TRANSPORT Workflow:
1. ✅ Buy listing → Order created → Status: `FULFILLMENT_REQUIRED`
2. ⚠️ Seller sets pickup info → Status: `READY_FOR_PICKUP` + pickup code (UI needs dialog)
3. ⚠️ Buyer selects window → Status: `PICKUP_SCHEDULED` (UI needs form)
4. ⚠️ Buyer confirms pickup with code → Status: `COMPLETED` (UI needs form)
5. ⚠️ Admin sees fulfillment progress, no payout controls (Admin Ops needs update)

---

## NEXT IMMEDIATE STEPS

1. **Fix seller order detail CardContent** - Use write tool to replace entire section
2. **Add buyer order detail panels** - Add transport-aware UI
3. **Complete Admin Ops OrderCard** - Remove payout references, add fulfillment status
4. **Final cleanup** - Remove hold-reasons.ts usage, text cleanup
