# Notification & Email Gap Analysis

**Date:** February 2026  
**Purpose:** Single reference for what is covered vs. missing so we don’t miss notifications or emails.

---

## ✅ Covered (in-app + email where applicable)

| Area | Event | Recipient | In-app | Email | Immediate dispatch |
|------|--------|-----------|--------|--------|--------------------|
| **Payments** | Order.Confirmed | Buyer | ✅ | ✅ | ✅ |
| **Payments** | Order.Received | Seller | ✅ | ✅ | ✅ |
| **Reviews** | Review.Request | Buyer | ✅ | ✅ | Via scheduler / dispatch |
| **Reviews** | Review.Received | Seller | ✅ | ✅ | ✅ |
| **Orders** | Order.Preparing, InTransit, Delivered, DeliveryConfirmed | Buyer | ✅ | ✅ | ✅ |
| **Orders** | Order.ReceiptConfirmed | Seller | ✅ | ✅ | ✅ |
| **Orders** | Order.DeliveryScheduled, DeliveryAgreed, DeliveryAddressSet | Buyer/Seller | ✅ | ✅ | ✅ |
| **Orders** | Order.DeliveryTrackingStarted, Stopped, MarkDelivered | Buyer | ✅ | ✅ | ✅ |
| **Orders** | Order.DeliveryCheckIn | Buyer | ✅ | ✅ | Scheduled |
| **Orders** | Order.TransferComplianceRequired, Compliance* | Buyer/Seller | ✅ | ✅ | ✅ |
| **Offers** | Offer.Submitted | Buyer | ✅ | ✅ | ✅ |
| **Offers** | Offer.Received, Countered, Accepted, Declined | Buyer/Seller | ✅ | ✅ | ✅ |
| **Offers** | Offer.Expired | Buyer/Seller | ✅ | ✅ | Scheduled |
| **Auctions** | Auction.Won, Lost, Outbid, HighBidder, EndingSoon | Buyer | ✅ | ✅ | ✅ or scheduled |
| **Auctions** | Auction.BidReceived | Seller | ✅ (in-app only) | — | — |
| **Messages** | Message.Received | Recipient | ✅ | ✅ | ✅ |
| **Listings** | Listing.Approved, Rejected, ComplianceApproved/Rejected | Seller | ✅ | ✅ | ✅ or scheduled |
| **Admin** | Admin.Listing.Submitted, ComplianceReviewRequired, AdminApprovalRequired | Admins | ✅ | ✅ | Scheduled |
| **Admin** | Admin.Order.DisputeOpened, Admin.BreederPermit.Submitted, Admin.Support.TicketSubmitted | Admins | ✅ | ✅ | Scheduled |
| **Support** | Admin reply to ticket | User | — | ✅ (direct send) | ✅ |

---

## ⚠️ Gaps (missing or optional)

### 1. **Final payment completed (deposit flow)**

- **What:** Buyer pays the remaining balance (final payment) after deposit.
- **Where:** `handleFinalPaymentCompleted` in Stripe webhook (paymentType === 'final').
- **Current:** Order and delivery session are updated; **no notification to buyer or seller**.
- **Recommendation:** Emit e.g. **Order.FinalPaymentReceived** to buyer (and optionally seller) with in-app + email and `tryDispatchEmailJobNow`, so both parties see “Balance paid” / “Buyer paid balance”.

---

### 2. **Async payment failed**

- **What:** Buyer’s payment fails (e.g. bank decline) after checkout started.
- **Where:** `handleCheckoutSessionAsyncPaymentFailed` in Stripe webhook.
- **Current:** Order is cancelled and reservation cleared; **no notification to buyer**.
- **Recommendation:** Emit e.g. **Payment.Failed** to buyer (in-app + email) so they see “Payment didn’t go through – please try again or use another method”.

---

### 3. **Offer withdrawn**

- **What:** Buyer withdraws an offer (open or countered).
- **Where:** `POST /api/offers/[offerId]/withdraw`.
- **Current:** Offer status set to withdrawn; **no notification to seller**.
- **Recommendation:** Emit **Offer.Withdrawn** to seller (in-app + email) so they see “Buyer withdrew their offer”.

---

### 4. **User.Welcome (new user)**

- **What:** New user signs up.
- **Current:** Event type, schema, in-app, and email template (`user_welcome`) exist; **no code path emits User.Welcome** (no signup hook found in app or Netlify).
- **Recommendation:** Emit **User.Welcome** when a new user is created (e.g. Auth trigger, post-signup API, or first-login flow) with in-app + email and immediate dispatch.

---

### 5. **Payout.Released (seller payout)**

- **What:** Seller’s payout is released (e.g. transfer to bank).
- **Current:** Event type, schema, in-app, and email template (`payout_released`) exist; **no emission found**. App uses destination charges (seller paid at payment time); separate “payout released” may apply to a different payout model or manual payouts.
- **Recommendation:** If you have a Stripe Connect payout webhook (e.g. `payout.paid`) or manual payout flow, emit **Payout.Released** to the seller with in-app + email (and immediate dispatch if applicable).

---

### 6. **Optional / nice-to-have (from prior audit)**

- **Bid.Placed** – Confirmation to bidder when they place a bid (eBay often doesn’t; optional).
- **Listing.Published** – Confirmation to seller when listing goes live (“Your listing is live”).
- **Support reply in-app** – Admin reply already sends email; adding **Support.ReplyReceived** would give an in-app notification as well (optional).

---

## Summary table

| Gap | Event (suggested) | Recipient | Priority |
|-----|--------------------|-----------|----------|
| Final payment completed | Order.FinalPaymentReceived | Buyer (+ Seller) | High |
| Async payment failed | Payment.Failed | Buyer | High |
| Offer withdrawn | Offer.Withdrawn | Seller | Medium |
| New user welcome | User.Welcome | New user | Medium (if no other welcome) |
| Payout released | Payout.Released | Seller | Low (only if payout webhook exists) |
| Bid placed | Bid.Placed | Buyer | Optional |
| Listing published | Listing.Published | Seller | Optional |

---

## Implementation checklist (for gaps you choose to fix)

1. **Final payment:** In `handleFinalPaymentCompleted`, after updating order and delivery session, emit event to buyer (and seller), create email job, call `tryDispatchEmailJobNow` with `waitForJob: true`. Add event type + payload schema + processEvent + inApp + rules + email template if new.
2. **Payment failed:** In `handleCheckoutSessionAsyncPaymentFailed`, after cancelling order, emit **Payment.Failed** to buyer (need buyerId from order), add type/schema/template/rules, dispatch email.
3. **Offer withdrawn:** In `POST /api/offers/[offerId]/withdraw`, after transaction success, emit **Offer.Withdrawn** to seller (offer.sellerId), add type/schema/template/rules, dispatch email.
4. **User.Welcome:** Add emission on signup (e.g. Firebase Auth onCreate, or first-time login API) with user id and dashboard URL; template already exists.
5. **Payout.Released:** Emit from Stripe Connect payout webhook or manual payout flow when payout is sent; template and event type already exist.

---

## Files to extend (when adding new events)

- **Event type & payload:** `lib/notifications/types.ts`, `lib/notifications/schemas.ts`
- **Rules (channel, category):** `lib/notifications/rules.ts`
- **In-app:** `lib/notifications/inApp.ts`
- **Email template + processEvent:** `lib/notifications/processEvent.ts`, `lib/email/templates.ts`, `lib/email/index.ts`
- **Emission:** Relevant API route or webhook handler + `tryDispatchEmailJobNow` for immediate email.
