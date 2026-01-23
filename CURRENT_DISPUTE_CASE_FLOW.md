# CURRENT DISPUTE / CASE FLOW

## Overview
This document identifies where disputes, cases, and support issues are stored, what data exists, which admin views display them, and how admins currently resolve them.

## 1. DISPUTE STORAGE & DATA STRUCTURE

### Primary Location: Orders Collection
**Collection:** `orders/{orderId}`
**File References:**
- `lib/types.ts` (lines 720-732) - Type definitions
- `lib/firebase/orders.ts` (lines 81-90) - Firestore schema
- `STATE_OF_THE_APP_REPORT.md` (lines 299-306) - Schema documentation

### Dispute Fields on Order Documents

**Status Fields:**
- `disputeStatus?: DisputeStatus` - Current dispute status
  - Values: `'none' | 'open' | 'needs_evidence' | 'under_review' | 'resolved_refund' | 'resolved_partial_refund' | 'resolved_release' | 'cancelled'`
- `protectedDisputeStatus?: DisputeStatus` - Legacy/alternate field (prefer `disputeStatus`)

**Reason Fields:**
- `disputeReasonV2?: DisputeReason` - Protected transaction dispute reason (enum-based)
  - Values: `'death' | 'serious_illness' | 'injury' | 'escape' | 'wrong_animal'`
- `disputeReason?: string` - Legacy string-based reason field
- `disputeNotes?: string` - Additional dispute details/notes

**Timeline Fields:**
- `disputeOpenedAt?: Date` - When buyer opened dispute
- `disputedAt?: Date` - Legacy timestamp field

**Evidence Fields:**
- `disputeEvidence?: DisputeEvidence[]` - Array of evidence items
  ```typescript
  {
    type: 'photo' | 'video' | 'vet_report' | 'delivery_doc' | 'tag_microchip';
    url: string;
    uploadedAt: Date;
  }
  ```

**Resolution Fields:**
- `adminNotes?: string` - Admin notes added during resolution
- `refundedBy?: string` - Admin UID who processed refund
- `refundedAt?: Date` - When refund was processed
- `refundReason?: string` - Reason for refund
- `releasedBy?: string` - Admin UID who released payout
- `releasedAt?: Date` - When payout was released

**Related Fields:**
- `payoutHoldReason?: PayoutHoldReason` - Why payout is held (includes `'dispute_open'`)
- `buyerId: string` - Buyer involved in dispute
- `sellerId: string` - Seller involved in dispute
- `listingId: string` - Listing related to dispute
- `amount: number` - Order amount
- `timeline?: OrderTimelineEvent[]` - Transaction timeline events

---

## 2. SUPPORT TICKETS / CASES

### Primary Location: Support Tickets Collection
**Collection:** `supportTickets/{ticketId}`
**File References:**
- `app/api/admin/support/tickets/route.ts` - API endpoint
- `app/dashboard/admin/support/page.tsx` - Admin UI

### Support Ticket Fields

**Basic Fields:**
- `ticketId: string` - Document ID
- `status: 'open' | 'resolved'` - Ticket status
- `source: string` - Source (e.g., 'contact_form')
- `name: string` - Submitter name
- `email: string` - Submitter email
- `subject: string` - Ticket subject
- `message: string` - Full message content
- `messagePreview: string` - Truncated preview (240 chars)

**Related Entity References:**
- `userId: string | null` - Related user ID (if any)
- `listingId: string | null` - Related listing ID (if any)
- `orderId: string | null` - Related order ID (if any)

**Timestamps:**
- `createdAt: Date` - When ticket was created
- `updatedAt: Date` - When ticket was last updated

---

## 3. ADMIN VIEWS DISPLAYING DISPUTES

### A. Admin Ops Dashboard - Disputes Tab
**File:** `app/dashboard/admin/ops/page.tsx`
**Location:** Lines 974-1000 (Disputes tab), 1794-1843 (DisputeCard component)
**Route:** `/dashboard/admin/ops` (tab: `disputes`)

