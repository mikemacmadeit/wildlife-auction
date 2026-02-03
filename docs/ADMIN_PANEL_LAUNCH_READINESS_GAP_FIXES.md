# Admin Panel Launch Readiness — Gap Fixes (Reuse Existing Tabs)

**Goal:** Make admin panel launch-ready by extending existing tabs. No new pages unless necessary.

---

## 1. Existing Admin Panel Map

| Route | File | Purpose | Key Data / APIs |
|-------|------|---------|-----------------|
| `/dashboard/admin/health` | `app/dashboard/admin/health/page.tsx` | System health: connectivity, Stripe, Redis, Sentry, opsHealth, checks by category, Quick Links | `GET /api/admin/health`, opsHealth (stripeWebhook, aggregateRevenue, autoReleaseProtected) |
| `/dashboard/admin/ops` | `app/dashboard/admin/ops/OpsClient.tsx` | Order ops: lanes (overdue, needs_action, disputes, completed), order detail dialog | `getAdminOrders` → `GET /api/admin/orders`, TransactionTimeline, FulfillmentStatusBlock |
| `/dashboard/admin/users` | `app/dashboard/admin/users/page.tsx` | User directory: search, role/status/risk actions | `GET /api/admin/users/directory`, `lookup` |
| `/dashboard/admin/users/[uid]` | `app/dashboard/admin/users/[uid]/page.tsx` | User dossier: profile, notes, **audit trail by targetUserId** | `GET /api/admin/users/[userId]/dossier` (returns `audits`) |
| `/dashboard/admin/reconciliation` | `app/dashboard/admin/reconciliation/page.tsx` | Stripe ↔ Firestore reconciliation | `runReconciliation` |
| `/dashboard/admin/listings` | `app/dashboard/admin/listings/page.tsx` | Approve/reject listings | listings |
| `/dashboard/admin/compliance` | `app/dashboard/admin/compliance/ComplianceClient.tsx` | Breeder permits, payout holds | breederPermits, orders |
| `/dashboard/admin/support` | `app/dashboard/admin/support/page.tsx` | Support tickets | supportTickets |
| `/dashboard/admin/notifications` | `app/dashboard/admin/notifications/page.tsx` | Events, jobs, deadletters, emit | `/api/admin/notifications/*` |
| `/dashboard/admin/revenue` | `app/dashboard/admin/revenue/page.tsx` | Revenue, refunds | aggregateRevenue, orders |
| `/dashboard/admin/messages` | `app/dashboard/admin/messages/page.tsx` | Flagged messages | messageThreads |
| `/dashboard/admin/payouts` | `app/dashboard/admin/payouts/page.tsx` | Stripe balance | Stripe API |
| `/dashboard/admin/protected-transactions` | `app/dashboard/admin/protected-transactions/page.tsx` | Protected orders list | orders |
| `/dashboard/admin/compliance-holds` | `app/dashboard/admin/compliance-holds/page.tsx` | Compliance holds | orders |
| `/dashboard/admin/email-templates` | `app/dashboard/admin/email-templates/page.tsx` | Email template preview | — |
| `/dashboard/admin/knowledge-base` | `app/dashboard/admin/knowledge-base/page.tsx` | KB management | knowledgeBase |

**Existing visibility by P0 capability:**

| Capability | Exists? | Where |
|------------|---------|-------|
| Global audit log | **NO** | User dossier shows audit by `targetUserId` only; no global feed |
| Stripe webhook events | **PARTIAL** | Health shows `lastWebhookAt`, `lastEventType`, `lastEventId`; no event list |
| Order full story (timeline + audit + delivery proof) | **PARTIAL** | Ops shows TransactionTimeline, FulfillmentStatusBlock; **missing** audit trail + delivery proof |
| Cron run visibility | **PARTIAL** | Health shows aggregateRevenue, stripeWebhook, autoRelease; most crons (finalizeAuctions, expireListings, etc.) have no visibility |

---

## 2. Launch P0 Gaps (Only These Matter)

