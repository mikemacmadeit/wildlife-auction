# WILDLIFE EXCHANGE – STATE OF THE APP REPORT

**Generated:** 2025-01-27  
**Auditor:** Senior Staff Engineer + Product Auditor  
**Purpose:** Production Launch Readiness Assessment

---

## 0) Executive Summary

### What This App Is Today (One Paragraph)
Wildlife Exchange is a Texas-focused marketplace for wildlife/exotics, cattle/livestock, and ranch equipment. It's a Next.js 14.2.5 application using Firebase (Auth + Firestore) for backend, Stripe for payments, and Resend for email notifications. The platform supports three listing types (auction, fixed-price, classified), implements a payout-hold workflow with protected transactions (7/14-day seller-backed protection), includes in-platform messaging with anti-circumvention safeguards, and provides admin tools for order management, dispute resolution, and payout release. The app uses Stripe Connect for seller payouts, implements role-based access control (admin/super_admin), and includes category-specific listing attributes with migration support for legacy data.

### Top 5 Things That Are Solid
1. **True Escrow Implementation**: Funds are held in platform account (not immediately transferred), with gating rules for release based on buyer acceptance, dispute deadlines, and protection windows. Payout release logic in `project/app/api/stripe/transfers/release/route.ts` is comprehensive and prevents double-releases.
2. **Webhook Security**: Stripe webhook signature verification is properly implemented in `project/app/api/stripe/webhook/route.ts` (lines 88-109), using raw body and `stripe.webhooks.constructEvent()`.
3. **Anti-Circumvention Protections**: Message sanitization (`project/lib/safety/sanitizeMessage.ts`), contact masking until payment, payment enforcement (no manual "mark as sold" without transaction), and reputation tracking tied to on-platform completions.
4. **Admin Operations Dashboard**: Unified Admin Ops page (`project/app/dashboard/admin/ops/page.tsx`) with tabs for payout holds (legacy filter key: `escrow`), protected transactions, disputes, and ready-to-release orders. Server-side filtering via `project/app/api/admin/orders/route.ts`.
5. **Type Safety & Validation**: Comprehensive Zod schemas (`project/lib/validation/api-schemas.ts`), TypeScript types (`project/lib/types.ts`), and single source of truth for pricing (`project/lib/pricing/plans.ts`).

### Top 5 Biggest Risks / Blockers for Production
1. **No Automated Background Jobs**: Auto-release of protected transactions requires manual admin action. No cron/scheduled job system to automatically release funds when protection windows expire. Risk: Funds stuck in payout hold, poor seller experience.
2. **In-Memory Rate Limiting**: Rate limiting (`project/lib/rate-limit.ts`) uses in-memory store that resets on server restart. No Redis/persistent store. Risk: Rate limits don't persist across deployments, vulnerable to distributed attacks.
3. **No Audit Logging**: No centralized audit log for admin actions (payout releases, refunds, dispute resolutions). Risk: Compliance issues, inability to trace who did what and when.
4. **No Automated Auction Winner Notification**: When auctions end, winning bidders are not automatically notified. UI shows "You won" badge (`project/app/listing/[id]/page.tsx` line 86-87 checks `isWinningBidder`), but no email/notification sent. Risk: Lost sales, poor UX.
5. **Missing Firestore Indexes**: Some queries may require composite indexes not yet defined. Admin orders query (`project/app/api/admin/orders/route.ts`) does client-side filtering for `ready_to_release`, which won't scale. Risk: Query failures at scale, performance degradation.

### What to Do Next (Top 10 Priorities)
1. **P0: Implement Automated Background Jobs** - Set up cron/scheduled function to auto-release protected transactions when `protectionEndsAt` passes. Use Netlify Functions cron or external scheduler.
2. **P0: Add Audit Logging** - Create `auditLogs` Firestore collection, log all admin actions (payout releases, refunds, dispute resolutions) with timestamp, user ID, action type, order ID, before/after state.
3. **P0: Auction Winner Email Notification** - Add email notification in webhook handler when auction ends, or create scheduled job to check ended auctions and notify winners.
4. **P0: Persistent Rate Limiting** - Migrate to Redis-based rate limiting (Upstash Redis on Netlify) or use Netlify's built-in rate limiting.
5. **P1: Add Firestore Composite Indexes** - Review all queries, add missing composite indexes for category+status, disputeStatus+createdAt, etc.
6. **P1: Implement Idempotency Keys** - Add idempotency keys to payout release and refund endpoints to prevent double-processing on retries.
7. **P1: Add Stripe Reconciliation** - Create admin tool to reconcile Stripe charges/transfers with Firestore orders, detect discrepancies.
8. **P1: Error Monitoring Integration** - Complete Sentry setup (`project/lib/monitoring/sentry.ts` exists but needs initialization), add error boundaries.
9. **P2: Automated Backups** - Set up automated Firestore exports (daily) to GCS or S3 for disaster recovery.
10. **P2: Performance Optimization** - Add pagination to all list queries, implement caching for frequently accessed data (seller profiles, listing counts).

---

## 1) Repo / Architecture Overview

### Frameworks Used
- **Next.js**: Version 14.2.5 (confirmed in `project/package.json` line 63)
- **React**: 18.2.0
- **TypeScript**: 5.2.2
- **Firebase**: Client SDK 12.7.0, Admin SDK 13.6.0
- **Stripe**: 20.1.2
- **Resend**: 6.7.0 (email notifications)
- **Zod**: 3.23.8 (validation)
- **Tailwind CSS**: 3.3.3
- **Deployment**: Netlify (confirmed by `project/netlify.toml`)

### Folder Structure Map
```
project/
├── app/                          # Next.js App Router
│   ├── api/                     # API routes (Next.js API routes)
│   │   ├── admin/               # Admin-only endpoints
│   │   ├── messages/            # Messaging endpoints
│   │   ├── orders/               # Order management endpoints
│   │   └── stripe/               # Stripe webhooks, checkout, transfers, refunds
│   ├── browse/                  # Category browse pages
│   ├── dashboard/                # User dashboard (buyer/seller/admin)
│   │   ├── admin/                # Admin-only pages
│   │   ├── listings/             # User's listings
│   │   ├── messages/             # User's messages
│   │   ├── orders/               # User's orders
│   │   └── watchlist/            # User's watchlist
│   ├── listing/[id]/            # Listing detail page
│   ├── pricing/                  # Pricing page
│   ├── seller/                   # Seller-specific pages
│   └── page.tsx                  # Home page
├── components/                   # React components
│   ├── auction/                  # Auction-specific components
│   ├── forms/                    # Form components
│   ├── listings/                 # Listing display components
│   ├── messaging/                # Messaging UI
│   └── ui/                       # shadcn/ui components
├── lib/                          # Core libraries
│   ├── email/                    # Email templates and sender (Resend)
│   ├── firebase/                 # Firebase client/admin utilities
│   ├── monitoring/               # Error monitoring (Sentry template)
│   ├── pricing/                  # Pricing tier configuration
│   ├── safety/                   # Message sanitization
│   ├── stripe/                   # Stripe API client functions
│   ├── types.ts                  # TypeScript type definitions
│   ├── utils.ts                  # Utility functions
│   └── validation/               # Zod validation schemas
├── hooks/                        # React hooks
├── scripts/                      # Utility scripts (set-admin-role, etc.)
├── firestore.rules              # Firestore security rules
├── firestore.indexes.json        # Firestore composite indexes
└── package.json                  # Dependencies
```

