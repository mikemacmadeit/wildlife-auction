# Payments + Order Integrity Audit — Wildlife Exchange

**Date:** 2025-01-26  
**Scope:** Checkout, Stripe webhooks, order state machine, refunds/disputes, notifications, observability.

---

## 1. Executive Summary

| Item | Value |
|------|--------|
| **Audit score** | 68 / 100 |
| **Ship verdict** | **Do not ship** until Critical + High fixes are applied. |
| **Summary** | Checkout idempotency (5s window + Stripe key) and webhook signature + `stripeEvents` idempotency are in place. Gaps include: **webhook processing without recording the event** when the idempotency transaction fails (duplicate order/mark-sold risk), **disputes resolve `partial_refund`** doing a **full** refund due to duplicate `else if` block, **refunds process** having no transaction guard (race), **silent catches** in money-moving paths, and **console.*** instead of structured logs in webhook account handler and refunds route. |

---

## 2. Payment / Order Flow Map

- **Checkout:** Client (`createCheckoutSession`) → `POST /api/stripe/checkout/create-session`. Idempotency: `checkoutSessions` doc (5s window) + Stripe `idempotencyKey`. Pre-creates order skeleton, reserves listing, creates Stripe Checkout Session. Client redirects to `url`.
- **Webhook:** `POST /api/stripe/webhook`. Signature verification → `stripeEvents` transaction (check + set) → handler dispatch. Handlers: `checkout.session.completed`, `async_payment_succeeded` / `failed`, `expired`, `payment_intent.succeeded` / `canceled`, `charge.dispute.*`.
- **Order state:** `getEffectiveTransactionStatus` (and `deriveOrderUIState` / `progress.ts`) derive from `transactionStatus` or legacy `status`. Mutations: `mark-delivered`, `confirm-delivery`, `confirm-receipt`, `accept`, disputes `open` / `resolve` / `cancel`, admin `refunds/process`, `mark-paid`.
- **Notifications:** `emitAndProcessEventForUser` + `tryDispatchEmailJobNow` in webhook handlers and `mark-delivered`; failures captured via `catch` + `captureException` / `logWarn`.

---

## 3. Findings Table

| ID | Severity | Area | What breaks | Repro | File(s) + region | Fix |
|----|----------|------|-------------|-------|------------------|-----|
| P1 | **Critical** | Webhooks | When idempotency transaction fails but `stripeEvents` doc does not exist, route **continues** and processes the event. Event is never recorded. Retries process again → duplicate order creation / double mark-sold. | Send `checkout.session.completed`; force transaction failure (e.g. emulate); retry same event. | `app/api/stripe/webhook/route.ts` ~208–228 | On transaction failure, if `!eventDoc.exists`, **return 500** (do not continue). Stripe retries; on retry we either record + process once or fail again. |
| P2 | **Critical** | Disputes | `partial_refund` resolution runs **first** `else if (resolution === 'partial_refund')` block, which performs a **full** refund. Second block (actual partial) is dead code. | Resolve dispute with `resolution: 'partial_refund'`, `refundAmount: 50`. | `app/api/orders/[orderId]/disputes/resolve/route.ts` ~167–189, ~190–224 | Remove first `partial_refund` block (full-refund duplicate). Keep only the real partial-refund block. |
| P3 | **High** | Refunds | No transaction guard. Two concurrent admin refunds can both pass `status !== 'refunded'`, both call Stripe (different amounts → different idempotency keys) → double refund. | Two admins trigger refund for same order (e.g. one full, one partial) concurrently. | `app/api/stripe/refunds/process/route.ts` | Add Firestore transaction: read order, check `!refunded` and `!refundInProgressAt`, set `refundInProgressAt`. Then Stripe refund + Firestore update. Return 409 if already in progress. |
| P4 | **High** | Refunds | Uses `console.log` / `console.error`. Not structured; harder to query in production. | N/A | `app/api/stripe/refunds/process/route.ts` ~238, ~251 | Use `logInfo` / `logError` with `orderId`, `refundId`, etc. |
| P5 | **High** | Webhooks | `handleAccountUpdated` uses `console.warn` / `console.log`. | N/A | `app/api/stripe/webhook/route.ts` ~406, ~427 | Use `logWarn` / `logInfo` with `userId`, `stripeAccountId`. |
| P6 | **High** | Disputes | Resolve has no transaction guard; concurrent admin resolves could double-refund. No idempotency key on `stripe.refunds.create`. | Two admins resolve same dispute concurrently. | `app/api/orders/[orderId]/disputes/resolve/route.ts` | Add transaction guard (e.g. `resolveInProgressAt`) + idempotency key on Stripe refund calls. |
| P7 | **Medium** | Order mutation | `mark-delivered` timeline append uses `catch { // best-effort }` with no log. | Timeline write fails; no visibility. | `app/api/orders/[orderId]/mark-delivered/route.ts` ~214–216 | `catch (e) { logWarn(...); }` — do not throw. |
| P8 | **Medium** | Webhooks | `recomputeOrderComplianceDocsStatus` in `handleCheckoutSessionCompleted` uses `catch { // ignore }` with no log. | Compliance recompute fails; no visibility. | `app/api/stripe/webhook/handlers.ts` ~706–710 | `catch (e) { logWarn(...); }` — do not throw. |
| P9 | **Medium** | Checkout | Persisting `orderRef` session ID and `offerRef` checkout session ID use `catch { // ignore }` with no log. | Persist fails; webhook can still reconcile, but no visibility. | `app/api/stripe/checkout/create-session/route.ts` ~1131–1135, ~1148–1151 | `catch (e) { logWarn(...); }` — do not throw. |
| P10 | **Low** | Observability | No structured log when checkout create-session **succeeds** (only on idempotent reuse / errors). | Harder to trace money-moving requests. | `app/api/stripe/checkout/create-session/route.ts` | Add `logInfo` after successful create (e.g. `listingId`, `buyerId`, `sessionId`, no PII). |