| Gap | Risk at Launch | Fix Location |
|-----|----------------|--------------|
| **A) Global Audit Log** | Cannot see who did what across orders/users; compliance blind | Health tab |
| **B) Stripe Webhook Event Log** | Cannot debug payment failures; no idempotency visibility | Health tab |
| **C) Order Detail = Full Story** | Missing admin audit trail + delivery proof in Ops order detail | Ops tab |
| **D) Cron Run Visibility** | Cannot verify critical jobs ran; no failure visibility | Health tab |

---

## 3. Placement Decisions

| P0 Capability | Placement | Rationale |
|---------------|-----------|-----------|
| **A) Global Audit Log** | **Health tab** | Health is the "system ops" page. Audit log is system-level accountability. Add collapsible "Audit Log" section. |
| **B) Stripe Webhook Event Log** | **Health tab** | Health already has "Stripe webhook activity" check. Extend with "View recent events" table. |
| **C) Order Detail Full Story** | **Ops tab** | Ops order detail dialog already exists. Add "Audit trail" + "Delivery proof" sections. |
| **D) Cron Run Visibility** | **Health tab** | Health already shows opsHealth for aggregateRevenue, stripeWebhook. Extend to more cron jobs. |

**No new pages required.** All P0 capabilities fit into Health and Ops.

---

## 4. Minimal Implementation Plan

### 4A. Global Audit Log (Health tab)

| Item | Details |
|------|---------|
| **Where** | `app/dashboard/admin/health/page.tsx` |
| **UI** | Add collapsible Card "Audit Log" below Quick Links. Table: actor, actionType, target (orderId/listingId/targetUserId), createdAt. Filters: actionType (optional), date range (last 7d default). Pagination (20 per page). Links to order, user dossier. |
| **API** | New `GET /api/admin/audit-logs` — query `auditLogs` by `orderBy('createdAt','desc')`, optional `where('actionType','==',x)`, limit, cursor. Admin SDK only. |
| **Schema** | None. Use existing `auditLogs`. |
| **Index** | If global query `orderBy('createdAt','desc')` fails: add single-field index. Firestore auto-creates for single-field; if composite filter added later, add index. |
| **Permissions** | `requireAdmin` |

**Acceptance:**
- [ ] Health page shows "Audit Log" section
- [ ] Table displays actor, actionType, target, createdAt
- [ ] Can filter by date (last 7d default)
- [ ] Links to order/listing/user work

---

### 4B. Stripe Webhook Event Log (Health tab)

| Item | Details |
|------|---------|
| **Where** | `app/dashboard/admin/health/page.tsx` |
| **UI** | Add collapsible Card "Stripe Webhook Events" (or expand existing "Stripe webhook activity" check into a section). Table: eventId, type, checkoutSessionId/paymentIntentId, createdAt. Pagination. Optionally: "View in Stripe" link. |
| **API** | New `GET /api/admin/stripe-events` — query `stripeEvents` collection `orderBy('createdAt','desc')` limit 100. Admin SDK only. `stripeEvents` has `allow read: if false` (server-only); API reads via Admin SDK. |
| **Schema** | **Extend** `stripeEvents` in webhook route: add `orderId` (if derivable from handler), `processedAt` (when handler completed), `status: 'processed'` (or `failed` if handler throws after transaction). Optional: `errorMessage` on failure. Minimal: just expose existing fields (eventId, type, checkoutSessionId, paymentIntentId, createdAt). |
| **Index** | Single-field `createdAt` desc — Firestore supports. |
| **Permissions** | `requireAdmin` |

**Existing stripeEvents schema** (`app/api/stripe/webhook/route.ts` L179–201): `type`, `createdAt`, `checkoutSessionId`, `paymentIntentId`, `disputeId`, `chargeId` (by event type). No orderId, no status. **Minimal change:** Add `processedAt: Timestamp.now()` after handler success; add `status: 'processed'` and optionally `orderId` when handler creates/updates order. On handler throw (after transaction), could write `status: 'failed'` to a separate doc or skip (retry will reprocess). For launch: **viewer only** — show existing stripeEvents. No retry. Extend schema only if needed for status/orderId.

