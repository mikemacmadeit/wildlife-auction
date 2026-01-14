# E2E Tests Documentation

## Overview

This directory contains end-to-end tests for Wildlife Exchange, focusing on critical payment and webhook flows.

## Prerequisites

1. **Playwright installed**: Run `npx playwright install` after `npm install`
2. **Test environment**: Either:
   - Firebase Emulator configured (recommended)
   - Test Firebase project with credentials

## Test Structure

```
tests/
├── e2e/
│   ├── stripe-webhook.spec.ts    # Webhook handling tests
│   └── auto-release.spec.ts      # Auto-release cron tests
└── helpers/
    └── stripeWebhookHarness.ts   # Webhook test utilities
```

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run with UI (interactive)
```bash
npm run test:e2e:ui
```

### Run in headed mode (see browser)
```bash
npm run test:e2e:headed
```

### Run all checks (typecheck + lint + tests)
```bash
npm run test:all
```

## Test Environment Variables

Create a `.env.test` file (or set in your environment):

```bash
# Stripe (test mode)
STRIPE_WEBHOOK_SECRET=whsec_test_secret
STRIPE_SECRET_KEY=sk_test_dummy  # Not used in tests, but required

# Firebase (test project or emulator)
TEST_FIREBASE_PROJECT_ID=wildlife-exchange-test
FIRESTORE_EMULATOR_HOST=localhost:8080  # If using emulator
TEST_FIREBASE_CLIENT_EMAIL=test@example.com  # If not using emulator
TEST_FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"  # If not using emulator

# Test server
TEST_BASE_URL=http://localhost:3000
TEST_SKIP_SERVER=false  # Set to true if server is already running
```

## Using Firebase Emulator (Recommended)

1. Install Firebase Tools:
```bash
npm install -g firebase-tools
```

2. Start emulator:
```bash
firebase emulators:start --only firestore
```

3. Set environment variable:
```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
```

4. Run tests:
```bash
npm run test:e2e
```

## Test Cases

### 1. Checkout Session Completed (Idempotency)

**File**: `tests/e2e/stripe-webhook.spec.ts`

**Tests**:
- Sending same event twice creates only one order
- `stripeEvents/{eventId}` exists for idempotency tracking
- Order status is 'paid'
- Listing is marked as 'sold'

### 2. Chargeback Handling

**File**: `tests/e2e/stripe-webhook.spec.ts`

**Tests**:
- `charge.dispute.created` creates `chargebacks/{disputeId}` record
- Order is placed on hold (`adminHold = true`)
- Order `payoutHoldReason` is set to 'admin_hold'
- Order `disputeStatus` is set to 'open'

### 3. Auto-Release Logic

**File**: `tests/e2e/auto-release.spec.ts`

**Tests**:
- Eligible orders are identified correctly
- Orders with admin hold are skipped
- Orders with open disputes are skipped
- Orders already released are skipped
- Health metrics are written

## Troubleshooting

### Tests fail with "Firebase Admin not initialized"

**Solution**: Ensure test environment variables are set, or use emulator.

### Tests fail with "Webhook signature verification failed"

**Solution**: Check `STRIPE_WEBHOOK_SECRET` matches the test secret used in harness.

### Tests fail with "Order not found"

**Solution**: Ensure test data setup runs before assertions. Check `beforeAll` hooks.

### Server not starting

**Solution**: Set `TEST_SKIP_SERVER=true` if you're running the server manually.

## Notes

- Tests use **test-safe Stripe event IDs** (prefixed with `test_`)
- Tests **never hit real Stripe API** (mocked in harness)
- Tests use **isolated test database** (emulator or test project)
- Tests **do not affect production data**
