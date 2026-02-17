# Notification setup audit

**Purpose:** Single reference for how each notification event is set up (email template + immediate dispatch).

## Flow

1. **Emit:** API/Netlify calls `emitAndProcessEventForUser` (or `emitEventToUsers` for admin fan-out).
2. **Process:** `processEventDoc` creates in-app notification + writes `emailJobs/{eventId}` when `buildEmailJobPayload` returns a template.
3. **Send:** Either **immediate** via `tryDispatchEmailJobNow` in the same request, or **scheduled** via Netlify `dispatchEmailJobs` (runs every 1 min).

## Events with email + immediate dispatch (tryDispatchEmailJobNow)

| Event | Emitted from | Recipient |
|-------|--------------|-----------|
| **Order.Confirmed** | stripe webhook | Buyer |
| **Order.Received** | stripe webhook | Seller |
| **Order.ReceiptConfirmed** | confirm-receipt | Seller |
| **Order.Preparing** | mark-preparing | Buyer |
| **Order.InTransit** | mark-in-transit | Buyer |
| **Order.Delivered** | mark-delivered, complete-delivery, submit-signature | Buyer |
| **Order.DeliveryConfirmed** | confirm-delivery | Buyer |
| **Order.Accepted** | accept | Seller |
| **Order.DeliveryScheduled** | schedule-delivery | Buyer |
| **Order.DeliveryAgreed** | agree-delivery | Seller |
| **Order.DeliveryAddressSet** | set-delivery-address | Seller |
| **Order.DeliveryTrackingStarted** | start-tracking | Buyer |
| **Order.DeliveryTrackingStopped** | stop-tracking | Buyer |
| **Order.PickupReady** | set-pickup-info | Buyer |
| **Order.PickupWindowSelected** | select-pickup-window | Seller |
| **Order.PickupWindowAgreed** | agree-pickup-window | Seller |
| **Order.PickupConfirmed** | confirm-pickup | Seller |
| **Order.FinalPaymentConfirmed** | stripe webhook (balance paid) | Seller |
| **Listing.Approved** | admin approve, compliance approve (when published), try-ai-auto-approve | Seller |
| **Listing.Rejected** | admin reject | Seller |
| **Listing.ComplianceRejected** | compliance reject | Seller |
| **Review.Request** | confirm-receipt, confirm-pickup, complete-delivery, submit-signature (when created) | Buyer |
| **Review.Received** | reviews/create | Seller |
| **Message.Received** | messages/send | Recipient |
| **Offer.Submitted** | offers/create | Buyer |
| **Offer.Received** | offers/create | Seller |
| **Offer.Accepted** | offers/accept | Buyer + Seller |
| **Offer.Countered** | offers/counter | Buyer |
| **Offer.Declined** | offers/decline | Buyer |
| **Bid.Placed** | bids/place | Buyer |
| **Auction.Outbid** | bids/place, auto-bid set | Previous high bidder |
| **Auction.HighBidder** | auto-bid set | New high bidder |
| **Auction.EndingSoon** | netlify auctionEndingSoon | Watchers |
| **Auction.Won** | emitAuctionOutcomeEvents | Winner |
| **User.EmailVerificationRequested** | send-verification-email API | User |

## Events with email, scheduled only (dispatchEmailJobs)

| Event | Emitted from | Note |
|-------|--------------|------|
| **Order.DeliveryCheckIn** | netlify orderDeliveryCheckIn | N days after delivery |
| **Order.FinalPaymentDue** | reminders | Admin/scheduled |
| **Order.SlaApproaching / SlaOverdue** | checkFulfillmentSla, reminders | Scheduled |
| **Order.TransferComplianceRequired** | compliance gate | API + tryDispatch in compliance-transfer/confirm |
| **Order.ComplianceBuyerConfirmed** etc. | compliance-transfer/confirm | API |
| **Payout.Released** | stripe payouts / webhook | Seller |
| **Auction.Lost** | emitAuctionOutcomeEvents | Bidders who didn’t win |
| **Offer.Expired** | netlify expireOffers | Buyer |
| **Review.Request** | checkFulfillmentReminders | Buyer (scheduled reminder path) |
| **User.Welcome** | bootstrap / post-signup | User |
| **User.ProfileIncompleteReminder** | scheduled | User |
| **Marketing.WeeklyDigest / SavedSearchAlert** | netlify | Opt-in |

## Admin events (fan-out to multiple admins)

Emitted via `emitEventToUsers`; each admin gets an event. Email jobs are processed by **scheduled** `dispatchEmailJobs` (no per-call tryDispatchEmailJobNow, since there are multiple recipients).

- Admin.Listing.Submitted, ComplianceReviewRequired, AdminApprovalRequired, Approved, Rejected  
- Admin.Order.DisputeOpened  
- Admin.BreederPermit.Submitted  
- Admin.Support.TicketSubmitted  

## Email template coverage (processEvent buildEmailJobPayload)

Every event type that should send email has a case in `lib/notifications/processEvent.ts` → `buildEmailJobPayload` returning `{ template, templatePayload }`. Templates live in `lib/email/index.ts` (EMAIL_EVENT_REGISTRY) and `lib/email/templates.ts`.

**Listing.ComplianceRejected** uses the same template as **Listing.Rejected** (`listing_rejected`); payload shape matches.

## Verification

- **SendGrid:** All sends go through `lib/email/sender.ts` → `sendEmailHtml` → provider (SendGrid when `EMAIL_PROVIDER=sendgrid`).
- **Netlify:** Set `SENDGRID_API_KEY`, `EMAIL_PROVIDER=sendgrid`, `EMAIL_FROM`; scheduled functions use the same env.
- **Immediate vs scheduled:** Search codebase for `tryDispatchEmailJobNow` to see which routes dispatch immediately; all others rely on `netlify/functions/dispatchEmailJobs.ts`.
