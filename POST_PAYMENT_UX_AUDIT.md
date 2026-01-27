# Post-Payment UX + Order Completion Audit — Wildlife Exchange

**Date:** 2026-01-26  
**Scope:** Buyer, seller, and admin experience after payment; order lifecycle; friction, clarity, trust.  
**Type:** Product, UX, and operational flow audit (not code-correctness).

---

## 1. Executive Summary

| Item | Value |
|------|--------|
| **UX score** | 72 / 100 |
| **Verdict** | **Does this flow feel safe and obvious?** — **Partly.** Core flows work and ownership is clear in many states, but there are gaps in post-payment reassurance, “what next” clarity, and escalation paths. |
| **Summary** | Checkout redirects to `/dashboard/orders` with sensible banners (payment confirmed / processing). Order detail provides milestones, next actions, and Confirm Receipt / Report issue. Sellers get clear CTAs (Schedule Delivery, Mark Delivered, etc.). Admins have lanes (Overdue, Needs Action, Disputes, Completed), Remind buyer/seller, Refund, Resolve. Gaps: **no explicit “Message seller” from order context**; **check-in dialog uses “Mark delivered” for buyer** (copy conflates buyer confirm vs seller mark); **legacy “Status” / “Payment”** on order detail can confuse vs `transactionStatus`; **Admin “Confirm delivery”** lives on Payouts, not Ops, and “protection window” language persists despite immediate seller payouts; **dispute vs “Report issue”** terminology split; **delivery check-in** email deep-link is strong but not surfaced in-app. |

---

## 2. Buyer Journey (Post-Payment)

### 2.1 Immediate post-checkout

- **Landing:** Stripe `success_url` → `/dashboard/orders?session_id={CHECKOUT_SESSION_ID}`. URL is then cleaned to `/dashboard/orders`; banner state kept briefly via `sessionStorage`.
- **Banners:**
  - **Payment confirmed:** “Payment confirmed. Your order will appear below shortly.”
  - **Bank processing:** “Your bank payment is processing. Your order may take a little time to confirm. Check back shortly.”
  - **Verify failed:** “Couldn’t verify checkout session” / “Checkout verification failed” — orders still load.
- **Pending row:** If session is tracked, a “Recent purchase” / listing title card shows “Bank payment processing…” or “Finalizing your order…” with session ID snippet. Orders list loads; reconcile runs for pending orders with `stripeCheckoutSessionId`.

**Clarity:** Good. User knows payment succeeded or is processing and that the order will appear. Minor gap: no explicit “You’ll receive an email when the order is confirmed” (emails exist, but in-app copy doesn’t set that expectation).

### 2.2 Orders list (`/dashboard/orders`)

- Orders shown as cards: listing title, seller, amount, status-like info, timeline rail, primary CTA.
- **Status derivation:** `deriveOrderUIState` + `getNextRequiredAction(order, 'buyer')`. User sees labels such as “Confirm receipt,” “Select pickup window,” “Waiting on seller,” etc.
- **Actions:** Confirm Receipt (inline when `DELIVERED_PENDING_CONFIRMATION`), “Open Dispute” from drawer, or navigate to order detail for pickup flows.
- **Filters:** Tabs for status (e.g. action needed, completed). Tour target: `orders-list`.

**Clarity:** Generally good. Next step and “waiting on” are visible. Drawback: **no “Message seller”** or “Contact seller” from the order card/drawer. User can “View seller” (profile) or “View listing,” but in-order messaging is not obvious.

### 2.3 Order detail (`/dashboard/orders/[orderId]`)