**Acceptance:**
- [ ] Health page shows "Stripe Webhook Events" section
- [ ] Table displays eventId, type, createdAt, relevant IDs
- [ ] Pagination works

---

### 4C. Order Detail Full Story (Ops tab)

| Item | Details |
|------|---------|
| **Where** | `app/dashboard/admin/ops/OpsClient.tsx` |
| **UI** | In order detail dialog (`detailDialogOpen`): 1) Add **"Audit trail"** section — fetch auditLogs by orderId when dialog opens; list actor, actionType, before/after, createdAt. 2) Add **"Delivery proof"** section — render `DeliveryProofTimelineBlock` (or equivalent) when `order.delivery?.signatureUrl` or `order.deliveryProofUrls` exist. Order payload from `getAdminOrders` already includes full doc (`delivery`, `deliveryProofUrls`). |
| **API** | New `GET /api/admin/orders/[orderId]/audit` — call `getAuditLogsForOrder(db, orderId, 50)` from `lib/audit/logger.ts`. Return JSON. Or: add `auditLogs` to a batch detail fetch. Simplest: dedicated endpoint. |
| **Schema** | None. |
| **Index** | Existing `auditLogs` index `orderId`+`createdAt`. |
| **Permissions** | `requireAdmin` |

**Delivery proof:** `order.delivery.signatureUrl`, `order.delivery.deliveryPhotoUrl`, `order.deliveryProofUrls` — already in order doc. `DeliveryProofTimelineBlock` in `components/delivery/DeliveryProofTimelineBlock.tsx` accepts `signatureUrl`, `deliveryPhotoUrl`. Reuse it in Ops.

**Acceptance:**
- [ ] Ops order detail shows "Audit trail" section with admin/system actions
- [ ] Ops order detail shows "Delivery proof" (signature, photo) when present
- [ ] No extra list payload — fetch audit on dialog open

---

### 4D. Cron Run Visibility (Health tab)

| Item | Details |
|------|---------|
| **Where** | `app/dashboard/admin/health/page.tsx`, `app/api/admin/health/route.ts` |
| **UI** | Extend "Scheduled jobs" (jobs category) section. Currently: autoReleaseProtected (retired), aggregateRevenue, stripeWebhook. Add checks for: finalizeAuctions, expireListings, expireOffers, checkFulfillmentReminders, clearExpiredPurchaseReservations (critical for orders). Each shows lastRunAt, status. |
| **Backend** | **Reuse opsHealth.** Add new opsHealth docs: `opsHealth/finalizeAuctions`, `opsHealth/expireListings`, etc. Each Netlify function writes to its doc on start (or end). Schema: `lastRunAt`, `scannedCount`, `processedCount`, `errorsCount`, `lastError`, `updatedAt`. |
| **Schema** | Extend opsHealth: one doc per job. No new collection. |
| **Index** | None. |
| **Permissions** | `requireAdmin` (Health API already requires admin) |

