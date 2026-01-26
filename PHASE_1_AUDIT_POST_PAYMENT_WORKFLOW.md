# PHASE 1 — AUDIT: Post-Payment Workflow

## A) Payments + Transaction Creation

### 1) Checkout Initiation (UI)

**File:** `app/listing/[id]/page.tsx`
- **Lines:** 1703-1729
- **Component:** "Buy Now" button in listing detail page
- **Action:** Calls `handleBuyNow()` which triggers `createCheckoutSession()`

**Additional Entry Points:**
- `app/dashboard/offers/[offerId]/page.tsx` (line 236) - Checkout from accepted offer
- `components/offers/BuyerOfferDetailModal.tsx` (line 296) - Checkout from offer modal
- `components/offers/OfferPanel.tsx` (line 439) - Checkout from offer panel
- `app/dashboard/bids-offers/page.tsx` (line 489) - Checkout from bids/offers page

**Code Snippet:**
```typescript
// app/listing/[id]/page.tsx:1703
<Button 
  size="lg" 
  onClick={handleBuyNow}
  disabled={...}
>
  <ShoppingCart className="mr-2 h-5 w-5" />
  Buy Now — ${checkoutAmountUsd.toLocaleString()}
</Button>
```

### 2) Backend Endpoint Creating PaymentIntent

**File:** `app/api/stripe/checkout/create-session/route.ts`
- **Endpoint:** `POST /api/stripe/checkout/create-session`
- **Lines:** 53-1089
- **Function:** Creates Stripe Checkout Session (which creates PaymentIntent internally)

**Wire Transfer Alternative:**
**File:** `app/api/stripe/wire/create-intent/route.ts`
- **Endpoint:** `POST /api/stripe/wire/create-intent`
- **Function:** Creates PaymentIntent directly for wire transfers

**Code Snippet:**
```typescript
// app/api/stripe/checkout/create-session/route.ts:961
const sessionConfig: Stripe.Checkout.SessionCreateParams = {
  payment_method_types: paymentMethod === 'ach_debit' ? ['us_bank_account'] : ['card'],
  line_items: [...],
  mode: 'payment',
  success_url: `${getAppUrl()}/dashboard/orders?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${getAppUrl()}/listing/${listingId}?canceled=1`,
  payment_intent_data: {
    application_fee_amount: platformFee, // 5% platform fee
    transfer_data: {
      destination: sellerStripeAccountId, // Seller paid immediately
    },
    metadata: {
      transactionId: orderId,
      listingId: listingId,
      buyerId: buyerId,
      sellerId: listingData.sellerId,
      transportOption: String(transportOption),
      paymentType: 'full',
    },
  },
  metadata: {
    orderId,
    listingId: listingId,
    buyerId: buyerId,
    sellerId: listingData.sellerId,
    transportOption: String(transportOption),
    ...
  },
};
```

### 3) Storage of PaymentIntent ID and Transaction Record

**File:** `app/api/stripe/webhook/handlers.ts`
- **Function:** `handleCheckoutSessionCompleted()`
- **Lines:** 75-859
- **Firestore Path:** `orders/{orderId}`

**Fields Stored:**
```typescript
// Lines 477-533
{
  stripeCheckoutSessionId: checkoutSessionId,
  stripePaymentIntentId: paymentIntentId,
  sellerStripeAccountId: sellerStripeAccountId,
  status: orderStatus, // Legacy: 'paid' | 'awaiting_bank_transfer' | 'awaiting_wire' | 'pending'
  transactionStatus: fulfillmentStatus, // NEW: 'PAID' | 'PENDING_PAYMENT' | 'FULFILLMENT_REQUIRED'
  transportOption: String(transportOption), // 'SELLER_TRANSPORT' | 'BUYER_TRANSPORT'
  amount: amount / 100,
  platformFee: platformFee / 100,
  sellerAmount: sellerAmount / 100,
  paidAt: isAsync ? null : now,
  disputeDeadlineAt: isAsync ? null : disputeDeadline,
  // ... snapshots, compliance fields, etc.
}
```

### 4) Webhook Handler

**File:** `app/api/stripe/webhook/handlers.ts`
- **Function:** `handleCheckoutSessionCompleted()`
- **Lines:** 75-859
- **Event:** `checkout.session.completed`

**What It Writes:**
- Creates/updates order document in `orders/{orderId}` collection
- Sets `status: 'paid'` (legacy) and `transactionStatus: 'PAID'` (new)
- Sets `transportOption` from listing
- Creates timeline events
- Marks listing as `sold`
- Links offer to order (if applicable)
- Creates audit log

