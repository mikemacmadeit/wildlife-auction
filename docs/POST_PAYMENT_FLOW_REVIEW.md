# Post-Payment Flow Review — Buyer & Seller

**Scope:** Everything after payment succeeds: order creation, fulfillment, delivery, completion, compliance, and disputes.  
**Date:** February 2026.

---

## 1. End-to-end flow (summary)

1. **Payment** — Buyer pays via Stripe Checkout (or wire). Webhook `checkout.session.completed` (or `async_payment_succeeded`) creates the order, marks listing sold, seller is paid immediately (destination charge). Order gets `transactionStatus: FULFILLMENT_REQUIRED` (or `AWAITING_TRANSFER_COMPLIANCE` for regulated whitetail).
2. **Compliance gate (optional)** — For regulated whitetail: both buyer and seller must confirm TPWD transfer compliance before fulfillment can start. UI: Compliance Transfer panel; API: compliance-transfer confirm.
3. **Delivery address** — Buyer sets address (or drops pin) on order page. API: `set-delivery-address`. Seller sees address on their order detail.
4. **Propose delivery** — Seller proposes one or more time windows. API: `fulfillment/schedule-delivery`. Status → `DELIVERY_PROPOSED`.
5. **Accept delivery date** — Buyer picks a window. API: `fulfillment/agree-delivery`. Status → `DELIVERY_SCHEDULED`.
6. **Out for delivery** — Seller (or driver) starts delivery: either “Mark out for delivery” or “Start live tracking,” or creates a delivery session and shares driver link. API: `start-delivery-tracking`, `mark-out-for-delivery`, or delivery session creation. Status → `OUT_FOR_DELIVERY`. If there’s a balance due (deposit flow), buyer pays final payment here to get delivery PIN.
7. **Delivery handoff** — Seller/driver opens delivery checklist: buyer enters PIN, signs, optional photo. Either:
   - **Checklist path:** Driver completes on device → `complete-delivery` → order goes to `COMPLETED` (no separate buyer confirm).
   - **Simple path:** Seller marks delivered without checklist → `mark-delivered` or `stop-delivery-tracking` with `DELIVERED` → `DELIVERED_PENDING_CONFIRMATION`; buyer can then “Confirm receipt” → `confirm-receipt` → `COMPLETED`.
8. **Completion** — Order `transactionStatus: COMPLETED`. Buyer can leave a review (eligibility and UI wired). Seller already paid at payment time; no payout release step.

**Disputes** — Buyer can open a dispute from order page when status is delivered/out for delivery/scheduled (and related). Admin resolves (refund / partial refund / release). Dispute flow has evidence upload and admin resolution API.

---

## 2. Buyer journey

**Where they see it:** Dashboard → Purchases (`/dashboard/orders`), then order detail (`/dashboard/orders/[orderId]`).

**What they see:**

- **Order list** — Status derived from `transactionStatus` (e.g. “Set delivery address”, “Accept delivery date”, “Out for delivery”, “Delivery”, “Complete”). Primary action (Set address, Choose date, Pay now, View order) and “waiting on” text come from `deriveOrderUIState` and `getNextRequiredAction`.
- **Order detail** — Order summary, listing/seller, amount, status badge, trust/issue badges. **OrderMilestoneTimeline** shows: Payment received → (if whitetail) TPWD compliance → Set delivery address → Propose delivery → Accept delivery date → Out for delivery → Inspection/final payment (if balance due) → Delivery → Transaction complete. Each step shows who owns it and whether it’s done.

**What they do:**

- Set delivery address (modal with form + optional map pin). Required before seller can propose times.
- Accept delivery date: choose one of the seller’s windows (agree-delivery).
- If balance due: pay final payment (inspection/final payment step) to get delivery PIN.
- At handoff: use PIN when driver asks (driver uses verify-pin); on buyer-confirm flow they can “Confirm receipt” after seller marks delivered.
- Open dispute (reason + evidence) when allowed by status.
- Leave a review when eligible (post-completion).

