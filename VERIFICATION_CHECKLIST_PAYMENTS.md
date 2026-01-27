# Payments + Order Integrity — Verification Checklist

Step-by-step manual tests to verify fixes from **PAYMENTS_ORDER_AUDIT.md**. For each test, expected logs, Firestore changes, and Stripe dashboard checks are noted.

---

## 1. Rapid-click checkout (duplicate sessions)

**Goal:** Confirm double-click / rapid refresh does not create duplicate checkout sessions or charges.

**Steps:**

1. Log in as a buyer. Open a **fixed-price** or **auction** listing that allows checkout.
2. Click **Buy Now** (or **Place Bid** → win → checkout) and **immediately** click again 5–10 times within 1–2 seconds.
3. You should be redirected to Stripe Checkout **once**. Complete payment.

**Verify:**

- **Network:** Only one `POST /api/stripe/checkout/create-session` returns `200` with `sessionId`; others may return same `sessionId` (idempotent) or `429` (rate limit).
- **Firestore:** Single doc in `checkoutSessions` for `checkout_session:{listingId}:{buyerId}:{window}` for that 5s window. One `orders` doc for that purchase.
- **Stripe Dashboard:** One Checkout Session, one PaymentIntent, one Charge for that purchase.
- **Logs:** `logInfo('Returning existing checkout session (idempotent)', ...)` if duplicate requests hit within 5s window.

---

## 2. Webhook replay / idempotency

**Goal:** Replaying the same `checkout.session.completed` event does not create duplicate orders or double mark listing sold.

**Steps:**

1. Use Stripe CLI or Dashboard to **re-send** a `checkout.session.completed` event (same `event.id`) that was already processed.
2. Send it **twice** (simulate retries).

**Verify:**

- **Webhook response:** First send (already processed): `200` with `{ "received": true, "idempotent": true }`.
- **Firestore:** No new `orders` doc. `stripeEvents/{event.id}` exists from first processing. Listing `status` remains `sold`; no duplicate sold updates.
- **Logs:** `logInfo('Webhook event already processed (idempotent)', ...)` or `'Webhook event already processed (transaction failed but event exists)'`.
- **Stripe Dashboard:** No duplicate charges; event delivery shows success.

---

## 3. Webhook idempotency transaction failure (P1)

**Goal:** When the idempotency transaction fails and the event was **not** recorded, we return `500` and do **not** process. Stripe retries.

**Steps:**

1. Temporarily force the `stripeEvents` transaction to fail (e.g. disable Firestore write, or use a test that mocks transaction throw) **without** writing the event doc.
2. Send `checkout.session.completed` (new `event.id`).

**Verify:**

- **Webhook response:** `500` with message like `Webhook processing temporarily unavailable; will retry.`
- **Firestore:** No `stripeEvents/{eventId}` doc. No new order created.
- **Logs:** `logError('Webhook idempotency transaction failed; event not recorded', ...)`. Sentry receives `captureException` for the transaction error.
- **Stripe:** Event retried; on successful retry, event is recorded and processed once.

---

## 4. Refund (admin) — single and concurrent

**Goal:** Admin refund runs correctly; concurrent refund attempts are blocked with `409`.

**Steps:**

4a. **Single refund**

1. Create a paid order (card checkout). As admin, call `POST /api/stripe/refunds/process` with `{ "orderId": "...", "reason": "Test refund" }`.
2. Confirm full refund.

**Verify:**

- **Response:** `200` with `refundId`, `amount`, `isFullRefund: true`.
- **Firestore:** `orders/{orderId}` has `status: 'refunded'`, `stripeRefundId`, `refundedAt`, `refundedBy`. No `refundInProgressAt`.
- **Stripe Dashboard:** Refund exists for that PaymentIntent; amount matches.
- **Logs:** `logInfo('Refund processed', { route: '/api/stripe/refunds/process', orderId, refundId, ... })`.

4b. **Concurrent refund (P3 guard)**

1. For a **different** paid order, trigger two refund requests **in parallel** (e.g. two tabs or scripts).
2. One should succeed; the other should fail.

**Verify:**

- **Response:** One `200`, one `409` with `code: 'REFUND_IN_PROGRESS'` or `400` "Order already refunded" (depending on timing).
- **Firestore:** Single refund recorded; `refundInProgressAt` cleared on success.
- **Stripe:** One refund only.

---

## 5. Dispute resolve — partial refund (P2)

**Goal:** `resolution: 'partial_refund'` with `refundAmount` performs a **partial** refund, not a full refund.

**Steps:**