**Critical crons to track:**
- `finalizeAuctions` — `netlify/functions/finalizeAuctions.ts`
- `expireListings` — `netlify/functions/expireListings.ts`
- `expireOffers` — `netlify/functions/expireOffers.ts`
- `checkFulfillmentReminders` — `netlify/functions/checkFulfillmentReminders.ts`
- `clearExpiredPurchaseReservations` — `netlify/functions/clearExpiredPurchaseReservations.ts`
- `aggregateRevenue` — already tracked
- `stripeWebhook` — already tracked (different: it's API, not cron)

**Implementation:** Add to each function a try/finally that writes to `opsHealth/{functionName}` with `lastRunAt`, `scannedCount`, `processedCount`, `errorsCount`, `lastError`. Health API already reads opsHealth docs; add reads for new doc IDs and add corresponding checks.

**Acceptance:**
- [ ] Health shows last run for finalizeAuctions, expireListings, expireOffers, checkFulfillmentReminders, clearExpiredPurchaseReservations
- [ ] Each shows status (OK/WARN/FAIL based on staleness)
- [ ] aggregateRevenue, stripeWebhook unchanged

---

## 5. Schema / Index Diff (Minimal)

### Firestore schema changes

| Collection | Change |
|------------|--------|
| `stripeEvents` | Optional: add `processedAt`, `status`, `orderId` when webhook handler completes. For launch: **no change** if viewer-only uses existing fields. |
| `opsHealth` | Add docs: `finalizeAuctions`, `expireListings`, `expireOffers`, `checkFulfillmentReminders`, `clearExpiredPurchaseReservations` (same shape as existing: lastRunAt, scannedCount, etc.) |

### Firestore index changes

| Index | Needed? |
|-------|---------|
| `auditLogs` by `createdAt` desc only | Firestore auto-creates single-field indexes. If query fails, add explicitly. |
| `auditLogs` by `orderId` + `createdAt` | **Already exists** (firestore.indexes.json L628–639). |
| `stripeEvents` by `createdAt` desc | Single-field; typically auto-created. |

---

## 6. Launch Verification Checklist

### Pre-launch
- [ ] Health: "Audit Log" section loads and shows recent events
- [ ] Health: "Stripe Webhook Events" section loads and shows recent stripeEvents
- [ ] Health: "Scheduled jobs" shows last run for all critical crons
- [ ] Ops: Order detail shows "Audit trail" when opened
- [ ] Ops: Order detail shows "Delivery proof" when order has signature/photo
- [ ] All new API routes require admin
- [ ] No Firestore rule changes for client reads (all via Admin API)

### Post-launch smoke test
- [ ] Trigger a Stripe webhook (test mode) → event appears in Health
- [ ] Perform an admin action (e.g. hold order) → appears in Health Audit Log and Ops order Audit trail
- [ ] Wait for cron run (or trigger manually) → Health shows updated lastRunAt
- [ ] Complete a delivery with signature → Ops order detail shows delivery proof

---

## 7. Already Exists (No Change Required)

| Capability | Location |
|------------|----------|
| User dossier audit trail (by targetUserId) | `app/dashboard/admin/users/[uid]/page.tsx` + `GET /api/admin/users/[userId]/dossier` |
| Order customer timeline | Ops detail: `TransactionTimeline` component |
| Stripe webhook "last event" summary | Health: opsHealth.stripeWebhook check |
| aggregateRevenue last run | Health: ops_aggregateRevenue check |
| Reconciliation tool | `app/dashboard/admin/reconciliation/page.tsx` |
| Order refund, hold, dispute resolve | Ops detail: existing actions |

---

## 8. File-Level Summary

| File | Change |
|------|--------|
| `app/dashboard/admin/health/page.tsx` | Add Audit Log section, Stripe Webhook Events section, extend Scheduled jobs for new cron docs |
| `app/api/admin/health/route.ts` | Read new opsHealth docs (finalizeAuctions, etc.); return for UI |
| `app/api/admin/audit-logs/route.ts` | **NEW** — GET auditLogs, orderBy createdAt desc, filters, pagination |
| `app/api/admin/stripe-events/route.ts` | **NEW** — GET stripeEvents, orderBy createdAt desc, limit 100 |
| `app/api/admin/orders/[orderId]/audit/route.ts` | **NEW** — GET auditLogs for orderId via getAuditLogsForOrder |
| `app/dashboard/admin/ops/OpsClient.tsx` | Add Audit trail section, Delivery proof section in order detail dialog |
| `netlify/functions/finalizeAuctions.ts` | Write opsHealth/finalizeAuctions on run |
| `netlify/functions/expireListings.ts` | Write opsHealth/expireListings on run |
| `netlify/functions/expireOffers.ts` | Write opsHealth/expireOffers on run |
| `netlify/functions/checkFulfillmentReminders.ts` | Write opsHealth/checkFulfillmentReminders on run |
| `netlify/functions/clearExpiredPurchaseReservations.ts` | Write opsHealth/clearExpiredPurchaseReservations on run |