**Async Payment Handler:**
**File:** `app/api/stripe/webhook/handlers.ts`
- **Function:** `handleCheckoutSessionAsyncPaymentSucceeded()`
- **Lines:** 868-1152
- **Event:** `checkout.session.async_payment_succeeded`
- **Behavior:** Similar to `checkout.session.completed` but for async payment methods (ACH/wire)

### 5) Transaction/Order Document Schema

**File:** `lib/types.ts`
- **Interface:** `Order` (lines 666-856)
- **Firestore Collection:** `orders`

**Key Fields:**
```typescript
{
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  platformFee: number;
  sellerAmount: number;
  
  // LEGACY STATUS (backward compatibility)
  status: OrderStatus; // 'pending' | 'paid' | 'paid_held' | 'in_transit' | 'delivered' | 'buyer_confirmed' | 'ready_to_release' | 'completed' | 'refunded' | 'cancelled'
  
  // NEW STATUS (fulfillment-based, seller already paid)
  transactionStatus?: TransactionStatus; // 'PENDING_PAYMENT' | 'PAID' | 'FULFILLMENT_REQUIRED' | 'READY_FOR_PICKUP' | 'PICKED_UP' | 'DELIVERY_SCHEDULED' | 'OUT_FOR_DELIVERY' | 'DELIVERED_PENDING_CONFIRMATION' | 'COMPLETED' | 'DISPUTE_OPENED' | 'SELLER_NONCOMPLIANT' | 'REFUNDED' | 'CANCELLED'
  
  transportOption?: 'SELLER_TRANSPORT' | 'BUYER_TRANSPORT';
  
  // Stripe fields
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  sellerStripeAccountId?: string;
  
  // Payment tracking
  paymentMethod?: 'card' | 'ach_debit' | 'bank_transfer' | 'wire';
  paidAt?: Date;
  disputeDeadlineAt?: Date;
  
  // Fulfillment markers
  sellerPreparingAt?: Date;
  inTransitAt?: Date;
  deliveredAt?: Date;
  buyerConfirmedAt?: Date;
  
  // FULFILLMENT WORKFLOW FIELDS
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
  
  issues?: {
    openedAt?: Date;
    reason?: string;
    notes?: string;
    photos?: string[];
  };
  
  // Admin fields
  adminHold?: boolean;
  adminActionNotes?: Array<{...}>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  
  // Snapshots (for fast rendering)
  listingSnapshot?: {...};
  sellerSnapshot?: {...};
  timeline?: OrderTimelineEvent[];
}
```

---

## B) Sold Tab

### 6) Firestore Query for Sold Tab

**File:** `app/seller/sales/page.tsx`
- **Lines:** 128-161
- **Function:** `load()`

**Query:**
```typescript
// lib/firebase/orders.ts:314-327
export async function getOrdersForUser(
  userId: string,
  role: 'buyer' | 'seller' = 'buyer'
): Promise<Order[]> {
  const ordersRef = collection(db, 'orders');
  const q = query(
    ordersRef,
    where(role === 'buyer' ? 'buyerId' : 'sellerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => toOrder(doc.id, doc.data() as OrderDoc));
}
```

**Filter Applied:**
- **Collection:** `orders`
- **Filter:** `where('sellerId', '==', currentUser.uid)`
- **Order:** `orderBy('createdAt', 'desc')`
- **Client-side filter:** Excludes `status === 'pending' && stripeCheckoutSessionId` (abandoned checkouts)

### 7) Sold Tab Display

**File:** `app/seller/sales/page.tsx`
- **Lines:** 205-631

**Displays:**
- Listing title (from `listingSnapshot.title` or fetched listing)
- Buyer info (name, email) - fetched from `publicProfiles`
- Amount (`order.amount`)
- Status badge (derived from `order.status`)
- Payment details (collapsible):
  - Net proceeds
  - Buyer paid date
  - Payment status: "Paid immediately"
  - Payment method
- Order date
- Actions: View details link

**Tabs:**
- `needs_action` - Orders requiring seller action
- `in_progress` - Orders in progress
- `completed` - Completed orders
- `cancelled` - Cancelled/refunded orders
- `all` - All orders

### 8) Seller Actions (Mark Delivered/In Transit)

**File:** `app/seller/orders/[orderId]/page.tsx`
- **Lines:** 195-249

