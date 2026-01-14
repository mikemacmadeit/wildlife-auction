# Admin Ops Dashboard - Audit Report

## 1. EXISTING ADMIN PAGES FOUND

### Admin Dashboard Routes:
- `/dashboard/admin/listings` - Approve Listings page
- `/dashboard/admin/payouts` - Manage Payouts page (shows all orders, has release/refund)
- `/dashboard/admin/messages` - Flagged Messages page
- `/dashboard/admin/protected-transactions` - Protected Transactions page (partially implemented)

### Navigation:
- Admin nav items shown in `/dashboard/layout.tsx` under "Admin" divider
- Uses `useAdmin` hook to conditionally show admin nav items

## 2. ADMIN ROLE CHECKS

### Client-Side:
- `project/hooks/use-admin.ts` - Hook checks Firestore user document for `role === 'admin' || role === 'super_admin'`
- Admin pages use `useAdmin()` hook and show "Access Denied" if not admin

### Server-Side (API Routes):
- Pattern: Verify Firebase Auth token, then check Firestore user document
- Example from `transfers/release/route.ts`:
  ```typescript
  const adminUserDoc = await db.collection('users').doc(adminId).get();
  if (!adminUserDoc.exists || (adminUserDoc.data()?.role !== 'admin' && adminUserDoc.data()?.role !== 'super_admin')) {
    return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
  }
  ```

## 3. ORDER SCHEMA & STATUSES

### Order Status Values (from `lib/types.ts`):
```typescript
type OrderStatus = 'pending' | 'paid' | 'in_transit' | 'delivered' | 'accepted' | 'disputed' | 'completed' | 'refunded' | 'cancelled' | 'ready_to_release';
```

### Order Fields (from `lib/types.ts` and `lib/firebase/orders.ts`):

**Escrow Fields:**
- `paidAt?: Date` - When payment was captured
- `disputeDeadlineAt?: Date` - Deadline for buyer to dispute
- `deliveredAt?: Date` - When seller marked as delivered
- `acceptedAt?: Date` - When buyer accepted/received
- `disputedAt?: Date` - When buyer opened dispute
- `adminHold?: boolean` - Admin flag to prevent auto-release
- `lastUpdatedByRole?: 'buyer' | 'seller' | 'admin'`

**Protected Transaction Fields:**
- `deliveryConfirmedAt?: Date` - When delivery was confirmed (admin/ops)
- `protectionStartAt?: Date` - When protection window starts
- `protectionEndsAt?: Date` - When protection window ends
- `buyerAcceptedAt?: Date` - When buyer accepted early (releases funds)
- `disputeOpenedAt?: Date` - When buyer opened a protected transaction dispute
- `disputeStatus?: DisputeStatus` - Protected transaction dispute status
- `disputeEvidence?: DisputeEvidence[]` - Evidence uploaded for dispute
- `payoutHoldReason?: PayoutHoldReason` - Why payout is held ('none' | 'protection_window' | 'dispute_open')
- `protectedTransactionDaysSnapshot?: 7 | 14 | null` - Snapshot of listing protection days at purchase

**Payout Fields:**
- `stripeTransferId?: string` - Stripe transfer ID (null if not released)
- `releasedBy?: string` - Admin UID who released the payment
- `releasedAt?: Date` - When payment was released

**Dispute Fields:**
- `disputeReason?: string` - Reason for dispute (legacy, string-based)
- `disputeReasonV2?: DisputeReason` - Protected transaction dispute reason (enum)
- `disputeNotes?: string` - Additional dispute details

## 4. ESCROW & PAYOUT RELEASE FLOW

### Endpoint: `POST /api/stripe/transfers/release`
- **Location:** `project/app/api/stripe/transfers/release/route.ts`
- **Access:** Admin-only (verifies role server-side)
- **Functionality:**
  - Checks order eligibility (status, dispute deadline, admin hold, protected transaction window)
  - Creates Stripe transfer to seller's connected account
  - Updates order: `status = 'completed'`, sets `stripeTransferId`, `releasedBy`, `releasedAt`
  - Increments seller stats (`completedSalesCount`, `verifiedTransactionsCount`)

