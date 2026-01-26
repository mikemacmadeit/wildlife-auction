# Order Progress System - Implementation Status

**Date:** January 25, 2026  
**Current Status:** Step 1 Complete, Step 2 In Progress

---

## ✅ COMPLETED

### Step 1: Shared Model ✅
**Files Created:**
- ✅ `lib/orders/progress.ts` (350+ lines)
  - `getOrderMilestones(order)` - Transport-aware milestone tracking
  - `getNextRequiredAction(order, role)` - Next action for buyer/seller/admin
  - `getUXBadge(order, role)` - Consistent badges (NEVER "Held (payout)")

- ✅ `lib/orders/copy.ts` (100+ lines)
  - Centralized user-facing strings
  - `ORDER_COPY` constant with all labels
  - `getStatusLabel(txStatus)` function
  - Zero payout hold language

**Key Features:**
- Transport-aware milestone computation (SELLER_TRANSPORT vs BUYER_TRANSPORT)
- Compliance gate milestone support
- Role-specific next action determination
- Consistent badge system that prevents "Held (payout)" from appearing

---

## 🔄 IN PROGRESS

### Step 2: Apply Next Action UX

**Seller Sales Page (`app/seller/sales/page.tsx`):**
- ✅ Updated to import `getNextRequiredAction` and `getUXBadge`
- ✅ Replaced `statusBadgeFromTransactionStatus` to use `getUXBadge()`
- ✅ Updated `getNextAction()` to use `getNextRequiredAction(order, 'seller')`
- ✅ Added SLA countdown chip to order cards
- ⏳ **TODO**: Add NextActionBanner component to each order card when action required
- ⏳ **TODO**: Add one-click CTA buttons in list (Schedule Delivery, Mark Out, etc.)

**Buyer Purchases Page (`app/dashboard/orders/page.tsx`):**
- ⏳ **TODO**: Replace generic "Fulfillment in progress" with `getNextRequiredAction(order, 'buyer')`
- ⏳ **TODO**: Show clear "Waiting on seller" vs "Action needed from you"
- ⏳ **TODO**: Add inline CTAs for buyer actions (Confirm Receipt, Select Pickup Window, etc.)
- ⏳ **TODO**: Use `getUXBadge()` for all status badges

**Admin Ops Page (`app/dashboard/admin/ops/page.tsx`):**
- ⏳ **TODO**: Show next action + owner on OrderCard using `getNextRequiredAction(order, 'admin')`
- ⏳ **TODO**: Add "At Risk" grouping (SLA < 24h, stalled > 48h)
- ⏳ **TODO**: Improve bulk selection UX (select all in lane, select all filtered)

---

## ⏳ PENDING

### Step 3: Remove Payout Hold Language

**Files Found with Payout/Hold Language (42 total):**
- `app/` - 26 files
- `components/` - 3 files  
- `lib/` - 13 files

**Critical Files to Update:**
1. `app/dashboard/orders/page.tsx` - Buyer purchases (already partially fixed)
2. `app/seller/sales/page.tsx` - Seller sales (already partially fixed)
3. `app/dashboard/admin/ops/page.tsx` - Admin ops (already partially fixed)
4. `lib/orders/hold-reasons.ts` - **DEPRECATE or REMOVE** (no longer needed)
5. All badge mapping functions - Replace with `getUXBadge()`

**Search & Replace Patterns:**
- "Held (payout)" → "Fulfillment in progress"
- "payout hold" → "fulfillment tracking"
- "release payout" → removed (sellers paid immediately)
- "funds held" → "seller paid immediately"
- "escrow" → "fulfillment"

---

### Step 4: Automated Reminders + Escalation

**Files to Create:**
1. `lib/reminders/orderReminders.ts`
   - `computeReminderPlan(order)` - Determines reminder windows (24h, 72h, 7d)
   - `shouldSendReminder(order, role, window)` - Checks if reminder should be sent
   - `getReminderTemplate(order, role, window)` - Returns template type (gentle, firm, final)

2. `app/api/admin/reminders/run/route.ts`
   - Cron-friendly endpoint (or Netlify scheduled function)
   - Queries orders where action required
   - Sends reminders via SendGrid + in-app notifications
   - Rate-limited batches (5-10 at a time)
   - Logs audit entries

**Data Schema Additions:**
```typescript
// Add to Order type (optional fields for backward compatibility)
lastStatusChangedAt?: Date;
reminders?: {
  buyerLastAt?: Date;
  sellerLastAt?: Date;
  buyerCount?: number;
  sellerCount?: number;
};
```

**Admin UX Enhancements:**
- "Send Reminder" dropdown with templates (gentle, firm, final)
- "Escalate" action flags order as "Admin Attention"
- Add internal notes field

---

### Step 5: Complete SendGrid Notifications