**Actions Available:**
1. **Mark Preparing** - `POST /api/orders/[orderId]/mark-preparing`
   - **File:** `app/api/orders/[orderId]/mark-preparing/route.ts`
   - **Sets:** `sellerPreparingAt: Timestamp.now()`
   - **Allowed Statuses:** `['paid', 'paid_held']`

2. **Mark In Transit** - `POST /api/orders/[orderId]/mark-in-transit`
   - **File:** `app/api/orders/[orderId]/mark-in-transit/route.ts`
   - **Lines:** 30-148
   - **Sets:** `status: 'in_transit'`, `inTransitAt: Timestamp.now()`
   - **Allowed Statuses:** `['paid', 'paid_held']`

3. **Mark Delivered** - `POST /api/orders/[orderId]/mark-delivered`
   - **File:** `app/api/orders/[orderId]/mark-delivered/route.ts`
   - **Lines:** 35-192
   - **Sets:** `status: 'delivered'`, `deliveredAt: now`, `deliveryProofUrls?: string[]`
   - **Allowed Statuses:** `['paid', 'paid_held', 'in_transit']`

**Code Snippet:**
```typescript
// app/seller/orders/[orderId]/page.tsx:229
<Button
  variant="outline"
  disabled={!canMarkInTransit || processing !== null}
  onClick={async () => {
    setProcessing('in_transit');
    await postAuthJson(`/api/orders/${order.id}/mark-in-transit`);
    toast({ title: 'Updated', description: 'Marked in transit.' });
    const refreshed = await getOrderById(order.id);
    if (refreshed) setOrder(refreshed);
  }}
>
  Mark in transit
</Button>
```

---

## C) Purchases Tab

### 9) Firestore Query for Purchases Tab

**File:** `app/dashboard/orders/page.tsx`
- **Lines:** 129-137
- **Function:** `loadOrders()`

**Query:**
```typescript
// Same as Sold tab, but role='buyer'
const userOrdersRaw = await getOrdersForUser(user.uid, 'buyer');
// Filter out abandoned checkouts
const userOrders = userOrdersRaw.filter((o) => !(o.status === 'pending' && o.stripeCheckoutSessionId));
```

**Filter Applied:**
- **Collection:** `orders`
- **Filter:** `where('buyerId', '==', currentUser.uid)`
- **Order:** `orderBy('createdAt', 'desc')`
- **Client-side filter:** Excludes abandoned pending checkouts

### 10) Buyer Actions (Confirm Receipt)

**File:** `app/dashboard/orders/[orderId]/page.tsx`
- **Lines:** 363-381

**Action:**
- **Confirm Receipt** - `POST /api/orders/[orderId]/confirm-receipt`
  - **File:** `app/api/orders/[orderId]/confirm-receipt/route.ts`
  - **Lines:** 29-186
  - **Sets:** `status: 'buyer_confirmed'`, `buyerConfirmedAt: now`, `acceptedAt: now` (legacy)
  - **Allowed Statuses:** `['paid', 'paid_held', 'in_transit', 'delivered']`
  - **Requirement:** Must have `inTransitAt` OR `deliveredAt` OR `deliveryConfirmedAt`

**Code Snippet:**
```typescript
// app/dashboard/orders/[orderId]/page.tsx:365
await confirmReceipt(order.id);
// lib/stripe/api.ts - calls POST /api/orders/[orderId]/confirm-receipt
```

**Dispute Action:**
- **File:** `app/dashboard/orders/[orderId]/page.tsx` (line 384+)
- **Endpoint:** `POST /api/orders/[orderId]/disputes/open`
- **Opens dispute with reason and evidence**

---

## D) Post-Payment Fulfillment Workflow

### 11) Current Fulfillment Statuses

**File:** `lib/types.ts`
- **Lines:** 554-568

**TransactionStatus Enum:**
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

**Legacy OrderStatus (still in use):**
```typescript
export type OrderStatus =
  | 'pending'
  | 'awaiting_bank_transfer'
  | 'awaiting_wire'
  | 'paid_held'  // DEPRECATED
  | 'paid'       // DEPRECATED
  | 'in_transit'
  | 'delivered'
  | 'buyer_confirmed'
  | 'accepted'   // DEPRECATED
  | 'ready_to_release'  // DEPRECATED
  | 'disputed'
  | 'completed'
  | 'refunded'
  | 'cancelled';
```

### 12) Actions After Payment

**Seller Actions:**
1. **Mark Preparing** - `POST /api/orders/[orderId]/mark-preparing`
   - Sets `sellerPreparingAt`
   - Notifies buyer