**Strengths:**

- Single order detail page with clear milestone timeline and “next step” actions.
- Delivery address can be set with map/pin; `?setAddress=1` and in-app prompt direct them to set address when needed.
- Compliance (TPWD) is clearly a gate before fulfillment; buyer sees “Confirm compliance” and both parties must confirm.
- Final payment (if any) and PIN are tied to the same milestone step so the flow is clear.
- Dispute and review are available from the same page where status is visible.

**Gaps / friction:**

- If seller never proposes delivery, buyer only sees “Waiting on seller to propose delivery” with no in-app nudge to seller (reminders exist on admin side).
- “Confirm receipt” still exists for the simple path (no checklist); with the checklist path, completion happens on driver complete — so two completion paths. Both work; wording could clarify “If the driver had you sign on their device, you’re all set” when status is DELIVERED_PENDING_CONFIRMATION after checklist.
- Review eligibility and “Leave a review” are wired; no major gap.

---

## 3. Seller journey

**Where they see it:** Seller → Sold (`/seller/sales`), then order detail (`/seller/orders/[orderId]`).

**What they see:**

- **Sales list** — Tabs: Needs action, In progress, Completed, Cancelled, All. “Needs action” = next required action is seller’s (from `getNextRequiredAction(..., 'seller')`). Orders show listing, buyer, amount, status; link to order detail.
- **Order detail** — Same milestone timeline concept as buyer, but from seller’s perspective: Payment received → (if whitetail) compliance → Set delivery address (seller sees “Waiting for buyer”) → Propose delivery (seller has “Propose delivery date” button) → Accept delivery date (seller sees “Waiting for buyer to choose”) → Out for delivery (Start tracking / Mark out for delivery / Driver link) → Delivery (Open delivery checklist) → Transaction complete.

**What they do:**

- Wait for buyer address, then **propose delivery** (one or more windows). Schedule-delivery API.
- After buyer agrees: **start delivery** — either “Mark out for delivery,” “Start live tracking,” or create delivery session and send driver link. Driver link gives a URL for the driver; driver gets buyer PIN entry and checklist (PIN, sign, photo).
- At handoff: **Open delivery checklist** — PIN verification, signature capture, optional photo. Submitting completes delivery (`complete-delivery` when using driver flow, or mark-delivered/stop with DELIVERED when not).
- Upload compliance docs (e.g. TPWD) and confirm compliance in Compliance Transfer panel when applicable.
- View disputes; respond via messages/admin; no seller “resolve” action (admin resolves).

**Strengths:**

- Needs action / in progress / completed tabs align with “what do I need to do” and “what’s done.”
- Propose delivery and agree-delivery are explicit steps; seller sees when buyer hasn’t chosen yet.
- Delivery session + driver link supports “someone else delivers”; same checklist flow.
- Live tracking (start/stop/mark delivered) is available and visible next to “Mark out for delivery.”
- Delivery checklist is required to complete delivery (PIN + sign + photo); no silent “mark delivered” without proof.
- Compliance gate blocks fulfillment until both confirm; seller sees clear message when blocked.

**Gaps / friction:**

- If buyer never sets address, seller only sees “Waiting for buyer to set delivery address” — again, no in-app nudge to buyer (admin reminders exist).
- Two ways to reach “delivered”: (1) full checklist → complete-delivery → COMPLETED, (2) mark out / stop with DELIVERED → DELIVERED_PENDING_CONFIRMATION → buyer confirm-receipt. Both valid; seller might not know which path buyer will see. Small UX copy improvement could clarify.
- Seller order detail is dense (timeline + tracking + checklist + compliance + documents). On small screens, “Open delivery checklist” could be more prominent when that’s the current step.

---

## 4. Compliance (TPWD / transfer)