- **Header:** Order title, listing, seller, “View listing” / “View seller,” amount, trust/issue badges.
- **Next step card:** Renders `getNextRequiredAction(order, 'buyer')` — title, description, due date, CTA.
- **NextActionBanner:** Role-aware (buyer), urgency (SLA), “Confirm receipt” / “Select pickup window” / “Confirm pickup” etc. Scrolls to relevant section.
- **ComplianceTransferPanel:** TPWD transfer compliance when applicable.
- **OrderMilestoneTimeline** + **TransactionTimeline:** Progress, who owns each step.
- **Fulfillment Status card:**
  - **SELLER_TRANSPORT:** ETA, transporter, then either “Confirm Receipt” CTA, “Out for delivery” / “Delivery scheduled” passive state, or “Waiting for seller to start.”
  - **BUYER_TRANSPORT:** Pickup location, windows, pickup code, “Select pickup window” / “Confirm pickup” with code input.
- **Report an issue:** Section with “Report an issue” button → `disputeOrder(…)` (“Issue reported”). No separate “Open dispute” wording here.
- **Order details:** Listing link, **Status** (shows `order.status`), **Payment** (e.g. `paymentMethod`). **Gap:** Status is legacy; `transactionStatus` drives logic. Possible confusion between “status” and actual fulfillment state.
- **Bill of sale:** View/download, “I have signed,” optional upload.

**Clarity:** Good for fulfillment steps and CTAs. **Gaps:** (1) No “Message seller” or “Contact seller” in order context. (2) “Report an issue” vs “Open dispute” (list drawer) — terminology split. (3) Trust/ protection: copy stresses “Seller paid immediately”; protection window exists but is not clearly explained in-ui. (4) Help/support: no explicit “Get help” or “Contact support” link on order detail.

### 2.4 Delivery check-in (`?checkin=1`)

- **Trigger:** Email / in-app “delivery check-in” links use `.../orders/[orderId]?checkin=1`. Opens a modal.
- **Modal:** “Delivery check-in” — “If delivery arrived, mark it delivered (confirm receipt). If something isn’t right, report an issue…”
- **Actions:** “Not now,” “I have an issue” → `?issue=1` (scroll to report-issue), “Mark delivered” → `confirmReceipt(order.id)`.

**Clarity:** **Problem:** Button says **“Mark delivered”** but the action is **buyer “Confirm receipt.”** “Mark delivered” is seller language. Buyer may think they’re doing the same thing as the seller or that they’re “marking” delivery rather than confirming receipt. Copy should say **“Confirm receipt”** or **“Yes, I received it.”**

### 2.5 Dispute / report issue

- **Order detail:** “Report an issue” → dispute opened with generic reason “Issue reported” / “Opened from order page.” Toast: “We’ll review and follow up.”
- **Orders list drawer:** “Open Dispute” dialog — Reason (required), Additional details. Submit → “Admin will review and resolve.”

**Clarity:** Two entry points, two wordings (“Report an issue” vs “Open dispute”). Both open a dispute, but the order-detail path uses a fixed reason. Users might not know these are the same thing. **Recommendation:** Unify language and ensure order-detail flow captures a reason (or explicitly reuses “Report an issue” as the dispute type).

---

## 3. Seller Journey (Post-Payment)

### 3.1 When an order is paid

- Seller sees the order in **Seller** → **Orders** (and **Sales**). Order detail: `/seller/orders/[orderId]`.

### 3.2 Order detail (`/seller/orders/[orderId]`)

- **FulfillmentPanel:** Status badge (`transactionStatus`), transport-specific blocks.
- **SELLER_TRANSPORT:**
  - **FULFILLMENT_REQUIRED / PAID:** “Schedule Delivery” — ETA, transporter. Opens dialog → `schedule-delivery` API.
  - **DELIVERY_SCHEDULED:** “Mark Out for Delivery” → `mark-out-for-delivery` API.
  - **OUT_FOR_DELIVERY / DELIVERY_SCHEDULED:** “Mark Delivered” → `mark-delivered` API.
  - **DELIVERED_PENDING_CONFIRMATION:** “Waiting on buyer confirmation.”
  - **DISPUTE_OPENED:** “Dispute Opened” + link to “report-issue” (scroll).
- **BUYER_TRANSPORT:**
  - **FULFILLMENT_REQUIRED / PAID:** “Set Pickup Info” (location, windows, code) → `set-pickup-info` API.
  - **READY_FOR_PICKUP / PICKUP_SCHEDULED:** “Waiting on buyer” to schedule/confirm pickup.