2. **Mark In Transit** - `POST /api/orders/[orderId]/mark-in-transit`
   - Sets `status: 'in_transit'`, `inTransitAt`
   - Notifies buyer

3. **Mark Delivered** - `POST /api/orders/[orderId]/mark-delivered`
   - Sets `status: 'delivered'`, `deliveredAt`
   - Optional: `deliveryProofUrls[]`
   - Notifies buyer

**Buyer Actions:**
1. **Confirm Receipt** - `POST /api/orders/[orderId]/confirm-receipt`
   - Sets `status: 'buyer_confirmed'`, `buyerConfirmedAt`
   - Requires seller to have marked in transit or delivered
   - Notifies seller

2. **Open Dispute** - `POST /api/orders/[orderId]/disputes/open`
   - Sets `disputeStatus: 'open'`
   - Requires reason and evidence (for protected transactions)

### 13) Transport Option Storage

**File:** `app/api/stripe/webhook/handlers.ts`
- **Lines:** 392-395

**Source:** Inherited from listing at checkout time
```typescript
const transportOption = (listingData as any)?.transportOption || 
                       ((listingData as any)?.trust?.sellerOffersDelivery ? 'SELLER_TRANSPORT' : 'BUYER_TRANSPORT') ||
                       'SELLER_TRANSPORT';
```

**Stored in Order:**
- **Field:** `transportOption: 'SELLER_TRANSPORT' | 'BUYER_TRANSPORT'`
- **Line:** 505 in webhook handler

**Listing Creation:**
- **File:** `app/dashboard/listings/new/page.tsx`
- **Field:** `transportOption` set from form `transportType` ('seller' | 'buyer')

### 14) Transition to "DELIVERED" Status

**Current Implementation:**

**Seller Marks Delivered:**
- **File:** `app/api/orders/[orderId]/mark-delivered/route.ts`
- **Lines:** 121-134
- **Sets:** `status: 'delivered'`, `deliveredAt: now`

**Buyer Confirms Receipt:**
- **File:** `app/api/orders/[orderId]/confirm-receipt/route.ts`
- **Lines:** 102-115
- **Sets:** `status: 'buyer_confirmed'`, `buyerConfirmedAt: now`
- **Also sets:** `deliveredAt` if not already set

**Admin Confirms Delivery:**
- **File:** `app/api/orders/[orderId]/confirm-delivery/route.ts`
- **Lines:** 121-127
- **Sets:** `status: 'delivered'`, `deliveryConfirmedAt: now`, `deliveredAt: now`
- **Also sets:** Protection window if applicable

**Code Snippet:**
```typescript
// app/api/orders/[orderId]/mark-delivered/route.ts:123
const updateData: any = {
  status: 'delivered' as OrderStatus,
  deliveredAt: now,
  updatedAt: now,
  lastUpdatedByRole: 'seller',
};
if (deliveryProofUrls && deliveryProofUrls.length > 0) {
  updateData.deliveryProofUrls = deliveryProofUrls;
}
await orderRef.update(updateData);
```

---

## E) Admin Ops Page

### 15) Firestore Query for Admin Ops

**File:** `app/api/admin/orders/route.ts`
- **Endpoint:** `GET /api/admin/orders`
- **Lines:** 34-277

**Queries by Filter:**
```typescript
// Filter: 'escrow' (fulfillment issues)
.where('status', 'in', [
  'paid', 'paid_held', 'awaiting_bank_transfer', 'awaiting_wire',
  'in_transit', 'delivered', 'buyer_confirmed', 'accepted', 'ready_to_release'
])
.orderBy('createdAt', 'desc')
.limit(limit);

// Filter: 'disputes'
.where('disputeStatus', 'in', ['open', 'needs_evidence', 'under_review'])
.orderBy('createdAt', 'desc')
.limit(limit);

// Filter: 'ready_to_release'
.where('status', 'in', ['ready_to_release', 'buyer_confirmed', 'accepted'])
.orderBy('createdAt', 'desc')
.limit(limit);

// Filter: 'protected' or 'all'
.orderBy('createdAt', 'desc')
.limit(limit); // Then filtered in-memory
```

**Client-side:**
- **File:** `app/dashboard/admin/ops/page.tsx`
- **Lines:** 140-155
- **Function:** `loadOrders()` calls `getAdminOrders(filter)`

### 16) Admin Ops Display Requirements

**File:** `app/dashboard/admin/ops/page.tsx`
- **Lines:** 1659-1738 (OrderCard component)

