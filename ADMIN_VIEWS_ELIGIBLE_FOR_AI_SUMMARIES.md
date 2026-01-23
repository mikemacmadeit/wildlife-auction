# ADMIN VIEWS ELIGIBLE FOR AI SUMMARIES

## Overview
This document identifies all admin-only screens where admins view detailed entity information that would benefit from AI-assisted summaries.

## Admin-Only Screens Identified

### 1. User Dossier Page
**Path:** `app/dashboard/admin/users/[uid]/page.tsx`
**API Endpoint:** `GET /api/admin/users/[userId]/dossier`
**Entity Type:** User
**Data Sources:**
- Firebase Auth user record (`authUser`)
- Firestore user document (`users/{uid}`)
- User summary document (`userSummaries/{uid}`)
- Admin notes (`adminUserNotes/{uid}/notes`)
- Audit logs (`auditLogs` filtered by `targetUserId`)

**Complexity:** High - Combines auth data, profile data, summary stats, notes, and audit trail
**Summary Value:** Very High - Helps admins quickly understand user history, risk factors, and patterns

---

### 2. Approve Listings Page
**Path:** `app/dashboard/admin/listings/page.tsx`
**Data Source:** Direct Firestore query (`listings` collection)
**Entity Type:** Listing
**Data Sources:**
- Listing document (`listings/{listingId}`)
- Seller profile (`users/{sellerId}`)
- Listing documents (`listings/{listingId}/documents`)

**Complexity:** High - Includes listing details, compliance status, seller verification, documents
**Summary Value:** High - Helps admins quickly assess listing quality, compliance requirements, and seller trustworthiness

---

### 3. Admin Ops Dashboard
**Path:** `app/dashboard/admin/ops/page.tsx`
**API Endpoint:** `GET /api/admin/orders`
**Entity Type:** Order/Transaction
**Data Sources:**
- Order document (`orders/{orderId}`)
- Listing document (`listings/{listingId}`)
- Buyer profile (`users/{buyerId}`)
- Seller profile (`users/{sellerId}`)

**Complexity:** Very High - Combines order status, payment info, dispute status, protection windows, buyer/seller data
**Summary Value:** Very High - Critical for understanding transaction context, disputes, and payout eligibility

---

### 4. Support Tickets Page
**Path:** `app/dashboard/admin/support/page.tsx`
**API Endpoint:** `GET /api/admin/support/tickets`
**Entity Type:** Support Ticket
**Data Sources:**
- Support ticket document (likely `supportTickets/{ticketId}`)
- Related user (`users/{userId}`)
- Related listing (`listings/{listingId}`) - optional
- Related order (`orders/{orderId}`) - optional

**Complexity:** Medium - Ticket details, user context, related entities
**Summary Value:** Medium - Helps admins understand issue context and urgency

---

### 5. Flagged Messages Page
**Path:** `app/dashboard/admin/messages/page.tsx`
**Entity Type:** Message Thread
**Data Sources:**
- Message thread document
- Related listing
- Buyer/seller profiles

**Complexity:** Medium - Message content, context, related entities
**Summary Value:** Medium - Helps admins understand flagged content context

---

## Server-Side Data Fetching Locations

### User Dossier
- **File:** `app/api/admin/users/[userId]/dossier/route.ts`
- **Method:** GET
- **Returns:** Combined user data (auth, Firestore doc, summary, notes, audits)

### Orders
- **File:** `app/api/admin/orders/route.ts`
- **Method:** GET
- **Returns:** Paginated orders with filtering

### Listings
- **Note:** Currently fetched client-side from Firestore
- **Location:** `app/dashboard/admin/listings/page.tsx` (lines 127-235)

### Support Tickets
- **File:** `app/api/admin/support/tickets/route.ts`
- **Method:** GET
- **Returns:** Support tickets with filtering

---

## Firestore Collections

### Primary Collections
- `users/{uid}` - User documents
- `listings/{listingId}` - Listing documents
- `orders/{orderId}` - Order/transaction documents
- `supportTickets/{ticketId}` - Support ticket documents (assumed)

### Supporting Collections
- `userSummaries/{uid}` - Aggregated user statistics
- `adminUserNotes/{uid}/notes` - Admin notes subcollection
- `auditLogs` - Audit trail
- `listings/{listingId}/documents` - Listing compliance documents
- `orders/{orderId}/documents` - Order documents

---

## Implementation Priority

1. **High Priority:**
   - User Dossier (most complex, most valuable)
   - Admin Ops Orders (critical for transaction management)

2. **Medium Priority:**
   - Approve Listings (helps with review speed)

3. **Lower Priority:**
   - Support Tickets
   - Flagged Messages

---

## Summary Fields to Add

For each entity type, add these optional fields:
- `aiAdminSummary: string | null` - The generated summary text
- `aiAdminSummaryAt: Timestamp | null` - When summary was generated
- `aiAdminSummaryModel: string | null` - OpenAI model used (e.g., "gpt-4o-mini")

These fields should:
- Be admin-only (never exposed to users)
- Not affect any business logic
- Be optional (missing = no summary shown)
- Be cacheable (regenerate only when data changes materially)