### Eligibility Rules (from `transfers/release/route.ts`):
1. **Always allow if:** `status === 'accepted'`
2. **If protected transaction:** Check `protectionEndsAt` has passed, status in `['paid', 'in_transit', 'delivered']`
3. **If standard escrow:** Check `disputeDeadlineAt` has passed, status in `['paid', 'in_transit', 'delivered']`
4. **Never allow if:** `status === 'disputed'` OR `adminHold === true`

## 5. REFUND FLOW

### Endpoint: `POST /api/stripe/refunds/process`
- **Location:** `project/app/api/stripe/refunds/process/route.ts`
- **Access:** Admin-only
- **Functionality:**
  - Supports full or partial refunds
  - Creates Stripe refund
  - Updates order: `status = 'refunded'` (full) or `'completed'` (partial), sets `stripeRefundId`, `refundedBy`, `refundedAt`, `refundReason`

## 6. DISPUTE-RELATED CODE

### Existing Dispute Endpoints:
1. **`POST /api/orders/[orderId]/disputes/open`** - Buyer opens dispute (protected transactions)
2. **`POST /api/orders/[orderId]/disputes/evidence`** - Buyer adds evidence
3. **`POST /api/orders/[orderId]/disputes/cancel`** - Buyer cancels dispute
4. **`POST /api/orders/[orderId]/disputes/resolve`** - Admin resolves dispute (release/refund/partial refund)

### Dispute Status Values:
```typescript
type DisputeStatus = 'none' | 'open' | 'needs_evidence' | 'under_review' | 'resolved_refund' | 'resolved_partial_refund' | 'resolved_release' | 'cancelled';
```

### Dispute Resolution Endpoint (`/api/orders/[orderId]/disputes/resolve`):
- **Body:** `{ resolution: 'release' | 'refund' | 'partial_refund', refundAmount?: number, markFraudulent?: boolean, adminNotes?: string }`
- **Behavior:**
  - If `release`: Calls transfer release logic, sets `disputeStatus = 'resolved_release'`
  - If `refund`: Calls refund logic, sets `disputeStatus = 'resolved_refund'`
  - If `partial_refund`: Calls refund logic with amount, sets `disputeStatus = 'resolved_partial_refund'`
  - Updates buyer abuse tracking if `markFraudulent === true`

## 7. HOW TO DETERMINE ORDER STATES

### "In Escrow":
- `status === 'paid'` AND (`stripeTransferId` is null/undefined OR `status !== 'completed'`)

### "Protected Transaction":
- `protectedTransactionDaysSnapshot !== null` (has value 7 or 14)
- AND `deliveryConfirmedAt` exists

### "Open Dispute":
- `disputeStatus` in `['open', 'needs_evidence', 'under_review']`

### "Ready to Release":
- `status === 'paid'` (or `'in_transit'` or `'delivered'`)
- AND no open dispute (`disputeStatus === 'none'` or `'cancelled'` or starts with `'resolved'`)
- AND `adminHold !== true`
- AND either:
  - `buyerAcceptedAt` exists, OR
  - Protected window expired (`now >= protectionEndsAt`), OR
  - Not protected (`protectedTransactionDaysSnapshot === null`) AND `disputeDeadlineAt` has passed

## 8. MISSING FUNCTIONALITY

### What Needs to Be Built:
1. **Unified Admin Ops Dashboard** (`/dashboard/admin/ops`) with 4 tabs:
   - Orders in Escrow
   - Protected Transactions
   - Open Disputes
   - Ready to Release

2. **GET `/api/admin/orders`** endpoint:
   - Query parameter: `filter=escrow|protected|disputes|ready_to_release`
   - Server-side filtering using Firestore queries
   - Returns paginated results

3. **Enhance existing pages** or create new unified view

### What Already Exists (Can Be Reused):
- ✅ Admin role checking
- ✅ Payout release endpoint
- ✅ Refund endpoint
- ✅ Dispute resolution endpoint
- ✅ Delivery confirmation endpoint
- ✅ Order fetching functions (need admin version)

## 9. FILES TO CREATE/MODIFY

### New Files:
- `project/app/dashboard/admin/ops/page.tsx` - Unified Admin Ops Dashboard
- `project/app/api/admin/orders/route.ts` - Admin orders API endpoint
- `project/lib/firebase/orders.ts` - Add `getOrdersForAdmin()` function

### Modified Files:
- `project/app/dashboard/layout.tsx` - Add "Admin Ops" nav item (or replace existing admin pages with unified view)
