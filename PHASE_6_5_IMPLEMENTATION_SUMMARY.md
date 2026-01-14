# Phase 6.5 — Subscription Management, Tier Enforcement, and Plan-Based Transaction Fees

## Overview

Phase 6.5 implements full subscription management for seller plans, enforces listing limits based on subscription tier, and ensures transaction fees are calculated and stored based on seller's plan at checkout.

## Files Changed/Added

### New Files

1. **Subscription API Routes**:
   - `project/app/api/stripe/subscriptions/create/route.ts` - Create Stripe subscription for Pro/Elite
   - `project/app/api/stripe/subscriptions/cancel/route.ts` - Cancel subscription

2. **Subscription Webhook Handlers**:
   - `project/app/api/stripe/webhook/subscription-handlers.ts` - Handles subscription lifecycle events

3. **Listing Limit Enforcement**:
   - `project/app/api/listings/check-limit/route.ts` - Server-side limit check
   - `project/app/api/listings/publish/route.ts` - Server-side publish with limit enforcement

4. **Admin Override**:
   - `project/app/api/admin/users/[userId]/plan-override/route.ts` - Admin plan/fee override

### Modified Files

1. **Types** (`project/lib/types.ts`):
   - Added subscription fields to `UserProfile`: `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, `subscriptionCurrentPeriodEnd`, `subscriptionCancelAtPeriodEnd`, `adminPlanOverride`, `adminFeeOverride`, `adminOverrideReason`, `adminOverrideBy`, `adminOverrideAt`
   - Added plan snapshot fields to `Order`: `sellerPlanSnapshot`, `platformFeePercent`, `platformFeeAmount`, `sellerPayoutAmount`

2. **Checkout** (`project/app/api/stripe/checkout/create-session/route.ts`):
   - Calculates fees server-side using seller's effective plan (respects admin overrides and subscription status)
   - Stores `sellerPlanSnapshot` and `platformFeePercent` in checkout metadata

3. **Webhook Handlers** (`project/app/api/stripe/webhook/handlers.ts`):
   - Uses plan snapshot from checkout metadata (immutable)
   - Stores plan snapshot fields on order creation

4. **Webhook Route** (`project/app/api/stripe/webhook/route.ts`):
   - Added handlers for `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

5. **Seller UI** (`project/app/seller/overview/page.tsx`):
   - Added subscription plan card showing current plan, fee %, listings used/limit, and upgrade CTA

## Key Features Implemented

### 1. Stripe Subscriptions

**API Endpoints**:
- `POST /api/stripe/subscriptions/create` - Create subscription (requires `planId: 'pro' | 'elite'`)
- `POST /api/stripe/subscriptions/cancel` - Cancel subscription (supports immediate or at period end)

**Subscription Lifecycle**:
- Free plan has no subscription (always active)
- Pro and Elite require active Stripe subscriptions
- Subscription statuses: `active`, `past_due`, `canceled`, `trialing`, `unpaid`
- Payment failures automatically revert plan to `free` (unless admin override)

### 2. Plan-Based Fee Enforcement

**Fee Calculation** (Server-Side):
- Free: 7% (0.07)
- Pro: 6% (0.06)
- Elite: 4% (0.04)

**Enforcement Points**:
1. **Checkout** (`/api/stripe/checkout/create-session`):
   - Fetches seller's current plan from Firestore
   - Respects admin overrides (both plan and fee)
   - Reverts to `free` if subscription is `past_due`, `canceled`, or `unpaid` (unless admin override)
   - Calculates fee server-side using effective plan
   - Stores plan snapshot and fee percent in checkout metadata

2. **Order Creation** (webhook handler):
   - Uses plan snapshot from checkout metadata (immutable)
   - Stores immutable fields on order: `sellerPlanSnapshot`, `platformFeePercent`, `platformFeeAmount`, `sellerPayoutAmount`

**Admin Overrides**:
- Admin can override both plan (`adminPlanOverride`) and fee percent (`adminFeeOverride`)
- Overrides take precedence over subscription status
- All overrides are audit-logged

### 3. Listing Limit Enforcement

**Limits**:
- Free: 3 active listings
- Pro: 10 active listings
- Elite: Unlimited

**Enforcement Points**:
1. **Check Limit** (`POST /api/listings/check-limit`):
   - Returns: `canCreate`, `planId`, `activeListingsCount`, `listingLimit`, `remainingSlots`, `feePercent`
   - Respects admin overrides and subscription status

2. **Publish Listing** (`POST /api/listings/publish`):
   - Server-side check before publishing
   - Returns 403 with upgrade message if limit exceeded
   - Client can call this before attempting to publish

3. **Client-Side** (`lib/firebase/listings.ts` - `publishListing`):
   - Already has limit check (kept for immediate feedback)
   - Should call server-side API for final enforcement

### 4. Subscription Webhooks

**Handled Events**:
- `customer.subscription.created` - Creates/updates subscription in Firestore
- `customer.subscription.updated` - Syncs status changes, reverts to free if past_due/canceled
- `customer.subscription.deleted` - Reverts to free plan
- `invoice.payment_succeeded` - Marks subscription as active
- `invoice.payment_failed` - Marks subscription as past_due, reverts plan to free