- **Compliance Transfer panel** — Buyer and seller see it on order detail. Both must confirm (and can upload docs). API: compliance-transfer confirm (buyer/seller role, confirmed, optional upload URL). When both have confirmed, order moves from `AWAITING_TRANSFER_COMPLIANCE` to `FULFILLMENT_REQUIRED` and fulfillment UI unblocks.
- **Documents** — Listing and order documents (e.g. transfer approval, delivery proof) can be uploaded and are shown in panels; admin can verify. Storage and Firestore rules restrict access appropriately.
- **Whitetail** — Regulated whitetail deals are detected; compliance gate and attestation are used before listing goes live and before fulfillment. Logic in `lib/orders/status.ts`, `lib/orders/progress.ts`, and whitetail compliance helpers.

**Review:** Compliance is integrated into the status flow and blocks fulfillment until both parties confirm. Document upload and admin verification are in place. No major gap; optional improvement is clearer in-app copy that “both must confirm before delivery can be scheduled.”

---

## 5. Disputes

- **Open** — Buyer opens from order page when status allows (e.g. delivered, out for delivery, scheduled). API: `disputes/open` with reason and evidence. Order goes to `DISPUTE_OPENED`.
- **Evidence** — Both sides can add evidence; admin sees dispute packet and can resolve.
- **Resolve** — Admin only. API: `disputes/resolve` (e.g. release, refund, partial refund). Status and payouts are updated accordingly; seller was already paid so “release” doesn’t create a new transfer.

**Review:** Dispute flow is present and wired; buyer has a clear entry point, admin has resolution actions. No critical gap.

---

## 6. Status and data model

- **Source of truth** — `transactionStatus` (with fallback from legacy `status` in `getEffectiveTransactionStatus`) drives UI and transitions. Milestones and next actions are in `lib/orders/progress.ts` and `lib/orders/deriveOrderUIState.ts`.
- **Transitions** — Fulfillment APIs set both legacy `status` and `transactionStatus` where needed so list and detail stay in sync. Completion can be set by confirm-receipt, complete-delivery, or dispute resolve.
- **Seller paid** — Documented and implemented as “seller paid at payment time” (destination charge); no escrow or release step. Admin “Release” in UI is retired (toast: “Seller already paid”).

**Review:** Status model is consistent; dual legacy + transactionStatus exists for backward compatibility but effective status is centralized. No confusion in the post-payment flow.

---

## 7. Overall assessment

| Area | Verdict | Notes |
|------|--------|--------|
| **Payment → order** | ✅ Solid | Webhook creates order, marks listing sold, seller paid; idempotency and async payment handled. |
| **Buyer UX** | ✅ Good | Clear order list and detail, set address → accept date → (optional) pay final → PIN/sign or confirm receipt; disputes and reviews available. |
| **Seller UX** | ✅ Good | Needs action / in progress / completed; propose delivery, start delivery, checklist; driver link for third-party delivery. |
| **Delivery flow** | ✅ Good | Address → propose → agree → out for delivery → checklist (PIN/sign/photo) or mark delivered + buyer confirm. Two completion paths are both valid. |
| **Compliance** | ✅ Good | TPWD gate and Compliance Transfer panel; both parties must confirm before fulfillment. |
| **Disputes** | ✅ Good | Open, evidence, admin resolve; no critical gap. |
| **Status/model** | ✅ Good | transactionStatus-driven; milestones and next actions aligned with APIs. |

**Recommendations (non-blocking):**

1. **Copy** — When status is DELIVERED_PENDING_CONFIRMATION and delivery was completed via checklist (signature/photo present), add a short line for buyer: “You signed on the driver’s device; no further action needed.”
2. **Nudges** — Consider lightweight in-app nudges (e.g. “Buyer hasn’t set address yet — they’ll get a reminder”) so seller knows reminders exist; same for buyer when waiting on seller to propose.
3. **Mobile** — Seller order detail is dense; consider making “Open delivery checklist” more prominent on small screens when that’s the current step.

The post-payment flow is coherent, buyer and seller paths are clear, and compliance and disputes are integrated. It’s in good shape for launch from a flow and UX perspective.