**Clarity:** Clear. Next steps and ownership are obvious. SLA/deadline urgency could be more prominent (e.g. in NextActionBanner); it exists but varies by implementation.

### 3.3 Compliance gate

- **AWAITING_TRANSFER_COMPLIANCE:** Panel explains both parties must confirm TPWD transfer compliance. Blocks fulfillment until unlocked. **Clarity:** Good.

### 3.4 Dead zones

- **DELIVERY_SCHEDULED** → “Mark out for delivery”: Clear.
- **OUT_FOR_DELIVERY** → “Mark delivered”: Clear.
- No obvious dead zone where the seller is stuck with no next step, assuming SLA reminders and emails are running.

---

## 4. Admin Journey (Order Shepherding)

### 4.1 Ops dashboard (`/dashboard/admin/ops`)

- **Lanes:** Overdue | Needs Action | Disputes | Completed. Counts and “at risk” (SLA approaching / stalled) in Needs Action.
- **Search:** By order ID, listing ID, buyer/seller email, payment intent ID.
- **Bulk:** Hold / Unhold (fulfillment), Remind Sellers, Remind Buyers. Selection via checkboxes.
- **Order cards (OrderCard):** Order ID, UX badge, listing, next action (from `getNextRequiredAction(order, 'admin')`), buyer/seller, amount, “Seller paid immediately…”. Actions: **View**, **Mark Paid** (if awaiting bank rails), **Refund.**
- **Dispute cards (DisputeCard):** View Evidence, **Resolve.**

**Clarity:** Admins can quickly see stuck orders (Overdue), at-risk, and disputes. **Gaps:** (1) **“Confirm delivery”** is not in Ops; it lives on **Payouts**. Admins focused on fulfillment may not think to use Payouts for that. (2) “Protection window” / “Confirm delivery” copy implies hold/release; sellers are paid immediately. (3) Nudge vs override: Remind is clearly a nudge; Refund / Resolve are overrides. Hold/Unhold are overrides but less clearly framed as “override” vs “reminder.”

### 4.2 Order detail (admin)

- **Dialog:** Order info, compliance block, fulfillment status, timeline, AI summary (when enabled), dispute summary for disputed orders.
- **Actions:** Remind Seller, Remind Buyer (compliance-specific when in gate), Freeze Seller, Export Dispute Packet. **No “Confirm delivery”** in this dialog.

### 4.3 Payouts page

- **Confirm delivery** exists here (`onConfirmDelivery`). Used when admin confirms delivery on behalf of buyer (e.g. proof of delivery). **Issue:** Fulfillment-focused admins use Ops; “Confirm delivery” being only on Payouts splits intervention surfaces.

### 4.4 Audit / reversibility

- Refunds, dispute resolution, hold/unhold, confirm delivery all go through API routes; audit logging exists. Reversibility is limited (e.g. refunds cannot be “undone” in-app). **Recommendation:** Keep audit trail, and consider short “Admin took X” explanations in UI (e.g. “Delivery confirmed by admin on …”) so support and users understand what happened.

---

## 5. Order State Progression

### 5.1 Lifecycle (simplified)

```
Paid (PENDING_PAYMENT → FULFILLMENT_REQUIRED / AWAITING_TRANSFER_COMPLIANCE)
  → [Compliance gate if regulated]
  → FULFILLMENT_REQUIRED
  → SELLER_TRANSPORT: DELIVERY_SCHEDULED → OUT_FOR_DELIVERY → DELIVERED_PENDING_CONFIRMATION
     BUYER_TRANSPORT:  READY_FOR_PICKUP → PICKUP_SCHEDULED → PICKED_UP
  → Buyer confirms (confirm-receipt / confirm-pickup)
  → COMPLETED

Alternatively: DISPUTE_OPENED → admin Resolve (release / refund / partial refund) → COMPLETED or REFUNDED.
Terminal: REFUNDED, CANCELLED.
```

