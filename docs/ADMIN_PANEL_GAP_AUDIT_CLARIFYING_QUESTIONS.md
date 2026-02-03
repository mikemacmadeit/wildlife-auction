# Admin Panel Gap Audit — Clarifying Questions

**Purpose:** Identify missing information that prevents precise, low-risk implementation of P0 and P1 admin gaps.  
**Scope:** Evidence-based questions only. No implementation suggestions.

---

## 1. Stripe Webhook Event Logging

1. **Are Stripe webhook events currently persisted anywhere beyond idempotency keys?**
   - **Why this matters:** Determines whether the Webhook Event Log is UI-only (query existing data) or requires new persistence/schema.
   - **Evidence:** `app/api/stripe/webhook/route.ts` L157–201 — writes to `stripeEvents/{eventId}` with `type`, `createdAt`, and type-specific IDs (`checkoutSessionId`, `paymentIntentId`, `disputeId`, `chargeId`). No `orderId`, `status`, or `errorMessage`.
   - **Impact if unanswered:** Risk of duplicating storage vs. extending `stripeEvents` schema.

2. **Does `stripeEvents` need a Firestore rule change for admin read access?**
   - **Why this matters:** If the admin UI will read via a new API route (Admin SDK), no rule change. If client will read directly, rules must allow it.
   - **Evidence:** `firestore.rules` L693–696 — `allow read, write: if false` (server-only, no client access).
   - **Impact if unanswered:** Incorrect assumption about read path (API vs. client).

3. **For webhook “retry”: should retry re-invoke Stripe’s event, or re-run our handler with stored payload?**
   - **Why this matters:** Stripe does not support event retry from our side; we can only re-run our handler. Stored payload may be incomplete (we don’t persist full `event.data.object`).
   - **Evidence:** `app/api/stripe/webhook/route.ts` — only `event.id` and type-specific IDs stored. Full event body is not persisted.
   - **Impact if unanswered:** “Retry” feature may be impossible or require fetching event from Stripe API first.

---

## 2. Audit Logs (Scope, Completeness, Visibility)

4. **Is there an index that supports a global audit log query (`auditLogs` ordered by `createdAt` desc only)?**
   - **Why this matters:** Audit Log Viewer needs a “recent activity” list. Existing indexes are `orderId`+`createdAt`, `listingId`+`createdAt`, `actorUid`+`createdAt`, `targetUserId`+`createdAt`.
   - **Evidence:** `firestore.indexes.json` L628–681 — no collection-only `createdAt` desc index for `auditLogs`.
   - **Impact if unanswered:** Query may fail at runtime or require a new composite index.

5. **Should the Audit Log Viewer support filtering by `actionType` and date range together?**
   - **Why this matters:** Composite filters (e.g. `where('actionType','==',x).orderBy('createdAt','desc')`) need a matching composite index.
   - **Evidence:** `firestore.indexes.json` — no `actionType`+`createdAt` index for `auditLogs`.
   - **Impact if unanswered:** Over-scoping filters that would need new indexes vs. minimal filters that work with existing indexes.

6. **Does `getAuditLogsForOrder` require Admin SDK, or can it run in a client context?**
   - **Why this matters:** Order audit in Ops could call this server-side or via a new admin API. `auditLogs` rules allow read only for `isAdmin()`.
   - **Evidence:** `lib/audit/logger.ts` L192–207 — `getAuditLogsForOrder` uses Firestore Admin SDK (server-only).
   - **Impact if unanswered:** Order audit in Ops must be implemented via an admin API route, not direct client Firestore access.

---

## 3. Cron / Scheduled Function Run Tracking

7. **Which Netlify scheduled functions should write to `systemRuns` (or equivalent)?**
   - **Why this matters:** Only `finalizeAuctions` and `aggregateRevenue` currently write to `opsHealth`. There are ~14 scheduled functions.
   - **Evidence:** `netlify/functions/*.ts` — `finalizeAuctions`, `expireListings`, `expireOffers`, `expireUnpaidAuctions`, `emitAuctionOutcomeEvents`, `checkFulfillmentReminders`, `checkFulfillmentSla`, `processNotificationEvents`, `dispatchEmailJobs`, `dispatchPushJobs`, `dispatchSmsJobs`, `savedSearchInstant`, `savedSearchWeeklyDigest`, `aggregateRevenue`, `orderDeliveryCheckIn`, `clearExpiredPurchaseReservations`.
   - **Impact if unanswered:** Scope creep (all functions) vs. MVP (e.g. payment/order-critical only).

