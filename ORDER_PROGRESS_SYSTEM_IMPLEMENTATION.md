# Order Progress System Implementation

**Date:** January 25, 2026  
**Status:** In Progress

## Overview

Implementing a unified "Order Progress System" that provides consistent UX across buyer, seller, and admin views, with clear next actions, automated reminders, and zero tolerance for payout hold language.

---

## Step 1: Shared Model ✅ COMPLETE

**Files Created:**
- `lib/orders/progress.ts` - Milestone tracking, next action determination, UX badges
- `lib/orders/copy.ts` - Centralized user-facing strings (NO payout hold language)

**Key Functions:**
- `getOrderMilestones(order)` - Returns transport-aware milestone array
- `getNextRequiredAction(order, role)` - Returns next action for buyer/seller/admin
- `getUXBadge(order, role)` - Returns consistent badge (never "Held (payout)")

---

## Step 2: Apply Next Action UX (IN PROGRESS)

### A) Seller Sales Page (`app/seller/sales/page.tsx`)
**Changes Needed:**
- Replace `getNextAction()` with `getNextRequiredAction(order, 'seller')`
- Add NextActionBanner per order card when action required
- Add SLA countdown chip on list view
- Use `getUXBadge()` for all status badges

### B) Buyer Purchases Page (`app/dashboard/orders/page.tsx`)
**Changes Needed:**
- Replace generic "Fulfillment in progress" with `getNextRequiredAction(order, 'buyer')`
- Show clear "Waiting on seller" vs "Action needed from you"
- Add inline CTAs for buyer actions
- Use `getUXBadge()` for all badges

### C) Admin Ops Page (`app/dashboard/admin/ops/page.tsx`)
**Changes Needed:**
- Show next action + owner on OrderCard using `getNextRequiredAction(order, 'admin')`
- Add "At Risk" grouping (SLA < 24h, stalled > 48h)
- Improve bulk selection UX

---

## Step 3: Remove Payout Hold Language (PENDING)

**Files to Update (26 found in app/, 3 in components/, 13 in lib/):**
- Search and replace all instances of:
  - "Held (payout)" → "Fulfillment in progress"
  - "payout hold" → "fulfillment tracking"
  - "release payout" → removed (sellers paid immediately)
  - "funds held" → "seller paid immediately"
  - "escrow" → "fulfillment"

**Critical Files:**
- `app/dashboard/orders/page.tsx` - Buyer purchases
- `app/seller/sales/page.tsx` - Seller sales
- `app/dashboard/admin/ops/page.tsx` - Admin ops
- `lib/orders/hold-reasons.ts` - Deprecate or remove
- All badge mapping functions

---

## Step 4: Automated Reminders + Escalation (PENDING)

**Files to Create:**
- `lib/reminders/orderReminders.ts` - Reminder computation logic
- `app/api/admin/reminders/run/route.ts` - Cron-friendly reminder runner

**Data Additions:**
- `order.lastStatusChangedAt` - Track status change timestamps
- `order.reminders: { buyerLastAt?, sellerLastAt?, buyerCount?, sellerCount? }`

**Reminder Windows:**
- 24h, 72h, 7d (configurable)
- Never spam: check `lastReminderAt` before sending

**Admin UX Enhancements:**
- "Send Reminder" dropdown with templates (gentle, firm, final)
- "Escalate" action flags order as "Admin Attention"

---

## Step 5: SendGrid Notifications (PENDING)

**Ensure Every Cross-Party Transition Triggers Email:**

**SELLER_TRANSPORT:**
- Seller scheduled delivery → notify buyer ✅
- Out for delivery → notify buyer ✅
- Mark delivered → notify buyer ✅
- Buyer confirmed receipt → notify seller ✅

**BUYER_TRANSPORT:**
- Seller set pickup info → notify buyer ✅
- Buyer selected pickup window → notify seller ✅
- Buyer confirmed pickup → notify seller ✅

**COMPLIANCE:**
- Compliance required → notify both ✅
- Buyer confirmed → notify seller ✅
- Seller confirmed → notify buyer ✅
- Both confirmed → notify both ✅

**Templates:**
- Use existing SendGrid integration
- Add clear CTA links to order detail pages
- Action-driven subject lines

---

## Step 6: Shared Truth Order Detail Experience (PENDING)

**Files to Create:**
- `components/orders/OrderMilestoneTimeline.tsx` - Unified milestone timeline

**Files to Update:**
- `app/dashboard/orders/[orderId]/page.tsx` - Buyer detail
- `app/seller/orders/[orderId]/page.tsx` - Seller detail
- `app/dashboard/admin/ops/page.tsx` - Admin detail modal

**Features:**
- "Next Step" card pinned at top
- Order Activity feed (status changes, reminders, compliance confirmations)
- Same milestone list for all roles (with role-specific ownership indicators)

---

## Step 7: QA Checklist (PENDING)

**SELLER_TRANSPORT Flow:**
- [ ] paid → fulfillment_required → schedule delivery → out for delivery → delivered pending → buyer confirms → completed
- [ ] Verify notifications fire at each cross-party step
- [ ] Verify list CTAs appear at correct times

**BUYER_TRANSPORT Flow:**
- [ ] paid → fulfillment_required → seller sets pickup info → buyer selects window → buyer confirms pickup code → completed
- [ ] Verify notifications + list CTAs

**COMPLIANCE GATE:**
- [ ] Regulated whitetail enters AWAITING_TRANSFER_COMPLIANCE
- [ ] Fulfillment buttons blocked
- [ ] Both confirm → transitions to FULFILLMENT_REQUIRED
- [ ] Reminders fire if either party does nothing

**ADMIN OPS:**
- [ ] Lanes correct
- [ ] At-risk grouping works
- [ ] Bulk reminders + per-order reminders work
- [ ] Audit log shows reminders and actions
- [ ] Freeze/export still works

---

## Implementation Priority

1. ✅ **Step 1** - Shared model (COMPLETE)
2. 🔄 **Step 2** - Next Action UX on list pages (IN PROGRESS)
3. ⏳ **Step 3** - Remove payout hold language
4. ⏳ **Step 4** - Automated reminders
5. ⏳ **Step 5** - Complete SendGrid notifications
6. ⏳ **Step 6** - Shared order detail experience
7. ⏳ **Step 7** - QA

---

## Notes

- All changes must maintain backward compatibility with existing orders
- No breaking changes to API contracts
- All user-facing strings must come from `lib/orders/copy.ts`
- Badge mapping must use `getUXBadge()` to prevent "Held (payout)" from appearing
