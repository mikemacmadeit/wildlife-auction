# Notification System Review & Fixes

**Date:** January 24, 2026  
**Status:** ✅ Fixed Missing Offer.Submitted Notification

## Issue Found: Missing Buyer Confirmation Email

### Problem
When a buyer submits an offer, **only the seller** receives a notification (`Offer.Received`). The **buyer receives NO confirmation email**, leaving them uncertain if their offer was successfully submitted.

### Fix Applied
✅ Added `Offer.Submitted` notification event type that sends a confirmation email to the buyer when they submit an offer.

**Files Changed:**
- `lib/notifications/types.ts` - Added `Offer.Submitted` to event types and payload
- `lib/notifications/schemas.ts` - Added schema validation
- `lib/notifications/rules.ts` - Added notification rules (email + in-app)
- `lib/notifications/inApp.ts` - Added in-app notification builder
- `lib/notifications/processEvent.ts` - Added email template mapping
- `lib/email/templates.ts` - Created `getOfferSubmittedEmail()` template function
- `lib/email/index.ts` - Added to email registry with schema
- `app/api/offers/create/route.ts` - Now sends `Offer.Submitted` to buyer + `Offer.Received` to seller

## Complete Notification Coverage Review

### ✅ Offer Workflow
- **Offer.Submitted** - ✅ NEW: Buyer confirmation when offer is created
- **Offer.Received** - ✅ Seller notification when offer is received
- **Offer.Countered** - ✅ Buyer/Seller notification when counter offer is made
- **Offer.Accepted** - ✅ Buyer/Seller notification when offer is accepted
- **Offer.Declined** - ✅ Buyer notification when offer is declined
- **Offer.Expired** - ✅ Buyer/Seller notification when offer expires

### ✅ Auction Workflow
- **Auction.WatchStarted** - ✅ User notification when they start watching
- **Auction.HighBidder** - ✅ Bidder notification when they're winning
- **Auction.Outbid** - ✅ Bidder notification when they're outbid
- **Auction.EndingSoon** - ✅ Bidder notification at thresholds (24h/1h/10m/2m)
- **Auction.Won** - ✅ Winner notification when auction ends
- **Auction.Lost** - ✅ Loser notification when auction ends
- **Auction.BidReceived** - ✅ Seller notification when bid is placed (in-app only)

**Note:** Bid placement does NOT send a confirmation email to the bidder. This is intentional (eBay-style) - bidders see immediate UI feedback. However, if you want bid confirmation emails, we can add `Bid.Placed` event.

### ✅ Order Workflow
- **Order.Confirmed** - ✅ Buyer email when transaction/payment completes (Stripe webhook; immediate dispatch)
- **Order.Received** - ✅ Seller notification when order is received
- **Order.Preparing** - ✅ Buyer notification when seller marks as preparing
- **Order.InTransit** - ✅ Buyer notification when seller marks in transit
- **Order.DeliveryConfirmed** - ✅ Buyer notification when seller confirms delivery
- **Order.DeliveryCheckIn** - ✅ Buyer follow-up N days after delivery
- **Payout.Released** - ✅ Seller notification when payout is released

### ✅ Review Workflow
- **Review.Request** - ✅ Buyer notification to leave a review (after order completes; from confirm-receipt / checkFulfillmentReminders)
- **Review.Received** - ✅ Seller email + in-app when a buyer leaves a review (`POST /api/reviews/create`; immediate dispatch)

### ✅ Listing Workflow
- **Listing.Approved** - ✅ Seller notification when listing is approved
- **Listing.Rejected** - ✅ Seller notification when listing is rejected
- **Listing.ComplianceApproved** - ✅ Seller notification when compliance approved
- **Listing.ComplianceRejected** - ✅ Seller notification when compliance rejected

**Note:** Listing creation/publish does NOT send a confirmation email to the seller. This might be useful to add (`Listing.Published` or `Listing.Submitted`).

### ✅ Message Workflow
- **Message.Received** - ✅ Recipient notification when message is received

### ✅ User Onboarding
- **User.Welcome** - ✅ New user welcome email
- **User.ProfileIncompleteReminder** - ✅ Reminder to complete profile

### ✅ Admin Notifications
- **Admin.Listing.Submitted** - ✅ Admin notification when listing needs review
- **Admin.Listing.ComplianceReviewRequired** - ✅ Admin notification for compliance review
- **Admin.Listing.AdminApprovalRequired** - ✅ Admin notification for admin approval
- **Admin.Order.DisputeOpened** - ✅ Admin notification when dispute is opened
- **Admin.BreederPermit.Submitted** - ✅ Admin notification when permit is submitted
- **Admin.Support.TicketSubmitted** - ✅ Admin notification when support ticket is created

## Potential Missing Notifications (Recommendations)

### 1. Bid Placement Confirmation
**Current:** No email confirmation when buyer places a bid  
**Recommendation:** Add `Bid.Placed` event (optional - eBay doesn't do this, but some users might want it)

### 2. Listing Published Confirmation
**Current:** No email confirmation when seller publishes a listing  
**Recommendation:** Add `Listing.Published` event to confirm listing is live

### 3. Order Created (Seller Side)
**Current:** Seller gets `Order.Received` but only after buyer completes checkout  
**Recommendation:** Consider if seller needs immediate notification when order is created (currently handled by `Order.Received`)

### 4. Payment Failed
**Current:** No notification if payment fails during checkout  
**Recommendation:** Add `Payment.Failed` event for buyer notification

### 5. Offer Withdrawn
**Current:** No notification when buyer withdraws an offer  
**Recommendation:** Add `Offer.Withdrawn` event to notify seller

## Testing Checklist

- [x] Offer.Submitted email sends to buyer when offer is created
- [x] Offer.Received email sends to seller when offer is created
- [ ] Test on production to verify emails are received
- [ ] Verify email template renders correctly
- [ ] Verify in-app notification appears
- [ ] Verify push notification (if enabled)

## Next Steps

1. **Deploy and test** the `Offer.Submitted` notification
2. **Consider adding** the recommended missing notifications based on user feedback
3. **Monitor** email delivery rates and user engagement
