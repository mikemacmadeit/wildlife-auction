# P0 Production Safety Implementation

## Summary

This document describes the implementation of P0 production safety features for Stripe + Firestore.

## Changes Made

### 1. Webhook Idempotency (REAL)

**File**: `project/app/api/stripe/webhook/route.ts`

**Changes**:
- Added Firestore transaction-based idempotency using Stripe `event.id`
- Creates collection: `stripeEvents/{eventId}`
- In transaction: if doc exists → return early 200
- Else set doc with: `{ type, createdAt, checkoutSessionId, paymentIntentId }`
- Idempotency happens BEFORE calling `handleCheckoutSessionCompleted`
- Keeps existing order existence check as secondary guard

**Code Location**: Lines 111-161

**Key Logic**:
```typescript
// Check if event already processed
const eventDoc = await transaction.get(eventRef);
if (eventDoc.exists) {
  eventAlreadyProcessed = true;
  return; // Exit transaction
}
// Record new event
transaction.set(eventRef, eventData);
```

### 2. Chargeback Handlers

**File**: `project/app/api/stripe/webhook/route.ts`

**Changes**:
- Added switch cases for:
  - `charge.dispute.created` → `handleChargeDisputeCreated()`
  - `charge.dispute.closed` → `handleChargeDisputeClosed()`
  - `charge.dispute.funds_withdrawn` → `handleChargeDisputeFundsWithdrawn()`
  - `charge.dispute.funds_reinstated` → `handleChargeDisputeFundsReinstated()`
- Creates collection: `chargebacks/{disputeId}`
- Persists: `{ disputeId, status, amount, currency, reason, charge, paymentIntent, createdAt, updatedAt }`
- Finds related order by `stripePaymentIntentId`
- If order exists, sets:
  - `adminHold = true`
  - `payoutHoldReason = 'dispute_open'`
  - `disputeStatus = 'open'`
  - `disputedAt = now`

**Code Location**: Lines 163-178 (switch cases), Lines 402-548 (handler functions)

### 3. Auto-Release Scheduled Job

**File**: `project/netlify/functions/autoReleaseProtected.ts` (NEW)

**Changes**:
- Created Netlify scheduled function using `@netlify/functions`
- Runs every 10 minutes (cron: `*/10 * * * *`)
- Queries eligible orders:
  - `stripeTransferId` missing
  - `adminHold != true`
  - `disputeStatus` not in `['open', 'needs_evidence', 'under_review']`
  - AND (
      (protectedTransactionDaysSnapshot exists AND protectionEndsAt <= now AND deliveryConfirmedAt exists)
      OR
      (disputeDeadlineAt <= now AND status in ['paid','in_transit','delivered'])
    )
- Uses shared `releasePaymentForOrder()` function from `project/lib/stripe/release-payment.ts`
- Logs all steps for traceability

**File**: `project/netlify.toml`

**Changes**:
- Added `[functions]` section with `included_files = ["netlify/functions/**"]`

**File**: `project/lib/stripe/release-payment.ts` (NEW)

**Changes**:
- Created shared payment release logic
- Used by both manual release endpoint and auto-release function
- Validates eligibility, creates Stripe transfer, updates Firestore, sends email

### 4. Redis-Based Rate Limiting

**File**: `project/lib/rate-limit.ts`

**Changes**:
- Replaced in-memory Map store with Upstash Redis
- Keeps existing function signature (but now async)
- Uses TTL for windows
- Env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Fallback to in-memory if env vars missing (with warning log)

**Code Location**: Lines 1-131

**Key Logic**:
```typescript
// Try Redis first
if (redis) {
  const currentCount = await redis.get<number>(redisKey) || 0;
  if (currentCount >= config.maxRequests) {
    return { allowed: false, retryAfter };
  }
  await redis.incr(redisKey);
  return { allowed: true };
}
// Fallback to in-memory
```

**Updated Files** (all rate limiting calls now async):
- `project/app/api/stripe/transfers/release/route.ts`
- `project/app/api/stripe/checkout/create-session/route.ts`
- `project/app/api/stripe/refunds/process/route.ts`
- `project/app/api/stripe/connect/create-account/route.ts`
- `project/app/api/messages/send/route.ts`
- `project/app/api/admin/orders/route.ts`
- `project/app/api/orders/[orderId]/accept/route.ts`
- `project/app/api/orders/[orderId]/dispute/route.ts`
- `project/app/api/orders/[orderId]/disputes/open/route.ts`
- `project/app/api/orders/[orderId]/disputes/evidence/route.ts`
- `project/app/api/orders/[orderId]/disputes/cancel/route.ts`
- `project/app/api/orders/[orderId]/disputes/resolve/route.ts`
- `project/app/api/orders/[orderId]/mark-delivered/route.ts`
- `project/app/api/orders/[orderId]/confirm-delivery/route.ts`
- `project/app/api/orders/[orderId]/admin-hold/route.ts`

**Package Dependencies Added**:
- `@netlify/functions`: `^2.4.0`
- `@upstash/redis`: `^1.34.0`

## Firestore Security Rules Updates

**File**: `project/firestore.rules`