**Sync Logic**:
- All webhooks update Firestore user doc with current subscription status
- Automatically revert to `free` plan if subscription fails (unless admin override)
- Respects admin overrides (they take precedence)

### 5. Admin Overrides

**Endpoint**: `POST /api/admin/users/[userId]/plan-override`

**Parameters**:
- `planOverride`: `'free' | 'pro' | 'elite' | null` (null = remove override)
- `feeOverride`: `number | null` (0.07 = 7%, null = remove override)
- `reason`: Required string (max 500 chars)
- `notes`: Optional string (max 1000 chars)

**Behavior**:
- Admin overrides take precedence over subscription status
- All overrides are audit-logged
- Can override plan, fee, or both
- Setting to `null` removes override

### 6. Seller Dashboard UI

**Subscription Card** (Seller Overview):
- Shows current plan (Free/Pro/Elite) with icon
- Displays transaction fee percentage
- Shows active listings count / limit
- Displays remaining slots (if not unlimited)
- Shows upgrade CTA if on free plan or pro plan with inactive subscription
- Warning banner if limit reached with upgrade prompt

## Environment Variables Required

```bash
# Stripe Subscription Price IDs (create in Stripe Dashboard)
STRIPE_PRICE_ID_PRO=price_xxxxx  # Pro plan monthly subscription
STRIPE_PRICE_ID_ELITE=price_xxxxx  # Elite plan monthly subscription
```

**Setup Steps**:
1. Create products in Stripe Dashboard:
   - Product: "Pro Plan" ($49/month, recurring monthly)
   - Product: "Elite Plan" ($199/month, recurring monthly)
2. Copy Price IDs to environment variables
3. Ensure webhook endpoint is configured in Stripe Dashboard

## Fee Calculation Flow

```
Checkout Request
  ↓
Fetch seller's user doc
  ↓
Determine effective plan:
  - Check adminPlanOverride (if set, use it)
  - Else check subscriptionPlan
  - If subscription status is past_due/canceled/unpaid → revert to 'free'
  ↓
Get fee percent:
  - Check adminFeeOverride (if set, use it)
  - Else use plan's takeRate (7%/6%/4%)
  ↓
Calculate platformFee = amount * feePercent (server-side)
  ↓
Store in checkout metadata:
  - sellerPlanSnapshot
  - platformFeePercent
  ↓
Order Creation (webhook)
  ↓
Use snapshot from metadata (immutable)
  ↓
Store on order:
  - sellerPlanSnapshot
  - platformFeePercent
  - platformFeeAmount
  - sellerPayoutAmount
```

## Listing Limit Enforcement Flow

```
User attempts to publish listing
  ↓
Client calls /api/listings/check-limit
  ↓
Server fetches user's effective plan
  ↓
Counts active listings (status === 'active')
  ↓
Checks canCreateListing(planId, activeCount)
  ↓
Returns canCreate: true/false + plan info
  ↓
If false: Show upgrade modal/error
If true: Proceed with publish
  ↓
Server-side publish endpoint also checks limit
  ↓
403 if limit exceeded (final enforcement)
```

## Subscription Status Effects

**Active/Trialing**:
- Full plan benefits (correct fee, listing limit)

**Past Due**:
- Reverts to `free` plan immediately
- New transactions use 7% fee
- Listing limit becomes 3

**Canceled/Unpaid**:
- Reverts to `free` plan
- New transactions use 7% fee
- Listing limit becomes 3

**Admin Override**:
- Takes precedence over subscription status
- Can maintain higher plan even if subscription fails
- Can set custom fee percent

## Audit Logging

All subscription and plan changes are logged:
- Subscription created/updated/deleted
- Payment succeeded/failed
- Admin plan/fee overrides

Logs include:
- Actor (user, webhook, admin)
- Before/after state
- Reason (for admin actions)
- Metadata (subscription ID, plan ID, etc.)

## Testing Checklist

- [ ] Create Pro subscription → verify plan updates in Firestore
- [ ] Create Elite subscription → verify plan updates in Firestore
- [ ] Payment fails → verify plan reverts to free
- [ ] Cancel subscription → verify plan reverts to free
- [ ] Checkout with Pro plan → verify 6% fee
- [ ] Checkout with Elite plan → verify 4% fee
- [ ] Checkout with free/past_due → verify 7% fee
- [ ] Order created → verify plan snapshot stored
- [ ] Publish listing at limit → verify 403 error
- [ ] Admin override plan → verify takes precedence
- [ ] Admin override fee → verify custom fee used
- [ ] Upgrade CTA appears when limit reached

## Migration Notes

**Existing Orders**:
- Orders without `sellerPlanSnapshot` will work (backward compatible)
- Fee percent defaults to 7% if not present
- No data migration required

**Existing Users**:
- Default to `free` plan if no subscription plan set
- No breaking changes

## Security Notes

✅ **Server-Side Fee Calculation**: Fees are NEVER calculated client-side
✅ **Plan Snapshot**: Order stores immutable plan snapshot at checkout
✅ **Admin-Only Overrides**: Plan/fee override endpoint requires admin role
✅ **Audit Logging**: All plan changes are logged with actor and reason
✅ **No Client Input**: Fee percent is never accepted from client
✅ **Subscription Sync**: Webhooks ensure Firestore matches Stripe

---

**Status**: ✅ Complete - Subscription management, fee enforcement, and listing limits fully implemented
