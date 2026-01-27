# Post-Payment Improvement Plan — Wildlife Exchange

**Date:** 2026-01-26  
**Based on:** POST_PAYMENT_UX_AUDIT.md  

**Principles:** Small, high-impact changes only. No backend refactors unless necessary. Focus on UI clarity, CTA timing, status language, and admin nudges.

---

## Immediate (Pre-Launch)

### 1. Fix check-in modal: “Mark delivered” → “Confirm receipt”

- **Where:** `app/dashboard/orders/[orderId]/page.tsx` — delivery check-in `Dialog` (checkin=1).
- **What:** Change the primary button label from **“Mark delivered”** to **“Confirm receipt”** or **“Yes, I received it.”** Keep the modal title and body; optionally add one line: “Confirming receipt completes the transaction.”
- **Why:** Buyer performs “confirm receipt,” not “mark delivered.” Reduces confusion and aligns with fulfillment copy.
- **Effort:** Copy change only.

### 2. Surface “Confirm delivery” in Admin Ops

- **Where:** `app/dashboard/admin/ops/page.tsx` — Order detail dialog footer and/or OrderCard actions.
- **What:** When order is `DELIVERED_PENDING_CONFIRMATION` (and not disputed), show a **“Confirm delivery”** button that calls `confirmDelivery(orderId)`. Reuse existing `handleConfirmDelivery` logic from payouts or extract to shared helper.
- **Why:** Admins shepherding orders in Ops today cannot confirm delivery without switching to Payouts.
- **Effort:** Add one CTA + wire to existing API. No new endpoints.

### 3. Add “Message seller” / “Contact seller” in order context (buyer)

- **Where:** Buyer order detail `app/dashboard/orders/[orderId]/page.tsx` (e.g. next to “View listing” / “View seller”) and optionally in orders list drawer.
- **What:** Add a **“Message seller”** (or “Contact seller”) link. Route to `/dashboard/messages` with order/listing context if your messages UI supports it; otherwise to a thread or compose flow that pre-fills listing/seller.
- **Why:** Buyers often want to ask questions before disputing. Reduces “I have a problem but don’t know how to reach the seller” friction.
- **Effort:** Link + routing. Depends on messages UX; keep minimal (e.g. “Message seller” → messages filtered by listing/order if available).

### 4. Unify “Report issue” / “Open dispute” language

- **Where:** Order detail (“Report an issue” section) and orders list dispute dialog.
- **What:** Use one primary term everywhere, e.g. **“Report an issue”** or **“Open a dispute.”** Ensure order-detail flow captures a **reason** (reuse or mirror the list-dialog reason input) instead of a fixed “Issue reported” string. Tooltip or short help: “Admin will review and follow up.”
- **Why:** Same action, two labels, causes confusion. Fixed reason from order detail reduces usefulness for support.
- **Effort:** Copy + minimal form change (add reason field to order-detail report flow if missing).

---

## Nice-to-Have (Post-Launch)

### 5. Order detail “Status” use transactionStatus

- **Where:** `app/dashboard/orders/[orderId]/page.tsx` — “Order details” card showing `order.status`.
- **What:** Derive display from `getEffectiveTransactionStatus` (or `getStatusLabel`) instead of raw `order.status`. Keep “Payment” as-is for now.
- **Why:** Status shown matches logic and progress; less confusion for support and power users.
- **Effort:** Small refactor in one component.

### 6. Post-checkout banner: set email expectation

- **Where:** Orders list checkout return banner (success / processing).
- **What:** Add one line, e.g. “We’ll email you when the order is confirmed” (for processing) or “You’ll receive a confirmation email shortly” (for confirmed).
- **Why:** Reduces “I paid, where’s my order?” anxiety; aligns with actual email flows.
- **Effort:** Copy change.

### 7. “Get help” / “Contact support” on order detail

- **Where:** Buyer order detail, e.g. footer of main card or next to “Report an issue.”
- **What:** Add **“Get help”** or **“Contact support”** linking to your help/contact page or in-app support flow.
- **Why:** Explicit escalation path; complements “Message seller” and “Report an issue.”
- **Effort:** Link only.

### 8. Admin: clarify “nudge vs override”

- **Where:** Admin Ops order detail dialog — actions section.
- **What:** Group actions, e.g. “Nudge: Remind buyer / Remind seller” vs “Override: Confirm delivery, Refund, Resolve dispute.” Optional short tooltip: “Override actions change order state permanently.”
- **Why:** Reduces accidental overrides and makes admin intent clearer.
- **Effort:** Layout + labels; optional tooltips.

### 9. Seller: make SLA urgency more prominent

- **Where:** Seller order detail, e.g. `NextActionBanner` or FulfillmentPanel when SLA is approaching or overdue.
- **What:** Ensure SLA countdown or “X hours remaining” / “Overdue” is clearly visible near “Schedule delivery” / “Set pickup info” / “Mark delivered” CTAs. Reuse existing `fulfillmentSlaDeadlineAt` and urgency logic.
- **Why:** Motivates seller action before overdue; matches backend reminder policy.
- **Effort:** UI emphasis; data already available.

### 10. Soften “protection window” in admin Confirm delivery

- **Where:** Admin “Confirm delivery” flow (Payouts and, once added, Ops). Any copy that says “protection window” or “start protection.”
- **What:** Short, accurate line, e.g. “Confirm delivery on behalf of the buyer (e.g. proof of delivery). This completes the order.” Avoid “protection window” if it’s legacy relative to immediate seller payouts; or add a brief note that it’s for dispute timing, not payout hold.
- **Why:** Aligns with “seller paid immediately” and reduces mixed messages.
- **Effort:** Copy only.

---

## Summary

| Priority | Item | Type |
|----------|------|------|
| Immediate | Check-in “Mark delivered” → “Confirm receipt” | Copy |
| Immediate | “Confirm delivery” in Admin Ops | UI + wiring |
| Immediate | “Message seller” in order context | Link + routing |
| Immediate | Unify Report issue / Open dispute + reason | Copy + form |
| Nice-to-have | Order Status from transactionStatus | Refactor |
| Nice-to-have | Post-checkout email expectation | Copy |
| Nice-to-have | “Get help” on order detail | Link |
| Nice-to-have | Admin nudge vs override grouping | Layout + labels |
| Nice-to-have | Seller SLA prominence | UI emphasis |
| Nice-to-have | “Protection window” clarification | Copy |

---

*End of plan.*