**Status Transitions to Verify:**
- ✅ Seller scheduled delivery → notify buyer (already implemented)
- ✅ Out for delivery → notify buyer (already implemented)
- ✅ Mark delivered → notify buyer (already implemented)
- ✅ Buyer confirmed receipt → notify seller (already implemented)
- ✅ Seller set pickup info → notify buyer (already implemented)
- ✅ Buyer selected pickup window → notify seller (already implemented)
- ✅ Buyer confirmed pickup → notify seller (already implemented)
- ✅ Compliance required → notify both (already implemented)
- ✅ Buyer confirmed compliance → notify seller (already implemented)
- ✅ Seller confirmed compliance → notify buyer (already implemented)
- ✅ Both confirmed compliance → notify both (already implemented)

**Action Items:**
- ⏳ Audit all notification triggers in webhook handlers
- ⏳ Ensure all cross-party transitions have email templates
- ⏳ Add clear CTA links to order detail pages in all emails
- ⏳ Make subject lines action-driven

---

### Step 6: Shared Truth Order Detail Experience

**Files to Create:**
1. `components/orders/OrderMilestoneTimeline.tsx`
   - Uses `getOrderMilestones(order)` from progress.ts
   - Shows same milestone list for all roles
   - Indicates role-specific ownership
   - Shows due dates and help text

**Files to Update:**
1. `app/dashboard/orders/[orderId]/page.tsx` (Buyer detail)
   - Add "Next Step" card at top using `getNextRequiredAction(order, 'buyer')`
   - Replace existing timeline with `OrderMilestoneTimeline`
   - Add "Order Activity" feed component

2. `app/seller/orders/[orderId]/page.tsx` (Seller detail)
   - Add "Next Step" card at top using `getNextRequiredAction(order, 'seller')`
   - Replace existing timeline with `OrderMilestoneTimeline`
   - Add "Order Activity" feed component

3. `app/dashboard/admin/ops/page.tsx` (Admin detail modal)
   - Add "Next Step" card using `getNextRequiredAction(order, 'admin')`
   - Add `OrderMilestoneTimeline` to detail modal
   - Add "Order Activity" feed

**Order Activity Feed:**
- Shows last status change
- Reminders sent (with timestamps)
- Compliance confirmations
- Dispute opened/closed
- Admin actions (freeze, escalate, etc.)

---

### Step 7: QA Checklist

**SELLER_TRANSPORT Flow:**
- [ ] paid → fulfillment_required → schedule delivery → out for delivery → delivered pending → buyer confirms → completed
- [ ] Verify notifications fire at each cross-party step
- [ ] Verify list CTAs appear at correct times
- [ ] Verify SLA countdown displays correctly
- [ ] Verify "Next Step" card updates correctly

**BUYER_TRANSPORT Flow:**
- [ ] paid → fulfillment_required → seller sets pickup info → buyer selects window → buyer confirms pickup code → completed
- [ ] Verify notifications + list CTAs
- [ ] Verify milestone timeline shows correct steps
- [ ] Verify pickup code confirmation works

**COMPLIANCE GATE:**
- [ ] Regulated whitetail enters AWAITING_TRANSFER_COMPLIANCE
- [ ] Fulfillment buttons blocked for buyer + seller
- [ ] Both confirm → transitions to FULFILLMENT_REQUIRED
- [ ] Reminders fire if either party does nothing
- [ ] Admin can see compliance status clearly

**ADMIN OPS:**
- [ ] Lanes correct (Overdue, Needs Action, Disputes, Completed)
- [ ] At-risk grouping works (SLA < 24h, stalled > 48h)
- [ ] Bulk reminders + per-order reminders work
- [ ] Audit log shows reminders and actions
- [ ] Freeze/export still works
- [ ] Next action shows correctly on OrderCard

---

## Implementation Notes

### Backward Compatibility
- All changes maintain backward compatibility with existing orders
- `getEffectiveTransactionStatus()` handles legacy status fields
- New fields (`lastStatusChangedAt`, `reminders`) are optional

### Performance Considerations
- Reminder engine should batch queries (max 50 orders per run)
- Rate limit reminder sends (5-10 per batch)
- Cache milestone computation results when possible

### Testing Strategy
1. Test with orders in each transactionStatus
2. Test both transport options (SELLER_TRANSPORT, BUYER_TRANSPORT)
3. Test compliance gate flow
4. Test reminder engine with various time windows
5. Verify no "Held (payout)" appears anywhere

---

## Next Steps

1. **Complete Step 2** - Finish applying Next Action UX to all 3 list pages
2. **Step 3** - Systematic search & replace of payout hold language
3. **Step 4** - Build reminder engine and cron route
4. **Step 5** - Audit and complete SendGrid notifications
5. **Step 6** - Create OrderMilestoneTimeline component
6. **Step 7** - Comprehensive QA testing

---

## Files Changed So Far

1. ✅ `lib/orders/progress.ts` - NEW (shared progress model)
2. ✅ `lib/orders/copy.ts` - NEW (centralized copy)
3. 🔄 `app/seller/sales/page.tsx` - PARTIAL (using new model, needs NextActionBanner)
4. ✅ `ORDER_PROGRESS_SYSTEM_IMPLEMENTATION.md` - NEW (implementation plan)
5. ✅ `ORDER_PROGRESS_SYSTEM_STATUS.md` - NEW (this file)