**What It Shows:**
- Order ID (last 8 chars)
- Status badge
- Listing title
- Buyer/Seller names and emails
- Amount
- Dispute reason (`disputeReasonV2`)
- Dispute opened date (`disputeOpenedAt`)
- Evidence count (`disputeEvidence.length`)

**Actions Available:**
- "View Evidence" - Opens order detail dialog
- "Resolve" - Opens dispute resolution dialog

**Data Source:**
- Fetches orders via `GET /api/admin/orders?filter=disputes`
- Filters orders where `disputeStatus` in `['open', 'needs_evidence', 'under_review']`

---

### B. Admin Ops Dashboard - Order Detail Dialog
**File:** `app/dashboard/admin/ops/page.tsx`
**Location:** Lines 1324-1600 (Order Detail Dialog)
**Route:** `/dashboard/admin/ops` (click "View" on any order)

**What It Shows:**
- Complete order information
- Transaction timeline (`TransactionTimeline` component)
- Payout hold information
- Dispute status and evidence
- All order fields including dispute-related fields

**Actions Available:**
- View full order details
- Release payout
- Process refund
- Resolve dispute (if applicable)

---

### C. Protected Transactions Page
**File:** `app/dashboard/admin/protected-transactions/page.tsx`
**Location:** Lines 243-291 (handleResolveDispute function)
**Route:** `/dashboard/admin/protected-transactions`

**What It Shows:**
- Protected transactions with disputes
- Dispute resolution dialog with options:
  - Resolution type: `'release' | 'refund' | 'partial_refund'`
  - Refund amount (for partial)
  - Mark fraudulent checkbox
  - Admin notes

**Actions Available:**
- Resolve dispute with resolution type
- Add admin notes
- Mark as fraudulent (affects buyer abuse tracking)

---

## 4. DISPUTE RESOLUTION FLOW

### Resolution Endpoint
**File:** `app/api/orders/[orderId]/disputes/resolve/route.ts`
**Route:** `POST /api/orders/[orderId]/disputes/resolve`
**Access:** Admin-only (requires admin role verification)

**Request Body:**
```typescript
{
  resolution: 'release' | 'refund' | 'partial_refund';
  refundAmount?: number; // Required for partial_refund
  refundReason?: string;
  markFraudulent?: boolean;
  adminNotes?: string;
}
```

**Resolution Logic:**

1. **Release (`resolution: 'release'`):**
   - Checks payout safety blocks
   - Validates TPWD transfer approval (for whitetail breeder orders)
   - Creates Stripe transfer to seller
   - Updates order:
     - `disputeStatus = 'resolved_release'`
     - `status = 'completed'`
     - `stripeTransferId = transfer.id`
     - `releasedBy = adminId`
     - `releasedAt = now`
     - `payoutHoldReason = 'none'`

2. **Refund (`resolution: 'refund'`):**
   - Creates Stripe refund (full amount)
   - Updates order:
     - `disputeStatus = 'resolved_refund'`
     - `status = 'refunded'`
     - `stripeRefundId = refund.id`
     - `refundedBy = adminId`
     - `refundedAt = now`
     - `refundReason = 'Dispute resolved - full refund'`
     - `payoutHoldReason = 'none'`

3. **Partial Refund (`resolution: 'partial_refund'`):**
   - Validates refund amount < order amount
   - Creates Stripe refund (partial amount)
   - Updates order:
     - `disputeStatus = 'resolved_partial_refund'`
     - `status = 'completed'` (order remains active)
     - `stripeRefundId = refund.id`
     - `refundedBy = adminId`
     - `refundedAt = now`
     - `refundReason = 'Dispute resolved - partial refund'`
     - `payoutHoldReason = 'none'`

**Additional Actions:**
- If `markFraudulent === true`: Updates buyer abuse tracking
- Creates audit log entry
- Sends email notifications

---

## 5. DISPUTE OPENING FLOW

### Open Dispute Endpoint
**File:** `app/api/orders/[orderId]/disputes/open/route.ts`
**Route:** `POST /api/orders/[orderId]/disputes/open`
**Access:** Buyer-only (must be order buyer)