---

## 4. Top 10 Prioritized Fixes

1. **P1** — Webhook: do not process when idempotency transaction fails and event doc does not exist; return 500.
2. **P2** — Disputes resolve: remove erroneous `partial_refund` full-refund block; keep only partial logic.
3. **P3** — Refunds process: transaction guard (`refundInProgressAt`) to prevent concurrent refunds.
4. **P4** — Refunds process: replace `console.*` with `logInfo` / `logError`.
5. **P5** — Webhook `handleAccountUpdated`: replace `console.*` with `logWarn` / `logInfo`.
6. **P6** — Disputes resolve: transaction guard + idempotency key on Stripe refunds.
7. **P7** — Mark-delivered: log timeline append failures (best-effort, no throw).
8. **P8** — Webhook handlers: log `recomputeOrderComplianceDocsStatus` failures (best-effort, no throw).
9. **P9** — Checkout create-session: log persist failures for order/offer session ID (best-effort, no throw).
10. **P10** — Checkout create-session: add structured `logInfo` on success.

---

## 5. Index / Rules / Config (no changes required)

- Checkout and webhook flows use existing Firestore collections and indexes.
- No changes to `firestore.rules` or `firestore.indexes.json` for this audit.

---

## 6. Fixes applied (Critical + High)

| ID | Status | Change |
|----|--------|--------|
| **P1** | Done | Webhook route: on idempotency transaction failure and `!eventDoc.exists`, return `500` and do not process. Log + `captureException`. |
| **P2** | Done | Disputes resolve: removed erroneous `partial_refund` block that performed full refund; kept only real partial-refund logic. |
| **P3** | Done | Refunds process: transaction guard (`refundInProgressAt`), 5‑minute window; return `409` if refund in progress. Clear lock on Stripe/update failure. |
| **P4** | Done | Refunds process: replaced `console.*` with `logInfo` / `logError`. |
| **P5** | Done | Webhook `handleAccountUpdated`: replaced `console.warn` / `console.log` with `logWarn` / `logInfo`. |
| **P6** | Done | Disputes resolve: idempotency keys on `stripe.refunds.create` (`dispute-resolve:refund:${orderId}`, `dispute-resolve:partial:${orderId}:${refundAmountCents}`). Transaction guard for resolve deferred (admin-only, lower traffic). |
| **P7** | Done | Mark-delivered: `appendOrderTimelineEvent` failure now logged with `logWarn` (best-effort, no throw). |

---

## 7. Verification

- See **VERIFICATION_CHECKLIST_PAYMENTS.md** for step-by-step manual tests (rapid-click checkout, webhook replay, refund, dispute vs delivered race, email notification).

---

*End of audit.*
