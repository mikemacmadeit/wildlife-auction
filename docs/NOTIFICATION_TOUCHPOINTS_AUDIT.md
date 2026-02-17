# Platform Notification Touchpoints Audit

**Date:** February 2026  
**Purpose:** Single reference for all user-facing events and where notifications are emitted.

## Buyer / Transaction

| Event | Trigger | Recipient | Channels | Immediate email? |
|-------|---------|-----------|----------|------------------|
| **Order.Confirmed** | Stripe `checkout.session.completed` (payment success) | Buyer | in-app, email | ✅ `tryDispatchEmailJobNow` |
| **Review.Request** | Confirm receipt, confirm-pickup, complete-delivery, submit-signature, reminders | Buyer | in-app, email | ✅ `tryDispatchEmailJobNow` (confirm-receipt, confirm-pickup, complete-delivery, submit-signature when created); scheduler for reminders |
| **Order.Preparing** | Seller marks preparing | Buyer | in-app, email | ✅ |
| **Order.InTransit** | Seller marks in transit | Buyer | in-app, email | ✅ |
| **Order.Delivered** | Seller/driver marks delivered | Buyer | in-app, email | ✅ |
| **Order.DeliveryConfirmed** | Seller confirms delivery | Buyer | in-app, email | ✅ |
| **Order.DeliveryCheckIn** | Scheduled N days after delivery | Buyer | in-app, email | Scheduled |
| **Offer.Submitted** | Buyer creates offer | Buyer | in-app, email | ✅ |
| **Offer.Accepted** | Seller accepts offer | Buyer | in-app, email | ✅ |
| **Offer.Countered** | Seller counters | Buyer | in-app, email | ✅ |
| **Offer.Declined** | Seller declines | Buyer | in-app, email | ✅ |
| **Offer.Expired** | Offer expires | Buyer | in-app, email | Scheduled |
| **Auction.Won** | Auction ends, buyer wins | Buyer | in-app, email | ✅ |
| **Auction.Lost** | Auction ends, buyer did not win | Buyer | in-app, email | Scheduled |
| **Auction.Outbid** | Buyer is outbid | Buyer | in-app, email, push | ✅ |
| **Auction.HighBidder** | Buyer becomes high bidder | Buyer | in-app, email, push | ✅ |
| **Auction.EndingSoon** | Thresholds (24h/1h/10m/2m) | Buyer | in-app, email | ✅ (auctionEndingSoon) |
| **Message.Received** | Someone sends message | Recipient | in-app, email | ✅ |

## Seller

| Event | Trigger | Recipient | Channels | Immediate email? |
|-------|---------|-----------|----------|------------------|
| **Order.Received** | Stripe `checkout.session.completed` | Seller | in-app, email | ✅ |
| **Order.ReceiptConfirmed** | Buyer confirms receipt | Seller | in-app, email | ✅ |
| **Review.Received** | Buyer submits review (`POST /api/reviews/create`) | Seller | in-app, email | ✅ |
| **Payout.Released** | Payout processed | Seller | in-app, email | Scheduled |
| **Offer.Received** | Buyer creates offer | Seller | in-app, email | ✅ |
| **Offer.Expired** | Offer expires | Seller | in-app, email | Scheduled |
| **Auction.BidReceived** | Bid placed on listing | Seller | in-app only | — |
| **Order.DeliveryScheduled** | Seller proposes delivery | Buyer | in-app, email | ✅ |
| **Order.DeliveryAgreed** | Buyer agrees delivery | Seller | in-app, email | ✅ |
| **Order.DeliveryAddressSet** | Buyer sets address | Seller | in-app, email | ✅ |
| **Order.DeliveryTrackingStarted** | Seller starts tracking | Buyer | in-app, email | ✅ |
| **Order.Delivered** | Seller/driver marks delivered | Buyer | in-app, email | ✅ |
| **Listing.Approved** | Admin/moderation approves | Seller | in-app, email | ✅ `tryDispatchEmailJobNow` (approve, compliance approve when published, try-ai-auto-approve) |
| **Listing.Rejected** | Admin/moderation rejects | Seller | in-app, email | ✅ `tryDispatchEmailJobNow` (admin reject) |
| **Listing.ComplianceApproved** | Compliance approved (in-app); when published, also **Listing.Approved** email | Seller | in-app, email | ✅ |
| **Listing.ComplianceRejected** | Compliance rejected | Seller | in-app, email | ✅ `tryDispatchEmailJobNow` + email template (listing_rejected) |

## Admin

| Event | Trigger | Recipient | Channels |
|-------|---------|-----------|----------|
| **Admin.Listing.Submitted** | Listing published | Admins | in-app, email |
| **Admin.Listing.ComplianceReviewRequired** | Listing needs compliance | Admins | in-app, email |
| **Admin.Listing.AdminApprovalRequired** | Listing needs admin approval | Admins | in-app, email |
| **Admin.Order.DisputeOpened** | Dispute opened | Admins | in-app, email |
| **Admin.BreederPermit.Submitted** | Breeder permit uploaded | Admins | in-app, email |
| **Admin.Support.TicketSubmitted** | Support ticket created | Admins | in-app, email |

## Key flows verified

1. **Transaction complete (buyer)**  
   - **Order.Confirmed** is emitted in `app/api/stripe/webhook/handlers.ts` to the buyer when checkout completes, with `tryDispatchEmailJobNow(..., waitForJob: true)`.  
   - Template: `order_confirmation` (subject/body from `getOrderConfirmationEmail`).

2. **New review (seller)**  
   - **Review.Received** is emitted in `app/api/reviews/create/route.ts` to the seller after a review is created, with `tryDispatchEmailJobNow(..., waitForJob: true)`.  
   - Template: `review_received` (subject/body from `getReviewReceivedEmail`).

3. **Review request (buyer)**  
   - **Review.Request** is emitted from `lib/reviews/reviewRequest.ts` (used by confirm-receipt and checkFulfillmentReminders).  
   - Template: `review_request`.

## Files that emit notifications (by area)

- **Payments / orders:** `app/api/stripe/webhook/handlers.ts` (Order.Confirmed, Order.Received)
- **Reviews:** `app/api/reviews/create/route.ts` (Review.Received)
- **Review request:** `lib/reviews/reviewRequest.ts` (Review.Request)
- **Orders (fulfillment):** confirm-receipt, mark-preparing, mark-in-transit, mark-delivered, confirm-delivery, set-delivery-address, schedule-delivery, agree-delivery, start/stop-tracking, complete-delivery, submit-signature, confirm-pickup, etc.
- **Offers:** create, accept, counter, decline; `netlify/functions/expireOffers.ts`
- **Bids / auctions:** place bid, auto-bid set; `netlify/functions/auctionEndingSoon.ts`, `netlify/functions/emitAuctionOutcomeEvents.ts`
- **Messages:** `app/api/messages/send/route.ts` (Message.Received)
- **Listings:** publish, admin approve/reject, compliance approve/reject
- **Disputes:** disputes/open, dispute (Admin.Order.DisputeOpened)
- **Support:** support/tickets (Admin.Support.TicketSubmitted)
- **Reminders / check-ins:** checkFulfillmentReminders, orderDeliveryCheckIn, admin reminders/run, compliance-transfer remind/confirm