### 5.2 Dead zones / confusion

| State | Issue | Owner |
|-------|--------|-------|
| **DELIVERED_PENDING_CONFIRMATION** | Buyer check-in modal uses “Mark delivered” instead of “Confirm receipt.” | Buyer |
| **FULFILLMENT_REQUIRED** | Buyer sees “Waiting on seller”; seller sees “Schedule delivery.” No explicit “by when” in prominent UI (SLA exists in backend). | Seller |
| **Order detail Status** | Shows `order.status` (legacy); actual behavior uses `transactionStatus`. | Buyer |
| **Confirm delivery (admin)** | Only on Payouts; not in Ops. Admins may not find it. | Admin |

### 5.3 Duplicate / conflicting actions

- **Confirm receipt (buyer)** vs **Mark delivered (seller):** Different actions, but check-in modal uses “Mark delivered” for the buyer confirm step. **Conflict:** wording.
- **Report an issue** vs **Open dispute:** Same outcome (dispute opened), different labels and flows. **Recommendation:** Align naming and, if possible, reason capture.

---

## 6. Friction Points Table

| # | Location | Who | Why | Severity |
|---|----------|-----|-----|----------|
| 1 | Order detail, “Order details” | Buyer | “Status” shows legacy `order.status`; logic uses `transactionStatus`. Can confuse. | Medium |
| 2 | Delivery check-in modal | Buyer | “Mark delivered” for buyer confirm receipt. Seller-term. | High |
| 3 | Order detail / Orders list | Buyer | No “Message seller” or “Contact seller” in order context. | Medium |
| 4 | Order detail “Report issue” vs list “Open dispute” | Buyer | Two terms for same action; order detail uses fixed reason. | Medium |
| 5 | Admin Ops | Admin | “Confirm delivery” not in Ops; only on Payouts. | Medium |
| 6 | Admin copy | Admin | “Protection window” / “Confirm delivery” amid “seller paid immediately.” Feels legacy. | Low |
| 7 | Post-checkout | Buyer | No in-app mention that “you’ll get an email when order is confirmed.” | Low |
| 8 | Order detail | Buyer | No explicit “Get help” / “Contact support” link. | Low |
| 9 | Seller fulfillment | Seller | SLA urgency exists but could be more prominent on order detail. | Low |
| 10 | Dispute resolve | Admin | Resolve/refund are clear overrides; “nudge vs override” could be more explicit in UI. | Low |

---

## 7. Trust Risk Assessment

- **Positive:** “Seller paid immediately” is stated clearly. No escrow/hold/release language in main ORDER_COPY. Milestones and next actions reduce “what’s going on?” anxiety.
- **Risks:**
  1. **Check-in “Mark delivered”:** Buyer may misunderstand who does what or that they’re confirming receipt, not “marking” delivery. Erodes clarity.
  2. **Missing “Message seller”:** If something is wrong, user may not know they can message before disputing. Could push unnecessary disputes.
  3. **Status vs transactionStatus:** Power users or support might rely on “Status” and get a different picture than actual state.
  4. **Admin “Confirm delivery” on Payouts only:** Could delay intervention when buyer is unresponsive but delivery is proven.

---

## 8. Copy & Tone Audit

- **Calm / trust-building:** Most of ORDER_COPY and progress copy is neutral and clear. “Seller paid immediately,” “Transaction complete,” “Waiting on seller/buyer” set expectations.
- **Legalistic / cold:** “TPWD transfer compliance,” “Report an issue” — functional but slightly formal. No strong negatives.
- **Escrow/custody:** Correctly avoided. No “funds held,” “release payout” in primary user-facing strings.
- **Suggestions:** (1) Prefer “Confirm receipt” / “I received it” over “Mark delivered” for buyer. (2) Add a single, clear “Contact seller” / “Message seller” from order context. (3) Unify “Report an issue” / “Open dispute” and ensure reason is captured where intended. (4) Add one short “Get help” or “Contact support” on order detail.

---

*End of audit.*