8. **Should cron run history live in `opsHealth` (one doc per job, overwritten) or in a new `systemRuns` collection (append-only)?**
   - **Why this matters:** `opsHealth` is doc-per-job with last-run info. `systemRuns` would keep full history.
   - **Evidence:** `app/api/admin/health/route.ts` L91–99 — reads `opsHealth/autoReleaseProtected`, `opsHealth/stripeWebhook`, `opsHealth/aggregateRevenue`.
   - **Impact if unanswered:** Wrong data model (no history vs. unbounded growth).

---

## 4. Delivery Proof & Token Handling

9. **Where is delivery proof (signature, photo) stored, and is it already included in the order payload returned to Ops?**
   - **Why this matters:** Determines if Delivery Proof Viewer is a UI-only addition to Ops or needs a new API/query.
   - **Evidence:** `orders.delivery.signatureUrl`, `orders.delivery.deliveryPhotoUrl`, `orders.deliveryProofUrls`; `app/dashboard/orders/[orderId]/page.tsx` L695–767 and `app/seller/orders/[orderId]/page.tsx` L373–384 show proof. Ops uses `getAdminOrders` / order detail.
   - **Impact if unanswered:** Duplicate reads or missing fields in Ops order detail.

10. **Are delivery tokens/sessions stored in Firestore, or are they ephemeral (JWT/session only)?**
    - **Why this matters:** Token revoke (P2) needs a revocation store if tokens are not stateless.
    - **Evidence:** `app/api/delivery/create-session/route.ts`, `verify-token/route.ts`, `verify-pin/route.ts` — token flow not fully traced.
    - **Impact if unanswered:** Revoke may require new persistence or is not feasible for stateless tokens.

---

## 5. Order Ops Overrides & Guardrails

11. **Does the Ops order detail modal/drawer already receive the full order object including `delivery` and `timeline`?**
    - **Why this matters:** Order audit trail and delivery proof can be added to existing UI if the data is present.
    - **Evidence:** `app/dashboard/admin/ops/OpsClient.tsx` — uses `getAdminOrders` and `OrderWithDetails`; `TransactionTimeline` is used.
    - **Impact if unanswered:** May add unnecessary API round-trips or miss that data is already available.

12. **For the “Order audit trail” in Ops: should it reuse the dossier-style `getAuditLogsForOrder` API, or should Ops fetch audit logs via a separate endpoint?**
    - **Why this matters:** Dossier API is `GET /api/admin/users/[userId]/dossier` and returns audit logs by `targetUserId`. Orders need logs by `orderId`.
    - **Evidence:** `app/api/admin/users/[userId]/dossier/route.ts` L81–102 — queries `auditLogs` where `targetUserId == uid`. No equivalent for `orderId`.
    - **Impact if unanswered:** Duplicating logic vs. adding `GET /api/admin/orders/[orderId]/audit` that calls `getAuditLogsForOrder`.

---

## 6. Roles & Permissions (Admin vs. Support)

13. **Is a “Support” role planned for near-term rollout, or is it post-MVP?**
    - **Why this matters:** Support role affects whether we add `requireSupport` checks and scope restrictions now.
    - **Evidence:** Audit Section 6.2 — recommends Support role with restricted scope (no refund, no role change, no approve listings).
    - **Impact if unanswered:** Building Support-only restrictions before the role exists vs. keeping current admin-only model.

14. **Which admin endpoints must remain admin-only and must not be accessible to a future Support role?**
    - **Why this matters:** Defines the allowlist/blocklist for Support.
    - **Evidence:** Audit lists: refund, dispute resolve, role change, approve listings as admin-only; send reminder, resend email as Support-ok.
    - **Impact if unanswered:** Wrong permissions if Support is introduced later.

---

## Summary Table

| # | Category                  | Question Focus                                  |
|---|---------------------------|--------------------------------------------------|
| 1–3  | Stripe Webhooks        | Persistence, read path, retry feasibility       |
| 4–6  | Audit Logs             | Indexes, filters, server vs. client access      |
| 7–8  | Cron Run History       | Function scope, opsHealth vs. systemRuns        |
| 9–10 | Delivery Proof/Tokens  | Data location, token revoke feasibility         |
| 11–12| Order Ops              | Existing payload, audit API pattern             |
| 13–14| Roles & Permissions    | Support role timing, endpoint allowlist         |
