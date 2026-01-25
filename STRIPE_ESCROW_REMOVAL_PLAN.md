# Stripe Escrow Removal - Implementation Plan

## Overview
Remove all escrow behavior and replace with immediate payment to sellers using Stripe Connect destination charges.

## Core Changes Required

### 1. Payment Creation (IMMEDIATE)
**Files:**
- `app/api/stripe/checkout/create-session/route.ts`
- `app/api/stripe/wire/create-intent/route.ts`

**Changes:**
- Use `payment_intent_data.transfer_data.destination = sellerStripeAccountId`
- Use `payment_intent_data.application_fee_amount = platformFeeInCents` (5%)
- Remove any `capture_method: 'manual'` logic
- Ensure automatic capture (default)

### 2. Remove Payout Release Logic (DELETE)
**Files to delete/modify:**
- `lib/stripe/release-payment.ts` - DELETE entire file
- `app/api/stripe/transfers/release/route.ts` - DELETE entire file
- `app/api/admin/orders/[orderId]/release/route.ts` - DELETE entire file
- `app/api/orders/[orderId]/disputes/resolve/route.ts` - Remove payout release logic
- `netlify/functions/autoReleaseProtected.ts` - DELETE entire file

### 3. Update Order/Transaction Status Model
**File:** `lib/types.ts`

**New Status Type:**
```typescript
export type TransactionStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'FULFILLMENT_REQUIRED'
  | 'READY_FOR_PICKUP'        // BUYER_TRANSPORT
  | 'PICKUP_SCHEDULED'        // BUYER_TRANSPORT (optional)
  | 'PICKED_UP'               // BUYER_TRANSPORT
  | 'DELIVERY_SCHEDULED'      // SELLER_TRANSPORT
  | 'OUT_FOR_DELIVERY'        // SELLER_TRANSPORT (optional)
  | 'DELIVERED_PENDING_CONFIRMATION' // SELLER_TRANSPORT
  | 'COMPLETED'
  | 'DISPUTE_OPENED'
  | 'SELLER_NONCOMPLIANT'
  | 'REFUNDED'
  | 'CANCELLED';
```

**Remove:**
- `paid_held`, `ready_to_release`, `awaiting_bank_transfer`, `awaiting_wire`
- `PayoutHoldReason` type (or keep minimal for disputes only)
- All escrow-related fields

### 4. Add Transport Option
**File:** `lib/types.ts`

**Add to Listing:**
```typescript
transportOption: 'SELLER_TRANSPORT' | 'BUYER_TRANSPORT';
```

**Add to Order/Transaction:**
```typescript
transportOption: 'SELLER_TRANSPORT' | 'BUYER_TRANSPORT';
pickup?: {
  location?: string;
  windows?: Array<{ start: Date; end: Date }>;
  selectedWindow?: { start: Date; end: Date };
  pickupCode?: string;
  confirmedAt?: Date;
  proofPhotos?: string[];
};
delivery?: {
  eta?: Date;
  transporter?: { name?: string; phone?: string; plate?: string };
  proofUploads?: Array<{ type: string; url: string; uploadedAt: Date }>;
  deliveredAt?: Date;
  buyerConfirmedAt?: Date;
};
```

### 5. Update Webhook Handlers
**File:** `app/api/stripe/webhook/handlers.ts`

**Changes:**
- On `checkout.session.completed`: Create order with status `PAID`
- Immediately mark seller as paid (no payout release needed)
- Start fulfillment workflow based on `transportOption`
- Remove all payout release logic

### 6. Update UI Components
**Files:**
- `components/orders/TransactionTimeline.tsx` - Remove escrow language
- `app/dashboard/orders/[orderId]/page.tsx` - Show fulfillment steps
- `app/seller/sales/page.tsx` - Remove payout hold references
- `app/dashboard/admin/ops/page.tsx` - Remove payout release UI
- `app/dashboard/admin/payouts/page.tsx` - DELETE or repurpose

### 7. Update Copy/Language
- Remove all "escrow", "hold", "release funds" language
- Update to fulfillment-focused language
- Use "delayed settlement" terminology where needed (already done in copy refactor)

## Implementation Order

1. ✅ Update types.ts with new status model
2. ✅ Update checkout/create-session to use destination charges
3. ✅ Update wire/create-intent to use destination charges
4. ✅ Update webhook handlers
5. ✅ Delete payout release logic
6. ✅ Update UI components
7. ✅ Add fulfillment workflow endpoints
8. ✅ Update listing creation to require transportOption