1. Create an order, mark delivered, confirm delivery. Open a dispute as buyer.
2. As admin, resolve with `{ "resolution": "partial_refund", "refundAmount": 50, "refundReason": "Partial", "adminNotes": "Test" }`.

**Verify:**

- **Response:** `200`. Order moves to `completed` (partial), not `refunded`.
- **Firestore:** `orders/{orderId}` has `status: 'completed'`, `refundAmount: 50`, `stripeRefundId`, `protectedDisputeStatus: 'resolved_partial_refund'`.
- **Stripe Dashboard:** Refund of **$50** (not full amount) for that PaymentIntent.
- **Logs:** No duplicate or erroneous full-refund logic.

---

## 6. Dispute vs mark-delivered race (P7 / FIX-003)

**Goal:** Seller cannot mark delivered while a dispute is open; buyer cannot open dispute after delivery is confirmed (existing guards).

**Steps:**

6a. **Mark delivered blocked when dispute open**

1. Create order, confirm delivery. Open dispute as buyer.
2. As seller, call `POST /api/orders/[orderId]/mark-delivered` (e.g. from UI or API).

**Verify:**

- **Response:** `409` with `code: 'CONFLICT_DISPUTE_OPEN'`, `error: 'Cannot mark delivered - dispute is open'`.
- **Firestore:** Order remains `DISPUTE_OPENED`; no `deliveredAt` / `DELIVERED_PENDING_CONFIRMATION`.

6b. **Open dispute blocked when already delivered**

1. Create order. Seller marks delivered; buyer confirms delivery (or use admin to set `deliveryConfirmedAt`).
2. As buyer, try to open dispute via `POST /api/orders/[orderId]/disputes/open`.

**Verify:**

- **Response:** `400` or `409` (e.g. "Delivery not confirmed" or "order already delivered" depending on flow). No duplicate dispute.
- **Firestore:** No second `disputeOpenedAt`; `protectedDisputeStatus` unchanged.

---

## 7. Email / notification (order events)

**Goal:** Order-related notifications (e.g. Order.Confirmed, Order.Delivered) are emitted and email dispatch is attempted; failures are logged and do not break the request.

**Steps:**

1. Complete a **card** checkout so that `checkout.session.completed` is processed (payment confirmed).
2. Check logs for `Order.Confirmed` / `Order.Received` notification and `tryDispatchEmailJobNow` (or email job creation).
3. Trigger **mark-delivered** for an order; check logs for `Order.Delivered` and email dispatch.

**Verify:**

- **Logs:** `logWarn('Email dispatch failed for Order.Confirmed', ...)` or similar if dispatch fails; no unhandled throw. `logWarn('Failed to append mark-delivered timeline event (best-effort)', ...)` if timeline append fails.
- **Firestore:** `notifications` or equivalent event docs created; `emailJobs` (or your implementation) has jobs for order events.
- **Sentry:** Any `captureException` for email-dispatch or notification errors includes `context`, `eventType`, `orderId`, etc.

---

## 8. No debug instrumentation

**Goal:** No `fetch` to `127.0.0.1:7242` or `#region agent log` in payment/checkout paths.

**Steps:**

1. Run `rg "127.0.0.1:7242"` and `rg "agent log"` in `app/api/stripe`, `app/listing`, `lib/stripe`. Open checkout flow and listing page; check network tab.

**Verify:**

- **Grep:** No matches in source (docs may mention it).
- **Network:** No requests to `127.0.0.1:7242` during checkout or listing load.

---

## 9. Structured logging (refunds, webhook, mark-delivered)

**Goal:** Refunds and webhook account updates use structured logs; mark-delivered timeline failure is logged.

**Steps:**

1. Process a refund; trigger `account.updated` webhook (e.g. Stripe Connect onboarding); trigger mark-delivered (optionally force timeline failure).

**Verify:**

- **Logs:** JSON-formatted `logInfo` / `logWarn` / `logError` with `route`, `orderId`, `refundId`, `userId`, `stripeAccountId`, etc. No raw `console.log` / `console.warn` in refund or webhook account handler.

---

## 10. Audit trail

**Goal:** Refunds and dispute resolutions write audit logs.

**Steps:**

1. Process admin refund; resolve dispute (release or refund).

**Verify:**

- **Firestore:** `auditLogs` (or your audit collection) has entries for `refund_full` / `refund_partial` and `dispute_resolved` with `orderId`, `actorUid`, `beforeState`, `afterState`, `metadata`.

---

*Use this checklist after deploying P1–P7 fixes and when adding new payment/order flows.*