**Changes**:
- Added rules for `stripeEvents` collection (server-side only, no client access)
- Added rules for `chargebacks` collection (admin read, server-side write only)

## Environment Variables Required

Add to `.env.local` and Netlify environment variables:

```env
# Redis (Upstash)
UPSTASH_REDIS_REST_URL=https://your-redis-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Existing vars (already required)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=...
```

## How to Test

### 1. Simulate Webhook Retry

**Test**: Verify idempotency prevents duplicate orders

**Steps**:
1. Create a test checkout session
2. Trigger webhook manually with Stripe CLI:
   ```bash
   stripe trigger checkout.session.completed
   ```
3. Note the `event.id` from logs
4. Trigger the same event again (same `event.id`)
5. **Expected**: Second webhook should return `{ received: true, idempotent: true }` without creating duplicate order
6. **Verify**: Check Firestore `stripeEvents` collection - should have one doc with that `eventId`
7. **Verify**: Check Firestore `orders` collection - should have one order for that checkout session

**Logs to Check**:
- `[WEBHOOK] Event {eventId} already processed at {timestamp}, skipping`

### 2. Simulate Charge Dispute Event

**Test**: Verify chargeback handler creates chargeback record and places order on hold

**Steps**:
1. Create a test order with a known `stripePaymentIntentId`
2. Trigger chargeback event with Stripe CLI:
   ```bash
   stripe trigger charge.dispute.created
   ```
3. **Expected**: 
   - Chargeback record created in `chargebacks/{disputeId}`
   - Order updated with `adminHold = true`, `payoutHoldReason = 'dispute_open'`, `disputeStatus = 'open'`
4. **Verify**: Check Firestore `chargebacks` collection
5. **Verify**: Check Firestore `orders` collection - order should have `adminHold = true`

**Logs to Check**:
- `[handleChargeDisputeCreated] Processing dispute {disputeId}`
- `[handleChargeDisputeCreated] Placed order {orderId} on hold due to chargeback {disputeId}`

### 3. Validate Auto-Release Runs

**Test**: Verify scheduled function releases eligible orders

**Steps**:
1. Create test orders that are eligible for auto-release:
   - Order A: `status = 'paid'`, `disputeDeadlineAt` = 1 hour ago, no `stripeTransferId`
   - Order B: `status = 'delivered'`, `protectionEndsAt` = 1 hour ago, `deliveryConfirmedAt` exists, no `stripeTransferId`
2. Wait for scheduled function to run (or trigger manually via Netlify Functions dashboard)
3. **Expected**: 
   - Both orders should have `stripeTransferId` set
   - Both orders should have `status = 'completed'`
   - Stripe transfers should be created
4. **Verify**: Check Firestore `orders` collection
5. **Verify**: Check Stripe Dashboard for transfers

**Logs to Check**:
- `[autoReleaseProtected] Scheduled function triggered`
- `[autoReleaseProtected] Found {N} eligible orders for auto-release`
- `[autoReleaseProtected] Successfully auto-released order {orderId}`

**Manual Trigger** (for testing):
```bash
# Use Netlify CLI or trigger via dashboard
netlify functions:invoke autoReleaseProtected
```

### 4. Validate Rate Limiting Persists Across Restarts

**Test**: Verify Redis rate limiting works and persists

**Steps**:
1. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
2. Make 10 requests to an admin endpoint (rate limit is 10/min)
3. 11th request should be rate limited (429)
4. **Restart server** (or deploy new version)
5. Make another request immediately
6. **Expected**: Should still be rate limited (count persisted in Redis)
7. Wait 60 seconds
8. Make request again
9. **Expected**: Should succeed (window expired)

**Logs to Check**:
- `[rate-limit] Redis initialized successfully` (if Redis configured)
- `[rate-limit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set, using in-memory rate limiting` (if not configured)

**Fallback Test** (no Redis):
1. Remove `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
2. Make requests
3. **Expected**: Should use in-memory rate limiting (warning logged)
4. **Restart server**
5. **Expected**: Rate limit resets (in-memory doesn't persist)

## Deployment Checklist

- [ ] Install new dependencies: `npm install @netlify/functions @upstash/redis`
- [ ] Set `UPSTASH_REDIS_REST_URL` in Netlify environment variables
- [ ] Set `UPSTASH_REDIS_REST_TOKEN` in Netlify environment variables
- [ ] Deploy Firestore security rules (includes new collections)
- [ ] Verify scheduled function is registered in Netlify dashboard
- [ ] Test webhook idempotency with Stripe CLI
- [ ] Test chargeback handler with Stripe CLI
- [ ] Monitor auto-release function logs for first run
- [ ] Verify rate limiting works in production

## Monitoring

**Key Metrics to Monitor**:
- Webhook idempotency hits (should see `idempotent: true` responses)
- Chargeback records created
- Auto-release function execution count and success rate
- Rate limiting 429 responses
- Redis connection errors (if any)

**Log Patterns**:
- `[WEBHOOK]` - Webhook processing
- `[handleChargeDisputeCreated]` - Chargeback handling
- `[autoReleaseProtected]` - Auto-release function
- `[rate-limit]` - Rate limiting
- `[releasePaymentForOrder]` - Payment release (shared function)