**Request Body:**
```typescript
{
  reason: 'death' | 'serious_illness' | 'injury' | 'escape' | 'wrong_animal';
  evidence: Array<{
    type: 'photo' | 'video' | 'vet_report' | 'delivery_doc' | 'tag_microchip';
    url: string;
  }>;
  notes?: string;
}
```

**Opening Logic:**
- Validates buyer is order buyer
- Validates order is in protected transaction
- Validates dispute deadline (72 hours for injury/escape)
- Validates evidence requirements:
  - At least one photo or video required
  - Vet report required for death/serious_illness (can be uploaded later)
- Sets `disputeStatus` to `'needs_evidence'` or `'open'`
- Updates order with dispute fields
- Sets `payoutHoldReason = 'dispute_open'`
- Increments buyer claims count
- Creates audit log

---

## 6. SUPPORT TICKET RESOLUTION

### Support Ticket Endpoints
**File:** `app/api/admin/support/tickets/[ticketId]/status/route.ts`
**Route:** `POST /api/admin/support/tickets/[ticketId]/status`
**Access:** Admin-only

**Request Body:**
```typescript
{
  status: 'open' | 'resolved';
}
```

**Resolution Logic:**
- Updates ticket status
- Updates `updatedAt` timestamp
- No automated actions (manual admin resolution)

---

## 7. DATA AVAILABLE FOR AI SUMMARIES

### For Order Disputes:
- **Order Context:**
  - Order ID, amount, status
  - Buyer ID, seller ID, listing ID
  - Order timeline events
  - Payment information (Stripe IDs)
  
- **Dispute Context:**
  - Dispute reason (`disputeReasonV2`)
  - Dispute status (`disputeStatus`)
  - Dispute notes (`disputeNotes`)
  - Dispute opened timestamp (`disputeOpenedAt`)
  - Evidence array with types and URLs (`disputeEvidence`)
  
- **Resolution Context (if resolved):**
  - Resolution type
  - Admin notes
  - Refund/release information
  - Timestamps

### For Support Tickets:
- **Ticket Context:**
  - Subject, message, source
  - Submitter name, email
  - Related user/listing/order IDs
  - Created/updated timestamps
  - Status

---

## 8. ASSUMPTIONS

1. **Disputes are stored on order documents** - Not in a separate collection
2. **Support tickets are separate** - Stored in `supportTickets` collection
3. **Dispute evidence URLs are accessible** - Stored in Firebase Storage
4. **Timeline events exist** - Order documents may have `timeline` array
5. **Admin resolution is manual** - No automated dispute resolution
6. **Disputes can be cancelled** - Buyers can cancel disputes
7. **Multiple evidence types** - Photos, videos, vet reports, documents, tags

---

## 9. FILE PATHS SUMMARY

### Dispute-Related Files:
- `lib/types.ts` - Type definitions (DisputeStatus, DisputeReason, DisputeEvidence)
- `lib/firebase/orders.ts` - Order document schema
- `app/api/orders/[orderId]/disputes/open/route.ts` - Open dispute endpoint
- `app/api/orders/[orderId]/disputes/resolve/route.ts` - Resolve dispute endpoint
- `app/dashboard/admin/ops/page.tsx` - Admin Ops dashboard (disputes tab)
- `app/dashboard/admin/protected-transactions/page.tsx` - Protected transactions page
- `lib/orders/getOrderIssueState.ts` - Dispute status normalization

### Support Ticket Files:
- `app/api/admin/support/tickets/route.ts` - List tickets endpoint
- `app/api/admin/support/tickets/[ticketId]/status/route.ts` - Update ticket status
- `app/dashboard/admin/support/page.tsx` - Admin support inbox UI

---

## 10. NEXT STEPS FOR AI IMPLEMENTATION

1. Add AI summary fields to `Order` type (dispute summaries)
2. Add AI summary fields to support ticket schema (if implementing for tickets)
3. Create AI dispute summary generation function
4. Create API endpoint for generating dispute summaries
5. Integrate AI summary component into:
   - Admin Ops order detail dialog (for disputes)
   - Dispute resolution dialogs
   - Support ticket detail view (if implementing)