**Shows Per Transaction:**
- Order ID (last 8 chars)
- Status badge (derived from `order.status`, `order.disputeStatus`, `order.payoutHoldReason`)
- Listing title
- Buyer: name, email
- Seller: name, email
- Amount: total, seller receives
- Created date
- Payment status: "✓ Seller paid immediately via destination charge"
- Hold reason (if any) - DEPRECATED
- Actions: View, Release (disabled - shows "Already Paid"), Refund

**Tabs:**
- **All Purchases** - All orders
- **Fulfillment Issues** (legacy key: 'escrow') - Orders needing fulfillment attention
- **Protected** - Protected transactions
- **Open Disputes** - Orders with open disputes
- **Fulfillment Pending** (legacy key: 'ready_to_release') - Orders awaiting fulfillment completion

### 17) Admin Actions

**File:** `app/dashboard/admin/ops/page.tsx`

**Available Actions:**

1. **View Order Details** - Opens detail dialog
   - Shows trust state, issue state, fulfillment status, protection window, compliance docs

2. **Mark Paid (Stripe)** - `POST /api/admin/orders/[orderId]/mark-paid`
   - **File:** `app/api/admin/orders/[orderId]/mark-paid/route.ts`
   - **Lines:** 22-135
   - **Sets:** `status: 'paid_held'`, `paidAt: now`
   - **For:** Async payment methods (bank transfer/wire)

3. **Release Payout** - DEPRECATED
   - **File:** `app/dashboard/admin/ops/page.tsx`
   - **Lines:** 258-273
   - **Function:** `handleReleasePayout()`
   - **Status:** Shows "Seller Already Paid" toast - no actual release

4. **Refund** - `POST /api/stripe/refunds/process`
   - **File:** `app/api/stripe/refunds/process/route.ts`
   - **Sets:** `status: 'refunded'`, `stripeRefundId`, `refundedBy`, `refundedAt`

5. **Resolve Dispute** - `POST /api/orders/[orderId]/disputes/resolve`
   - **File:** `app/api/orders/[orderId]/disputes/resolve/route.ts`
   - **Options:** 'release' | 'refund' | 'partial_refund'
   - **Note:** 'release' no longer creates Stripe transfer (seller already paid)

6. **Set Admin Hold** - `POST /api/orders/[orderId]/admin-hold`
   - **File:** `lib/stripe/api.ts` (line 757)
   - **Sets:** `adminHold: boolean`, `adminHoldReason: string`

7. **Confirm Delivery** - `POST /api/orders/[orderId]/confirm-delivery`
   - **File:** `app/api/orders/[orderId]/confirm-delivery/route.ts`
   - **Sets:** `deliveryConfirmedAt: now`, starts protection window if applicable

**Code Snippet:**
```typescript
// app/dashboard/admin/ops/page.tsx:258
const handleReleasePayout = useCallback(async (orderId: string) => {
  setProcessingOrderId(orderId);
  try {
    toast({
      title: 'Seller Already Paid',
      description: 'Seller received funds immediately upon successful payment. No payout release needed.',
    });
    setReleaseDialogOpen(null);
  } catch (error: any) {
    // ...
  }
}, [toast]);
```

---

## SUMMARY OF CURRENT STATE

### Status Flow (Current):
1. **Payment Success** → `status: 'paid'`, `transactionStatus: 'PAID'`
2. **Seller Marks Preparing** → `sellerPreparingAt` set (no status change)
3. **Seller Marks In Transit** → `status: 'in_transit'`, `inTransitAt` set
4. **Seller Marks Delivered** → `status: 'delivered'`, `deliveredAt` set
5. **Buyer Confirms Receipt** → `status: 'buyer_confirmed'`, `buyerConfirmedAt` set
6. **Admin/System** → `status: 'completed'` (when appropriate)

### Issues Identified:
1. **Dual Status System:** Both `status` (legacy) and `transactionStatus` (new) exist, causing confusion
2. **Transport Option Not Fully Utilized:** `transportOption` is stored but workflow doesn't differentiate BUYER_TRANSPORT vs SELLER_TRANSPORT
3. **Fulfillment Fields Exist But Not Used:** `pickup` and `delivery` objects exist in schema but not populated/used
4. **Admin Ops Still References Escrow:** Tab key 'escrow' and queries still filter for payout-hold statuses
5. **Status Transitions Don't Use transactionStatus:** All transitions still use legacy `status` field
6. **No Pickup Workflow:** BUYER_TRANSPORT orders don't have pickup scheduling/confirmation flow
7. **No Delivery Scheduling:** SELLER_TRANSPORT orders don't have delivery ETA/scheduling flow