### Runtime Model
- **Client-Side**: React components, Firebase client SDK for real-time subscriptions, client-side filtering/sorting
- **Server-Side**: Next.js API routes (`app/api/*`), Firebase Admin SDK for server-side operations, Stripe API calls
- **API Routes**: All under `app/api/`, use Firebase Admin SDK, include rate limiting middleware, Zod validation
- **Real-Time**: Firestore `onSnapshot` subscriptions for listings, bids, messages (client-side)

### Environment Variables Required
**Firebase:**
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_PROJECT_ID` (server-side)
- `FIREBASE_CLIENT_EMAIL` (server-side)
- `FIREBASE_PRIVATE_KEY` (server-side)

**Stripe:**
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

**Email:**
- `RESEND_API_KEY`

**App:**
- `NEXT_PUBLIC_APP_URL` (or `VERCEL_URL` for Netlify)
- `ESCROW_DISPUTE_WINDOW_HOURS` (defaults to 72)

### Where Config Lives
- **Firebase Client Config**: `project/lib/firebase/config.ts`
- **Firebase Admin Config**: Initialized in each API route (see `project/lib/firebase/admin.ts` pattern, but actual init is inline in routes)
- **Stripe Config**: `project/lib/stripe/config.ts`
- **Email Config**: `project/lib/email/config.ts`
- **Pricing Config**: `project/lib/pricing/plans.ts` (single source of truth)

---

## 2) Firestore Data Model

### Collection: `users/{uid}`

**Document Schema:**
```typescript
{
  email: string;
  displayName?: string;
  profile?: {
    fullName?: string;
    phone?: string;
    // ... other profile fields
  };
  role?: 'user' | 'admin' | 'super_admin';  // RBAC
  subscriptionPlan?: 'free' | 'pro' | 'elite';  // Seller pricing tier
  stripeAccountId?: string;  // Stripe Connect account ID
  stripeAccountStatus?: 'pending' | 'restricted' | 'enabled';
  // Seller stats
  completedSalesCount?: number;
  completionRate?: number;
  verifiedTransactionsCount?: number;
  // Buyer abuse tracking
  buyerClaimsCount?: number;
  buyerConfirmedFraudCount?: number;
  buyerProtectionEligible?: boolean;
  buyerRiskScore?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Relationships:**
- One-to-many with `listings` (via `sellerId`)
- One-to-many with `orders` (via `buyerId` or `sellerId`)
- One-to-many with `messageThreads` (via `buyerId` or `sellerId`)

**Who Writes/Reads:**
- **Writes**: `project/lib/firebase/users.ts` (create/update profile), `project/app/api/stripe/webhook/route.ts` (update Stripe status), `project/app/api/stripe/connect/create-account/route.ts` (set `stripeAccountId`), admin scripts
- **Reads**: All pages/components that display user info, admin dashboards

**Indexes:**
- Composite index likely needed: `role` + `createdAt` (for admin user queries)

---

### Collection: `listings/{listingId}`

**Document Schema:**
```typescript
{
  title: string;
  description: string;
  type: 'auction' | 'fixed' | 'classified';
  category: 'wildlife_exotics' | 'cattle_livestock' | 'ranch_equipment';  // Required
  subcategory?: string;  // Optional
  attributes: Record<string, any>;  // Category-specific attributes (WildlifeAttributes | CattleAttributes | EquipmentAttributes)
  status: 'draft' | 'pending' | 'active' | 'sold' | 'expired' | 'removed';
  price?: number;  // Fixed price
  startingBid?: number;  // Auction starting bid
  currentBid?: number;  // Current highest bid
  reservePrice?: number;  // Auction reserve
  images: string[];
  location: {
    city: string;
    state: string;
    zip?: string;
  };
  sellerId: string;  // Reference to users/{uid}
  sellerSnapshot?: {  // Denormalized seller info
    displayName?: string;
    // ... other seller fields
  };
  trust: {
    verified: boolean;
    insuranceAvailable: boolean;
    transportReady: boolean;
  };
  endsAt?: Timestamp;  // Auction end time
  featured?: boolean;
  featuredUntil?: Timestamp;
  metrics: {
    views: number;
    favorites: number;
    bidCount: number;
  };
  // Protected Transaction fields
  protectedTransactionEnabled?: boolean;
  protectedTransactionDays?: 7 | 14 | null;
  protectedTransactionBadge?: 'PROTECTED_7' | 'PROTECTED_14' | null;
  protectedTermsVersion?: string;
  protectedEnabledAt?: Timestamp;
  // Legacy fields (for backward compatibility)
  metadata?: {
    quantity?: number;
    breed?: string;
    // ... other legacy fields
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy?: string;
  updatedBy?: string;
  publishedAt?: Timestamp;  // When admin approved
}
```

**Relationships:**
- Many-to-one with `users` (via `sellerId`)
- One-to-many with `bids` (via `listingId`)
- One-to-many with `orders` (via `listingId`)
- One-to-many with `messageThreads` (via `listingId`)

**Who Writes/Reads:**
- **Writes**: `project/lib/firebase/listings.ts` (create/update), `project/app/api/stripe/webhook/route.ts` (mark as sold), `project/app/dashboard/admin/listings/page.tsx` (approve/reject), `project/lib/firebase/bids.ts` (update `currentBid`)
- **Reads**: Browse pages, listing detail page, seller dashboard, admin dashboard

**Indexes:**
- Composite indexes defined in `firestore.indexes.json`:
  - `category` + `status` + `createdAt`
  - `category` + `listingType` + `createdAt`
  - `status` + `createdAt` (for admin approval queries)
  - `sellerId` + `status` + `createdAt` (for seller dashboard)

**Migration Notes:**
- `migrateAttributes()` function in `project/lib/firebase/listings.ts` handles backward compatibility for old listings without `attributes` field
- Defaults `category` to `'wildlife_exotics'` if missing

---

### Collection: `orders/{orderId}`

**Document Schema:**
```typescript
{
  listingId: string;  // Reference to listings/{listingId}
  buyerId: string;  // Reference to users/{uid}
  sellerId: string;  // Reference to users/{uid}
  amount: number;  // Total amount in dollars (not cents)
  platformFee: number;  // Platform fee in dollars
  sellerAmount: number;  // Amount seller receives in dollars
  status: 'pending' | 'paid' | 'in_transit' | 'delivered' | 'accepted' | 'disputed' | 'completed' | 'refunded';
  // Stripe fields
  stripePaymentIntentId: string;
  stripeCheckoutSessionId: string;
  stripeTransferId?: string;  // Set when payout released
  stripeRefundId?: string;  // Set when refunded
  // Escrow fields
  paidAt?: Timestamp;
  disputeDeadlineAt?: Timestamp;  // Standard dispute deadline (72 hours default)
  deliveredAt?: Timestamp;
  acceptedAt?: Timestamp;
  disputedAt?: Timestamp;
  disputeReason?: string;  // Legacy field
  disputeNotes?: string;  // Legacy field
  deliveryProofUrls?: string[];
  adminHold?: boolean;  // Admin flag to prevent auto-release
  lastUpdatedByRole?: 'buyer' | 'seller' | 'admin';
  // Protected Transaction fields
  deliveryConfirmedAt?: Timestamp;  // Admin confirms delivery
  protectionStartAt?: Timestamp;
  protectionEndsAt?: Timestamp;  // When protection window ends
  buyerAcceptedAt?: Timestamp;  // Buyer accepts early
  disputeOpenedAt?: Timestamp;
  disputeReasonV2?: 'death' | 'serious_illness' | 'injury' | 'escape' | 'wrong_animal' | null;
  disputeStatus?: 'none' | 'open' | 'needs_evidence' | 'under_review' | 'resolved_refund' | 'resolved_partial_refund' | 'resolved_release' | 'cancelled';
  disputeEvidence?: Array<{
    type: 'photo' | 'video' | 'vet_report' | 'delivery_doc' | 'tag_microchip';
    url: string;
    uploadedAt: Timestamp;
  }>;
  payoutHoldReason?: 'none' | 'protection_window' | 'dispute_open' | 'admin_hold';
  protectedTransactionDaysSnapshot?: 7 | 14 | null;  // Snapshot from listing at order creation
  protectedTermsVersion?: string;
  // Refund fields
  refundedBy?: string;
  refundedAt?: Timestamp;
  refundReason?: string;
  refundAmount?: number;  // For partial refunds
  isFullRefund?: boolean;
  // Release fields
  releasedBy?: string;
  releasedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Relationships:**
- Many-to-one with `listings` (via `listingId`)
- Many-to-one with `users` (via `buyerId` and `sellerId`)

**Who Writes/Reads:**
- **Writes**: `project/app/api/stripe/webhook/route.ts` (create on `checkout.session.completed`), `project/app/api/orders/[orderId]/accept/route.ts` (buyer accepts), `project/app/api/orders/[orderId]/dispute/route.ts` (buyer disputes), `project/app/api/orders/[orderId]/mark-delivered/route.ts` (seller marks delivered), `project/app/api/stripe/transfers/release/route.ts` (admin releases payout), `project/app/api/stripe/refunds/process/route.ts` (admin processes refund), `project/app/api/orders/[orderId]/confirm-delivery/route.ts` (admin confirms delivery)
- **Reads**: Buyer orders page, seller dashboard, admin ops dashboard, order detail pages

**Indexes:**
- Composite indexes defined in `firestore.indexes.json`:
  - `buyerId` + `status` + `createdAt`
  - `sellerId` + `status` + `createdAt`
  - `status` + `createdAt` (for admin queries)
  - `disputeStatus` + `createdAt` (for disputes tab)
  - `protectedTransactionDaysSnapshot` + `deliveryConfirmedAt` (for protected transactions tab)
- **MISSING**: Index for `ready_to_release` filter (complex query with multiple conditions)

---

### Collection: `bids/{bidId}`

**Document Schema:**
```typescript
{
  listingId: string;  // Reference to listings/{listingId}
  bidderId: string;  // Reference to users/{uid}
  amount: number;  // Bid amount in dollars
  createdAt: Timestamp;
}
```

**Relationships:**
- Many-to-one with `listings` (via `listingId`)
- Many-to-one with `users` (via `bidderId`)

**Who Writes/Reads:**
- **Writes**: `project/lib/firebase/bids.ts` (`placeBidTx()` uses Firestore transaction)
- **Reads**: Listing detail page (bid history), `getWinningBidder()` function

**Indexes:**
- Composite index: `listingId` + `amount` + `createdAt` (for bid history and winning bidder queries)

---

### Collection: `messageThreads/{threadId}`

**Document Schema:**
```typescript
{
  listingId: string;  // Reference to listings/{listingId}
  buyerId: string;  // Reference to users/{uid}
  sellerId: string;  // Reference to users/{uid}
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessageAt?: Timestamp;
  lastMessagePreview?: string;
  buyerUnreadCount: number;
  sellerUnreadCount: number;
  flagged: boolean;  // Flagged for admin review
  violationCount: number;  // Total violations detected
  archived: boolean;
}
```

**Relationships:**
- Many-to-one with `listings` (via `listingId`)
- Many-to-one with `users` (via `buyerId` and `sellerId`)
- One-to-many with `messages` (subcollection)

**Who Writes/Reads:**
- **Writes**: `project/lib/firebase/messages.ts` (`getOrCreateThread()`, `sendMessage()`, `flagThread()`)
- **Reads**: Messaging pages, admin flagged messages page

**Indexes:**
- Composite index: `buyerId` + `updatedAt` (for buyer's threads)
- Composite index: `sellerId` + `updatedAt` (for seller's threads)
- Index: `flagged` + `updatedAt` (for admin flagged messages)

---

### Subcollection: `messageThreads/{threadId}/messages/{messageId}`

**Document Schema:**
```typescript
{
  threadId: string;
  senderId: string;  // Reference to users/{uid}
  recipientId: string;  // Reference to users/{uid}
  listingId: string;
  body: string;  // Sanitized message text
  createdAt: Timestamp;
  readAt?: Timestamp;
  wasRedacted: boolean;  // Whether message was sanitized
  violationCount: number;  // Violations in this message
  detectedViolations?: string[];  // Types of violations detected
  flagged: boolean;  // Whether this message was flagged
}
```

**Relationships:**
- Many-to-one with `messageThreads` (via `threadId`)
- Many-to-one with `users` (via `senderId` and `recipientId`)

**Who Writes/Reads:**
- **Writes**: `project/lib/firebase/messages.ts` (`sendMessage()`), `project/app/api/messages/send/route.ts` (server-side sanitization)
- **Reads**: Messaging UI components, admin flagged messages page

**Indexes:**
- Index: `threadId` + `createdAt` (for thread messages)

---

### Firestore Security Rules Summary

**Rules File:** `project/firestore.rules`

**Key Rules:**
1. **Users**: Users can read/write their own profile. Admins can read all profiles.
2. **Listings**: 
   - Read: Authenticated users can read active listings. Sellers can read their own listings.
   - Write: Sellers can create/update their own listings. Admins can update any listing (for approval).
3. **Orders**:
   - Read: Buyer, seller, or admin can read order.
   - Create: Only buyer can create order (via checkout).
   - Update: Buyer can accept/dispute, seller can mark delivered, admin can update any field.
4. **Bids**: Authenticated users can read bids for a listing. Only authenticated users can create bids (via transaction).
5. **MessageThreads/Messages**: Participants can read/write their own threads/messages. Admins can read flagged threads.

**Security Holes Identified:**
- **NOT FOUND**: No explicit rule preventing users from reading other users' bids (only listing-level read). This is likely intentional for transparency, but worth reviewing.
- **NOT FOUND**: No rate limiting in Firestore rules (relies on API route rate limiting).
- **NOT FOUND**: No validation that `sellerId` in order matches listing's `sellerId` (relies on application logic).

**Migration/Backward Compatibility:**
- `migrateAttributes()` in `project/lib/firebase/listings.ts` handles old listings without `attributes` field
- Default `category` to `'wildlife_exotics'` for old listings
- Legacy `metadata` field kept for backward compatibility

---

## 3) Features Inventory

### A) Seller Features

#### Listing Creation/Editing
- **Status**: ✅ Complete
- **Location**: `project/app/dashboard/listings/new/page.tsx`, `project/lib/firebase/listings.ts`
- **Features**:
  - Category-first creation flow (3 categories: wildlife_exotics, cattle_livestock, ranch_equipment)
  - Category-specific attribute forms
  - Three listing types: auction, fixed-price, classified
  - Image upload
  - Location selection
  - Protected Transaction toggle (7/14 days)
  - Draft saving
- **Missing**: Image optimization/compression, bulk image upload

#### Listing Types
- **Status**: ✅ Complete
- **Auction**: Bidding system with real-time updates, reserve price, countdown timer
- **Fixed Price**: Immediate checkout
- **Classified**: Contact seller (messaging)

#### Seller Dashboard Features
- **Status**: ✅ Complete
- **Location**: `project/app/seller/listings/page.tsx`, `project/app/seller/settings/page.tsx`
- **Features**:
  - View all listings (draft, pending, active, sold)
  - Edit/delete listings
  - View earnings/payouts
  - Stripe Connect onboarding
  - Subscription plan management
- **Missing**: Analytics dashboard (views, favorites, conversion rates)

#### Verification, Badges, Tiers
- **Status**: ✅ Complete
- **Location**: `project/lib/pricing/plans.ts`
- **Features**:
  - Three pricing tiers: FREE ($0, 7% fee, 3 listings), PRO ($49, 6% fee, 10 listings), ELITE ($199, 4% fee, unlimited)
  - Listing limit enforcement
  - Platform fee calculation based on plan
- **Missing**: Seller verification badges (verified seller, top seller, etc.)

---

### B) Buyer Features

#### Browse/Search/Filter
- **Status**: ✅ Complete
- **Location**: `project/app/browse/page.tsx`, `project/app/browse/[category]/page.tsx`
- **Features**:
  - Category browse pages (wildlife-exotics, cattle-livestock, ranch-equipment)
  - Category-specific filters (species, breed, equipment type, etc.)
  - Sort by newest, price, ending soon
  - Search by title/description
- **Missing**: Advanced search (price range, location radius, date range), saved searches

#### Watchlist/Saved Searches
- **Status**: ✅ Complete (Watchlist), ❌ Missing (Saved Searches)
- **Location**: `project/app/dashboard/watchlist/page.tsx`
- **Features**:
  - Add/remove listings from watchlist
  - Filter by status (active, ending soon, ended, sold)
  - Sort and bulk actions
  - Export to CSV
  - Real-time updates
- **Missing**: Saved searches with email alerts

#### Checkout/Payment
- **Status**: ✅ Complete
- **Location**: `project/app/api/stripe/checkout/create-session/route.ts`
- **Features**:
  - Stripe Checkout integration
  - Plan-based platform fee calculation
  - Order creation on payment
  - Email confirmation to buyer
- **Missing**: Guest checkout (requires account), payment method saving

#### Order Management
- **Status**: ✅ Complete
- **Location**: `project/app/dashboard/orders/page.tsx`
- **Features**:
  - View all orders
  - Accept order (early release)
  - Open dispute (with evidence)
  - View order details
- **Missing**: Order tracking integration (shipping carriers), delivery confirmation upload

#### Dispute/Issue Raising
- **Status**: ✅ Complete
- **Location**: `project/app/api/orders/[orderId]/disputes/open/route.ts`, `project/app/dashboard/orders/page.tsx`
- **Features**:
  - Open dispute with reason and evidence
  - Evidence requirements (photos, vet reports for death/illness)
  - Dispute status tracking
  - Cancel dispute
- **Missing**: Dispute timeline/history view, buyer-seller communication during dispute

#### Messaging
- **Status**: ✅ Complete
- **Location**: `project/app/dashboard/messages/page.tsx`, `project/components/messaging/MessageThread.tsx`
- **Features**:
  - In-platform messaging between buyer and seller
  - Message sanitization (contact masking until payment)
  - Real-time updates
  - Flag for admin review
- **Missing**: File attachments, read receipts, typing indicators

---

### C) Admin Features

#### Admin Dashboards/Pages
- **Status**: ✅ Complete
- **Location**: `project/app/dashboard/admin/ops/page.tsx`, `project/app/dashboard/admin/listings/page.tsx`, `project/app/dashboard/admin/messages/page.tsx`
- **Features**:
  - Admin Ops Dashboard (4 tabs: Escrow, Protected Transactions, Disputes, Ready to Release)
  - Approve Listings page
  - Flagged Messages page
- **Missing**: Analytics dashboard, user management page

#### Ability to Moderate Listings
- **Status**: ✅ Complete
- **Location**: `project/app/dashboard/admin/listings/page.tsx`
- **Features**:
  - Approve/reject listings
  - Search and filter pending listings
  - View listing details
- **Missing**: Bulk approve/reject, edit listing content, flag inappropriate listings

#### Ability to Release Payouts
- **Status**: ✅ Complete
- **Location**: `project/app/api/stripe/transfers/release/route.ts`, `project/app/dashboard/admin/ops/page.tsx`
- **Features**:
  - Release payout with gating rules (buyer accepted, dispute deadline passed, protection window ended)
  - Prevent double-release
  - Email notification to seller
- **Missing**: Bulk release, scheduled releases, payout reconciliation tool

#### Ability to Process Refunds
- **Status**: ✅ Complete
- **Location**: `project/app/api/stripe/refunds/process/route.ts`, `project/app/dashboard/admin/ops/page.tsx`
- **Features**:
  - Full refund
  - Partial refund
  - Refund reason tracking
- **Missing**: Refund history view, refund analytics

#### Dispute Resolution Tools
- **Status**: ✅ Complete
- **Location**: `project/app/api/orders/[orderId]/disputes/resolve/route.ts`, `project/app/dashboard/admin/ops/page.tsx`
- **Features**:
  - View dispute evidence
  - Resolve dispute (release funds, full refund, partial refund)
  - Mark buyer as fraudulent
  - Admin notes
- **Missing**: Dispute timeline view, communication with buyer/seller during dispute

#### Delivery Confirmation
- **Status**: ✅ Complete
- **Location**: `project/app/api/orders/[orderId]/confirm-delivery/route.ts`
- **Features**:
  - Admin confirms delivery (starts protection window for protected transactions)
  - Email notification to buyer
- **Missing**: Seller upload delivery proof, automatic delivery confirmation (via tracking)

---

## 4) Payments & Escrow (Stripe) – Deep Dive

### Current Money Flow Step-by-Step

1. **Buyer Initiates Checkout**
   - **File**: `project/app/api/stripe/checkout/create-session/route.ts`
   - Buyer clicks "Buy Now" or wins auction
   - API route creates Stripe Checkout Session
   - **CRITICAL**: `payment_intent_data.transfer_data` is **NOT SET** (line 95-96 explicitly omits it)
   - Funds go to **platform account** (not seller account)
   - Checkout session includes metadata: `listingId`, `buyerId`, `sellerId`

2. **Payment Captured**
   - Stripe processes payment
   - Funds held in platform Stripe account

3. **Webhook: `checkout.session.completed`**
   - **File**: `project/app/api/stripe/webhook/route.ts` (lines 119-122, handler at line 178+)
   - Creates `orders/{orderId}` document in Firestore with:
     - `status: 'paid'`
     - `paidAt: now`
     - `disputeDeadlineAt: now + ESCROW_DISPUTE_WINDOW_HOURS` (default 72 hours)
     - `payoutHoldReason: 'protection_window'` (if protected transaction) or `'none'`
     - `protectedTransactionDaysSnapshot` (snapshot from listing)
   - Sends order confirmation email to buyer
   - Marks listing as `'sold'` (if not auction) or updates auction status

4. **Escrow Holding Period**
   - Funds remain in platform account
   - Order status: `'paid'` → `'in_transit'` (seller marks) → `'delivered'` (seller marks) → `'accepted'` (buyer accepts) OR `'disputed'` (buyer disputes)
   - For protected transactions: Admin confirms delivery → `deliveryConfirmedAt` set → protection window starts → `protectionEndsAt` calculated

5. **Payout Release (Manual Admin Action)**
   - **File**: `project/app/api/stripe/transfers/release/route.ts`
   - Admin triggers release from Admin Ops Dashboard
   - **Gating Rules** (lines 178-241):
     - ✅ Always allow if `status == 'accepted'`
     - ✅ Allow if `status` in `['paid', 'in_transit', 'delivered']` AND `disputeDeadlineAt` passed AND NOT disputed AND NOT adminHold
     - ✅ Allow if protected transaction AND `protectionEndsAt` passed AND delivery confirmed
     - ❌ Never allow if `status == 'disputed'` OR `disputeStatus` is open
     - ❌ Never allow if `adminHold == true`
     - ❌ Never allow if already transferred (`stripeTransferId` exists)
   - Creates Stripe Transfer to seller's Connect account
   - Updates order: `stripeTransferId`, `status: 'completed'`, `releasedBy`, `releasedAt`
   - Sends payout notification email to seller

6. **Refund (If Needed)**
   - **File**: `project/app/api/stripe/refunds/process/route.ts`
   - Admin processes refund (full or partial)
   - Creates Stripe Refund
   - Updates order: `stripeRefundId`, `status: 'refunded'` (full) or `'completed'` (partial), `refundedBy`, `refundedAt`

### Confirm: "This IS Escrow"

**YES, this is a payout-hold workflow:**
- Funds are held in platform account (not immediately transferred to seller)
- Release is gated by buyer acceptance, dispute deadlines, or protection windows
- Admin-controlled release (not automatic)
- Prevents double-release (checks `stripeTransferId`)

**However, payout release is manual:**
- No automated release when protection window expires
- Requires admin to manually trigger release
- Risk: Funds can get stuck if admin doesn't act

### Stripe Objects Used

- **Checkout Session** (`stripe.checkout.sessions.create()`): Payment collection
- **Payment Intent** (created by Checkout): Actual payment
- **Transfer** (`stripe.transfers.create()`): Payout to seller's Connect account
- **Refund** (`stripe.refunds.create()`): Refund to buyer
- **Account** (Stripe Connect): Seller's connected account

### Stripe Connect Usage

- **Where Seller Account Stored**: `users/{uid}.stripeAccountId`
- **Onboarding Flow**: 
  - `project/app/api/stripe/connect/create-account/route.ts` creates Express account
  - `project/app/api/stripe/connect/create-account-link/route.ts` creates onboarding link
  - `project/app/api/stripe/connect/check-status/route.ts` checks status
  - Webhook `account.updated` updates status in Firestore

### Webhook Events Handled

**File**: `project/app/api/stripe/webhook/route.ts`

1. **`account.updated`** (lines 113-116): Updates user's `stripeAccountStatus` in Firestore
2. **`checkout.session.completed`** (lines 119-122): Creates order, sets payout-hold fields, sends email

**NOT HANDLED** (but should be):
- `payment_intent.succeeded` (redundant with `checkout.session.completed` but good for idempotency)
- `transfer.created` / `transfer.paid` (to confirm transfer succeeded)
- `refund.created` / `refund.succeeded` (to confirm refund succeeded)
- `charge.dispute.created` (Stripe chargeback/dispute)

### Failure Modes

**Webhook Missing / Retry Behavior:**
- ✅ Webhook signature verification implemented (lines 88-109)
- ❌ No idempotency keys to prevent double-processing
- ❌ No webhook event logging (can't track if webhook was received/processed)

**Double-Processing Protections:**
- ✅ Checks `stripeTransferId` exists before release (prevents double-release)
- ✅ Checks `stripeRefundId` exists before refund (prevents double-refund)
- ❌ No idempotency keys on order creation (webhook could be called twice)

**Partial Refunds Handling:**
- ✅ Supported (`project/app/api/stripe/refunds/process/route.ts` lines 193-211)
- ✅ Stores `refundAmount` in order document
- ✅ Status remains `'completed'` for partial refunds

**Chargebacks/Disputes Handling:**
- ❌ **NOT FOUND**: No handler for Stripe chargeback/dispute events
- ❌ No admin tool to view/manage chargebacks
- Risk: Chargebacks not tracked, funds could be reversed without notification

### Gaps & Risks

1. **Money Stuck**: No automated release when protection window expires → requires manual admin action
2. **Wrong Payouts**: No reconciliation tool to verify Stripe transfers match Firestore orders
3. **Race Conditions**: No idempotency keys → webhook retries could create duplicate orders
4. **Chargebacks**: No chargeback handling → funds could be reversed without tracking
5. **Transfer Failures**: No webhook handler for `transfer.failed` → failed transfers not tracked

---

## 5) Authentication & Authorization

### How Users Authenticate

- **Provider**: Firebase Auth
- **Config**: `project/lib/firebase/config.ts`
- **Methods**: Email/password (assumed, not explicitly found in codebase)
- **Client Hook**: `project/hooks/use-auth.ts` (uses `onAuthStateChanged`)

### How Admin is Determined

- **Method**: Firestore document field (`users/{uid}.role`)
- **Values**: `'user'` | `'admin'` | `'super_admin'`
- **Check Location**: `project/hooks/use-admin.ts` (client-side), server-side checks in API routes
- **NOT USING**: Firebase Auth custom claims (would be more secure for server-side)

### Which Endpoints are Protected

**Server-Side Protected (Firebase Admin SDK token verification):**
- ✅ `project/app/api/admin/orders/route.ts` (admin role check)
- ✅ `project/app/api/stripe/transfers/release/route.ts` (admin role check)
- ✅ `project/app/api/stripe/refunds/process/route.ts` (admin role check)
- ✅ `project/app/api/orders/[orderId]/confirm-delivery/route.ts` (admin role check)
- ✅ `project/app/api/orders/[orderId]/disputes/resolve/route.ts` (admin role check)
- ✅ `project/app/api/orders/[orderId]/admin-hold/route.ts` (admin role check)
- ✅ `project/app/api/messages/send/route.ts` (authenticated user check)
- ✅ `project/app/api/orders/[orderId]/accept/route.ts` (buyer ownership check)
- ✅ `project/app/api/orders/[orderId]/dispute/route.ts` (buyer ownership check)
- ✅ `project/app/api/orders/[orderId]/mark-delivered/route.ts` (seller ownership check)

**Client-Side Only Protection:**
- `project/app/dashboard/admin/*` pages use `useAdmin()` hook (can be bypassed if user manipulates Firestore directly)

### Privilege Escalation Risks

1. **Client-Side Admin Check**: Admin pages check `useAdmin()` hook, but if user manually sets `role: 'admin'` in Firestore, they could access admin UI (though API routes would still block them)
2. **Firestore Rules**: Admin role check in rules uses `get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'` - if user's own document is compromised, they could elevate privileges
3. **No Custom Claims**: Using Firestore document for roles instead of Firebase Auth custom claims means role changes require Firestore write, which could be exploited if rules are misconfigured

**Recommendation**: Migrate to Firebase Auth custom claims for admin roles (set via Admin SDK, verified in API routes via `decodedToken.customClaims.role`)

---

## 6) Operational Readiness (Production Checklist)

### Observability (Logs, Error Tracking)

**Status**: ⚠️ Partial
- **Error Monitoring**: `project/lib/monitoring/sentry.ts` exists but **NOT INITIALIZED** (template only)
- **Logging**: Console.log/console.error throughout (no structured logging)
- **Missing**: 
  - Sentry initialization in `app/layout.tsx` or `app/api/*` routes
  - Structured logging (Winston, Pino)
  - Log aggregation (Datadog, LogRocket)
  - Performance monitoring (Web Vitals)

### Rate Limiting / Abuse Prevention

**Status**: ⚠️ Partial
- **Implementation**: `project/lib/rate-limit.ts` (in-memory store)
- **Limits**: 
  - Default: 60 req/min
  - Stripe: 20 req/min
  - Admin: 10 req/min
  - Checkout: 5 req/min
- **Missing**: 
  - Persistent store (Redis) - resets on server restart
  - Distributed rate limiting (won't work across multiple server instances)
  - IP-based blocking for repeated violations

### Background Jobs / Cron (Auto-Release, Cleanup)

**Status**: ❌ **NOT FOUND**
- **Missing**: 
  - Automated release of protected transactions when `protectionEndsAt` passes
  - Automated release after dispute deadline when `disputeDeadlineAt` passes (optional)
  - Cleanup of expired listings (mark as `'expired'`)
  - Auction end processing (notify winners, create orders)
- **Recommendation**: Use Netlify Functions with cron trigger, or external scheduler (EasyCron, cron-job.org)

### Data Backups / Export Strategy

**Status**: ❌ **NOT FOUND**
- **Missing**: 
  - Automated Firestore exports (daily/weekly)
  - Backup to GCS or S3
  - Disaster recovery plan
  - Data retention policy

### Disaster Recovery / Rollback

**Status**: ❌ **NOT FOUND**
- **Missing**: 
  - Database backup restoration procedure
  - Code rollback procedure (Netlify deployments)
  - Stripe data reconciliation after rollback

### Stripe Reconciliation

**Status**: ❌ **NOT FOUND**
- **Missing**: 
  - Admin tool to compare Stripe charges/transfers/refunds with Firestore orders
  - Detection of discrepancies (missing orders, extra charges, failed transfers)
  - Daily reconciliation report

### Support Tooling (Admin Ops, Manual Overrides)

**Status**: ✅ Complete
- **Admin Ops Dashboard**: `project/app/dashboard/admin/ops/page.tsx`
- **Manual Overrides**: 
  - Admin hold on orders (`adminHold` flag)
  - Manual payout release
  - Manual refund processing
  - Dispute resolution
- **Missing**: 
  - User search/management tool
  - Bulk actions (bulk release, bulk refund)
  - Order search by Stripe ID

---

## 7) UX/Conversion Review (High-Impact Improvements)

### What Will Reduce Seller Listing Completion

1. **Complex Category Forms**: Category-specific attribute forms are comprehensive but may feel overwhelming. **Fix**: Add progress indicators, save draft frequently, show examples.
2. **Image Upload UX**: No drag-and-drop, no image preview before upload. **Fix**: Add drag-and-drop, image preview, compression.
3. **Listing Limit Enforcement**: Error message when limit reached may be unclear. **Fix**: Show current count, upgrade CTA, clear messaging.

### What Will Reduce Buyer Conversion

1. **Auction Winner Notification**: No email/notification when auction ends → buyer may not know they won. **Fix**: Send email immediately when auction ends.
2. **Checkout Flow**: Requires account creation (no guest checkout). **Fix**: Add guest checkout option.
3. **Payment Method**: No saved payment methods. **Fix**: Integrate Stripe Customer Portal for saved methods.

### What to Simplify or Make More Premium

1. **Listing Cards**: Already premium with images, badges, countdown timers. ✅ Good
2. **Order Status**: Status names (`in_transit`, `delivered`, `accepted`) may be unclear to buyers. **Fix**: Add status descriptions, progress indicators.
3. **Protected Transaction Badge**: Tooltip explains feature, but may be missed. **Fix**: Add modal with detailed explanation on first view.

### What Flows Are Confusing

1. **Protected Transaction Flow**: Buyer may not understand when protection window starts/ends. **Fix**: Add timeline view showing delivery confirmation → protection window → auto-release date.
2. **Dispute Flow**: Evidence requirements may be unclear. **Fix**: Add step-by-step guide, example evidence types.
3. **Seller Payout**: Seller may not know when payout will be released. **Fix**: Show estimated release date based on protection window/dispute deadline.

### Top 10 UX Improvements That Directly Improve Transactions

1. **Auction Winner Email Notification** (P0) - Prevents lost sales
2. **Guest Checkout** (P1) - Reduces friction for first-time buyers
3. **Order Status Timeline** (P1) - Reduces support inquiries
4. **Protected Transaction Timeline** (P1) - Increases buyer confidence
5. **Image Upload Improvements** (P2) - Reduces seller abandonment
6. **Saved Payment Methods** (P2) - Faster repeat purchases
7. **Bulk Actions for Sellers** (P2) - Efficiency for power sellers
8. **Dispute Evidence Guide** (P2) - Reduces invalid disputes
9. **Seller Payout ETA** (P2) - Reduces seller inquiries
10. **Mobile Optimization** (P2) - Critical for mobile users

---

## 8) Security Review (High Priority)

### Firestore Rules Weaknesses

1. **Bid Privacy**: Rules allow any authenticated user to read bids for a listing (intentional for transparency, but `bidderId` is exposed). **Risk**: Low (bidder ID is masked in UI, but could be extracted from Firestore)
2. **Order Status Updates**: Buyer can update `status` to `'accepted'` or `'disputed'`, but rules don't validate status transitions. **Risk**: Medium (buyer could set status to `'completed'` to bypass payout hold, but API route enforces transitions)
3. **Admin Role Check**: Rules use `get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'` - if user document is compromised, privilege escalation possible. **Risk**: Medium

### API Endpoints Missing Auth Checks

**All endpoints checked - all have auth checks.** ✅

### Insecure Direct Object References

1. **Order ID in URL**: Order detail pages use `[orderId]` in URL. **Risk**: Low (Firestore rules prevent reading other users' orders, but URL could be guessed)
2. **Listing ID in URL**: Listing detail pages use `[id]` in URL. **Risk**: Low (listings are public, but draft listings could be accessed if ID is guessed)

### Sensitive Data Stored Improperly

1. **Stripe Account ID**: Stored in Firestore `users/{uid}.stripeAccountId`. **Risk**: Low (not sensitive, but could be used to query Stripe API if combined with API key leak)
2. **Email Addresses**: Stored in Firestore (required for notifications). **Risk**: Low (Firestore rules protect, but if rules misconfigured, emails could be exposed)
3. **Payment Intent ID**: Stored in order document. **Risk**: Low (not sensitive alone, but combined with Stripe secret key could be exploited)

### Input Validation Gaps

1. **Message Sanitization**: ✅ Implemented (`project/lib/safety/sanitizeMessage.ts`)
2. **API Input Validation**: ✅ Zod schemas for all endpoints (`project/lib/validation/api-schemas.ts`)
3. **Firestore Rules Validation**: ⚠️ Partial (rules check types but not business logic)

### CSRF/Webhook Signature Verification

1. **Stripe Webhook**: ✅ Signature verification implemented (`project/app/api/stripe/webhook/route.ts` lines 88-109)
2. **CSRF Protection**: ⚠️ Next.js API routes are CSRF-protected by default (same-origin policy), but no explicit CSRF tokens for forms

### What Would Fail a Basic Security Audit

1. **No Rate Limiting Persistence**: In-memory rate limiting resets on restart
2. **No Audit Logging**: Can't trace who did what and when
3. **No Idempotency Keys**: Webhook retries could create duplicate orders
4. **Client-Side Admin Checks**: Admin UI checks are client-side (though API routes are server-side protected)
5. **No Chargeback Handling**: Stripe chargebacks not tracked or handled

---

## 9) Performance & Scalability Review

### Query Patterns Likely to Get Expensive

1. **Admin Orders Query**: `project/app/api/admin/orders/route.ts` does client-side filtering for `ready_to_release` (lines 149-189). **Cost**: High (fetches all orders, filters in memory)
2. **Browse Page**: `project/app/browse/page.tsx` may fetch all active listings if no pagination. **Cost**: Medium (if 10k+ listings)
3. **Watchlist**: `project/app/dashboard/watchlist/page.tsx` fetches all watchlist items. **Cost**: Low (per-user, but could grow)

### Missing Indexes

1. **Ready to Release Filter**: Complex query with multiple conditions (`status`, `stripeTransferId`, `disputeStatus`, `adminHold`, `protectionEndsAt`) - no composite index. **Impact**: Query will fail at scale
2. **Category + Status + CreatedAt**: Index exists, but may need `listingType` added for auction-specific queries

### N+1 Reads

1. **Admin Orders Enrichment**: `project/app/api/admin/orders/route.ts` lines 226-240 fetches listing, buyer, seller for each order (N+1). **Fix**: Batch reads or denormalize data
2. **Listing Detail Page**: May fetch seller profile separately. **Fix**: Already denormalized in `sellerSnapshot`

### Too Much Client-Side Fetching

1. **Watchlist**: Fetches all watchlist items, filters client-side. **Impact**: Low (per-user, but could be paginated)
2. **Browse Page**: May fetch all listings, filters client-side. **Impact**: Medium (should paginate)

### Pagination and Caching Gaps

1. **Browse Page**: ❌ No pagination (assumed, need to verify)
2. **Admin Orders**: ⚠️ Cursor-based pagination implemented, but no caching
3. **Listing Detail**: ❌ No caching (could cache seller profiles, listing data)

### What Will Break at 10k Listings / 1k Concurrent Users

1. **Browse Page**: Will be slow if fetching all listings (needs pagination)
2. **Admin Orders Query**: Will fail if filtering client-side (needs server-side filtering or composite index)
3. **Rate Limiting**: In-memory store will reset on server restart (needs Redis)
4. **Firestore Reads**: Cost will increase linearly (10k listings × $0.06 per 100k reads = manageable but should optimize)

---

## 10) "100/100 Best-in-World" Recommendations (Prioritized Roadmap)

### P0: Must-Do Before Accepting Real Money

#### 1. Implement Automated Background Jobs for Auto-Release
- **What**: Set up cron/scheduled function to automatically release protected transactions when `protectionEndsAt` passes
- **Where**: Create `project/functions/auto-release-protected.ts` (Netlify Function with cron trigger)
- **Why**: Prevents funds from getting stuck, improves seller experience
- **Impact**: Critical for seller satisfaction, reduces admin workload
- **Files to Change**: 
  - Create `project/functions/auto-release-protected.ts`
  - Add cron trigger in `netlify.toml`
  - Update `project/app/api/stripe/transfers/release/route.ts` to support automated calls

#### 2. Add Audit Logging System
- **What**: Create `auditLogs` Firestore collection, log all admin actions (payout releases, refunds, dispute resolutions)
- **Where**: `project/lib/audit/logger.ts` (new file), update all admin API routes
- **Why**: Compliance, traceability, security
- **Impact**: Critical for compliance and debugging
- **Files to Change**:
  - Create `project/lib/audit/logger.ts`
  - Update `project/app/api/stripe/transfers/release/route.ts`
  - Update `project/app/api/stripe/refunds/process/route.ts`
  - Update `project/app/api/orders/[orderId]/disputes/resolve/route.ts`

#### 3. Auction Winner Email Notification
- **What**: Send email to winning bidder when auction ends
- **Where**: `project/app/api/stripe/webhook/route.ts` (add handler) OR create scheduled job to check ended auctions
- **Why**: Prevents lost sales, improves buyer experience
- **Impact**: High conversion impact
- **Files to Change**:
  - Create `project/functions/check-ended-auctions.ts` (scheduled job)
  - OR add logic to `project/app/api/stripe/webhook/route.ts` to detect auction end
  - Use `project/lib/email/sender.ts` to send notification

#### 4. Persistent Rate Limiting (Redis)
- **What**: Migrate from in-memory to Redis-based rate limiting
- **Where**: `project/lib/rate-limit.ts` (refactor to use Upstash Redis or Netlify's rate limiting)
- **Why**: Prevents rate limit bypass on server restart, works across multiple instances
- **Impact**: Critical for abuse prevention
- **Files to Change**:
  - Update `project/lib/rate-limit.ts` to use Redis
  - Add `UPSTASH_REDIS_URL` environment variable

#### 5. Add Idempotency Keys to Critical Endpoints
- **What**: Add idempotency keys to payout release, refund, order creation endpoints
- **Where**: `project/app/api/stripe/transfers/release/route.ts`, `project/app/api/stripe/refunds/process/route.ts`, `project/app/api/stripe/webhook/route.ts`
- **Why**: Prevents double-processing on webhook retries
- **Impact**: Critical for data integrity
- **Files to Change**:
  - Add idempotency key parameter to request bodies
  - Store processed keys in Firestore (with TTL)
  - Check before processing

#### 6. Add Firestore Composite Index for Ready-to-Release Query
- **What**: Create composite index for `ready_to_release` filter in admin orders query
- **Where**: `project/firestore.indexes.json`
- **Why**: Prevents query failures at scale
- **Impact**: Critical for admin operations at scale
- **Files to Change**:
  - Add composite index to `project/firestore.indexes.json`
  - Deploy indexes: `firebase deploy --only firestore:indexes`

#### 7. Implement Stripe Chargeback Handling
- **What**: Add webhook handler for `charge.dispute.created`, track chargebacks in Firestore
- **Where**: `project/app/api/stripe/webhook/route.ts`, create `project/app/dashboard/admin/chargebacks/page.tsx`
- **Why**: Track and respond to chargebacks
- **Impact**: Critical for financial operations
- **Files to Change**:
  - Add `charge.dispute.created` handler in webhook route
  - Create chargebacks collection in Firestore
  - Create admin chargebacks page

---

### P1: Should-Do Soon After Launch

#### 8. Add Stripe Reconciliation Tool
- **What**: Admin tool to compare Stripe charges/transfers/refunds with Firestore orders
- **Where**: `project/app/dashboard/admin/reconciliation/page.tsx` (new file)
- **Why**: Detect discrepancies, ensure data integrity
- **Impact**: High for financial accuracy
- **Files to Change**:
  - Create reconciliation page
  - Add API route to fetch Stripe data and compare with Firestore

#### 9. Complete Sentry Error Monitoring Setup
- **What**: Initialize Sentry in `app/layout.tsx` and API routes
- **Where**: `project/lib/monitoring/sentry.ts` (already exists, needs initialization)
- **Why**: Track errors in production
- **Impact**: High for debugging production issues
- **Files to Change**:
  - Update `project/lib/monitoring/sentry.ts` with initialization
  - Add `SENTRY_DSN` environment variable
  - Initialize in `project/app/layout.tsx`

#### 10. Add Automated Firestore Backups
- **What**: Set up daily Firestore exports to GCS
- **Where**: Firebase Console (manual setup) OR Cloud Function with scheduler
- **Why**: Disaster recovery
- **Impact**: High for data safety
- **Files to Change**:
  - Create Cloud Function for automated exports (if using programmatic approach)
  - OR configure in Firebase Console

#### 11. Implement Guest Checkout
- **What**: Allow buyers to checkout without creating account (create account after payment)
- **Where**: `project/app/api/stripe/checkout/create-session/route.ts`, update order creation logic
- **Why**: Reduces friction, increases conversion
- **Impact**: High conversion impact
- **Files to Change**:
  - Update checkout session to allow guest mode
  - Create user account after payment if email provided
  - Update order creation to handle guest users

#### 12. Add Order Status Timeline View
- **What**: Visual timeline showing order progress (paid → in_transit → delivered → accepted)
- **Where**: `project/app/dashboard/orders/page.tsx`, create `project/components/orders/OrderTimeline.tsx`
- **Why**: Improves buyer understanding, reduces support inquiries
- **Impact**: Medium UX improvement
- **Files to Change**:
  - Create OrderTimeline component
  - Add to order detail view

---

### P2: Polish and Competitive Differentiation

#### 13. Add Seller Analytics Dashboard
- **What**: Dashboard showing views, favorites, conversion rates, earnings over time
- **Where**: `project/app/seller/analytics/page.tsx` (new file)
- **Why**: Helps sellers optimize listings
- **Impact**: Medium seller satisfaction
- **Files to Change**:
  - Create analytics page
  - Aggregate data from Firestore (views, favorites, orders)

#### 14. Implement Saved Payment Methods
- **What**: Allow buyers to save payment methods for faster checkout
- **Where**: Integrate Stripe Customer Portal, update checkout flow
- **Why**: Faster repeat purchases
- **Impact**: Medium conversion impact
- **Files to Change**:
  - Create Stripe Customer on first purchase
  - Add "Save payment method" option in checkout
  - Integrate Customer Portal for managing saved methods

#### 15. Add Bulk Actions for Sellers
- **What**: Allow sellers to bulk edit/delete/publish listings
- **Where**: `project/app/seller/listings/page.tsx`
- **Why**: Efficiency for power sellers
- **Impact**: Low but improves seller experience
- **Files to Change**:
  - Add bulk selection UI
  - Add bulk action API endpoints

#### 16. Optimize Image Upload (Compression, Drag-and-Drop)
- **What**: Add image compression, drag-and-drop, preview before upload
- **Where**: `project/components/forms/ImageUpload.tsx` (if exists) or listing creation form
- **Why**: Reduces seller abandonment
- **Impact**: Medium UX improvement
- **Files to Change**:
  - Update image upload component
  - Add compression library (browser-image-compression)

#### 17. Add Dispute Evidence Guide
- **What**: Step-by-step guide with examples for dispute evidence
- **Where**: `project/app/dashboard/orders/page.tsx` (dispute dialog)
- **Why**: Reduces invalid disputes
- **Impact**: Low but improves dispute quality
- **Files to Change**:
  - Add evidence guide modal/component
  - Show examples for each evidence type

#### 18. Implement Saved Searches with Email Alerts
- **What**: Allow buyers to save searches and receive email alerts when new listings match
- **Where**: `project/app/dashboard/saved-searches/page.tsx` (new file)
- **Why**: Increases engagement, brings buyers back
- **Impact**: Medium engagement improvement
- **Files to Change**:
  - Create saved searches collection in Firestore
  - Create scheduled job to check for new matches
  - Send email alerts

#### 19. Add Seller Verification Badges
- **What**: Badges for verified sellers, top sellers, etc.
- **Where**: `project/lib/firebase/users.ts`, update seller profile display
- **Why**: Increases buyer trust
- **Impact**: Medium conversion impact
- **Files to Change**:
  - Add verification fields to user profile
  - Update seller profile components to show badges

#### 20. Performance Optimization (Pagination, Caching)
- **What**: Add pagination to browse page, implement caching for frequently accessed data
- **Where**: `project/app/browse/page.tsx`, add Redis caching layer
- **Why**: Improves performance at scale
- **Impact**: High for scalability
- **Files to Change**:
  - Add pagination to browse page
  - Implement Redis caching for seller profiles, listing counts

---

## NOT FOUND Section

The following expected components were **NOT FOUND** in the codebase:

1. **Automated Background Jobs / Cron System**: No scheduled jobs for auto-release, auction end processing, or cleanup tasks
2. **Audit Logging System**: No centralized audit log collection for tracking admin actions
3. **Stripe Reconciliation Tool**: No admin tool to compare Stripe data with Firestore orders
4. **Automated Backups**: No automated Firestore export/backup system
5. **Sentry Initialization**: Sentry template exists but not initialized in application
6. **Idempotency Key System**: No idempotency keys to prevent double-processing
7. **Chargeback Handling**: No webhook handler or admin tool for Stripe chargebacks
8. **Guest Checkout**: All checkouts require user account creation
9. **Saved Payment Methods**: No integration with Stripe Customer Portal
10. **Seller Analytics Dashboard**: No analytics page for sellers
11. **Saved Searches**: No saved search functionality with email alerts
12. **Redis/Persistent Rate Limiting**: Rate limiting is in-memory only
13. **Composite Index for Ready-to-Release**: Complex query lacks composite index

---

## Conclusion

Wildlife Exchange is a **well-architected marketplace** with solid foundations:
- ✅ Payout-hold implementation
- ✅ Comprehensive anti-circumvention protections
- ✅ Strong type safety and validation
- ✅ Admin operations dashboard
- ✅ Webhook security

However, **critical gaps** must be addressed before production:
- ❌ No automated background jobs (funds can get stuck)
- ❌ No audit logging (compliance risk)
- ❌ No persistent rate limiting (security risk)
- ❌ No idempotency keys (data integrity risk)

**Recommendation**: Address all P0 items before accepting real money. P1 items should be completed within first month of launch. P2 items can be prioritized based on user feedback.

---

**Report End**
