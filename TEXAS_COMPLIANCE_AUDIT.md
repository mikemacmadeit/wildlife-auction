# TEXAS WILDLIFE EXCHANGE — COMPLIANCE AUDIT REPORT

**Generated:** 2025-01-27  
**Audit Scope:** Full codebase review for Texas wildlife/livestock regulatory compliance  
**Evidence:** All claims backed by file paths, function names, and code snippets

---

## A) CURRENT SYSTEM OVERVIEW

### 1. Listing Creation Flow

**File:** `project/app/dashboard/listings/new/page.tsx` (1239 lines)

**Process:**
1. Seller fills multi-step form with:
   - Category selection: `wildlife_exotics` | `cattle_livestock` | `ranch_equipment`
   - Listing type: `auction` | `fixed` | `classified`
   - Category-specific attributes (species/breed, sex, age, quantity, health notes)
   - Pricing (price for fixed/classified, startingBid/reservePrice/endsAt for auction)
   - Images (uploaded to Firebase Storage)
   - Location (city, state, zip)
   - Protected transaction toggle (optional 7/14 day protection)

2. Listing created as `draft` status via `createListingDraft()` (`project/lib/firebase/listings.ts` line 261)

3. Seller publishes via `publishListing()` (`project/lib/firebase/listings.ts` line 295):
   - Checks listing limit based on subscription plan (Free: 3, Pro: 10, Elite: unlimited)
   - Changes status from `draft` → `active`
   - Sets `publishedAt` timestamp

**Admin Approval:**
- Admin approval page exists: `project/app/dashboard/admin/listings/page.tsx`
- Admins can approve/reject listings with status `draft` or `pending`
- **GAP:** No automatic gating — sellers can publish directly without admin approval
- **Evidence:** `publishListing()` function does NOT check for admin approval requirement

### 2. Listing Types & How Each Works

**Types Defined:** `project/lib/types.ts` line 3
```typescript
type ListingType = 'auction' | 'fixed' | 'classified';
```

#### A) Auction (`auction`)
- **Fields:** `startingBid`, `reservePrice` (optional, hidden), `endsAt` (required), `currentBid` (denormalized)
- **Bidding:** Real-time via Firestore subscriptions (`project/lib/firebase/bids.ts`)
- **Bid Validation:** 
  - Must be > current bid (or starting bid if no bids)
  - Auction must be active and not ended
  - Seller cannot bid on own listing
  - Transaction-safe bid placement (`placeBidTx()` line 105)
- **Increments:** UI suggests 5% minimum increment with $50 floor (`project/components/auction/BidIncrementCalculator.tsx` line 37)
- **Close:** When `endsAt` timestamp passes, auction ends. Winner determined by highest bid.
- **Checkout:** Winner must checkout manually after auction ends (`project/app/api/stripe/checkout/create-session/route.ts` line 152-191)

#### B) Fixed Price (`fixed`)
- **Fields:** `price` (required)
- **Purchase:** Instant checkout via Stripe Checkout session
- **No bidding:** Direct purchase only

#### C) Classified (`classified`)
- **Fields:** `price` (optional "asking price")
- **Purchase:** No checkout — contact seller via messaging
- **Payment:** Off-platform (no payment processing)

### 3. Bidding Logic

**Bid Storage:** `project/lib/firebase/bids.ts`

**Collection:** `bids/{bidId}`
- Fields: `listingId`, `bidderId`, `amount`, `createdAt`
- Immutable (no updates/deletes allowed per Firestore rules line 115-116)

**Who Can Bid:**
- Any authenticated user (Firestore rules line 107)
- Cannot bid on own listing (client-side check: `project/app/listing/[id]/page.tsx` line 143)
- Auction must be active and not ended (transaction check: `project/lib/firebase/bids.ts` line 137-147)

**Bid Increments:**
- No enforced server-side increment rules
- UI suggests 5% minimum increment (`project/components/auction/BidIncrementCalculator.tsx` line 37)
- Client-side validation only: bid must be > current bid

**Reserve Price:**
- Stored in listing document (`reservePrice` field)
- Hidden from bidders (UI does not display)
- **GAP:** No automatic rejection if final bid < reserve price
- **GAP:** No notification to seller if reserve not met

**Buy Now:**
- **NOT IMPLEMENTED** — No "Buy It Now" option for auctions

### 4. Checkout/Payment Flow

**File:** `project/app/api/stripe/checkout/create-session/route.ts`

**Process:**
1. Buyer initiates checkout (fixed price) OR winner checks out after auction ends
2. Server validates:
   - Listing is active
   - For auctions: auction ended, buyer is winning bidder
   - Seller has Stripe Connect account set up (`chargesEnabled`, `payoutsEnabled`, `stripeDetailsSubmitted`)
3. Creates Stripe Checkout session:
   - **ESCROW MODEL:** Funds go to platform account (NO `transfer_data` — line 267 comment)
   - Platform fee calculated based on seller's plan (Free: 7%, Pro: 5%, Elite: 4%)
   - Metadata stored: `listingId`, `buyerId`, `sellerId`, `sellerStripeAccountId`, `sellerAmount`, `platformFee`

**Webhook Handler:** `project/app/api/stripe/webhook/route.ts`

**Event:** `checkout.session.completed`
- Creates order in Firestore with status `paid`
- Marks listing as `sold`
- Sets `disputeDeadlineAt` (72 hours default)
- If protected transaction enabled, sets `payoutHoldReason: 'protection_window'`

**Order Status Flow:**
- `paid` → (seller marks delivered) → `in_transit` → `delivered` → (buyer accepts) → `accepted`
- OR buyer disputes → `disputed`
- Admin releases payout → creates Stripe transfer → order status updated

**Fees:**
- Platform fee: 4-7% based on seller plan (`project/lib/pricing/plans.ts`)
- Stripe processing fees: Not explicitly tracked (handled by Stripe)

**Refunds:**
- Admin-only endpoint: `project/app/api/stripe/refunds/process/route.ts`
- Creates Stripe refund, updates order status to `refunded`

### 5. Data Model (Firestore Collections)

#### Collection: `listings/{listingId}`
**File:** `project/lib/types/firestore.ts` lines 14-84

**Key Fields:**
- `type`: `'auction' | 'fixed' | 'classified'`
- `category`: `'wildlife_exotics' | 'cattle_livestock' | 'ranch_equipment'`
- `status`: `'draft' | 'active' | 'sold' | 'expired' | 'removed'`
- `attributes`: Category-specific object (species/breed, sex, age, quantity, healthNotes, etc.)
- `location`: `{ city, state, zip? }`
- `sellerId`: Firebase Auth UID
- `protectedTransactionEnabled`: boolean
- `protectedTransactionDays`: `7 | 14 | null`

**Who Writes:**
- Create: Seller (`createListingDraft()` — `project/lib/firebase/listings.ts` line 261)
- Update: Seller or Admin (`updateListing()` — line 360)
- Publish: Seller (`publishListing()` — line 295) OR Admin (approval page)

#### Collection: `bids/{bidId}`
**File:** `project/lib/firebase/bids.ts` lines 30-35

**Fields:** `listingId`, `bidderId`, `amount`, `createdAt`
**Who Writes:** Authenticated users via `placeBidTx()` (line 105)

#### Collection: `orders/{orderId}`
**File:** `project/lib/types.ts` lines 138-207

**Key Fields:**
- `status`: `'pending' | 'paid' | 'in_transit' | 'delivered' | 'accepted' | 'disputed' | 'completed' | 'refunded' | 'cancelled' | 'ready_to_release'`
- `amount`, `platformFee`, `sellerAmount` (all in dollars)
- `stripeCheckoutSessionId`, `stripePaymentIntentId`, `stripeTransferId`
- `payoutHoldReason`: `'none' | 'protection_window' | 'dispute_open'`
- `protectedTransactionDaysSnapshot`: Immutable snapshot at checkout

**Who Writes:**
- Create: Webhook (`handleCheckoutSessionCompleted()` — `project/app/api/stripe/webhook/handlers.ts` line 19)
- Update: Buyer (accept/dispute), Seller (mark delivered), Admin (release/refund)

#### Collection: `users/{uid}`
**File:** `project/lib/types.ts` lines 241-309

**Key Fields:**
- `subscriptionPlan`: `'free' | 'pro' | 'elite'`
- `stripeAccountId`: Stripe Connect account ID
- `stripeOnboardingStatus`: `'not_started' | 'pending' | 'complete'`
- `chargesEnabled`, `payoutsEnabled`: Stripe capability flags
- `seller.verified`: boolean (optional verification)

### 6. Auction Close Logic

**Current Implementation:**
- **NO AUTOMATED CLOSE PROCESSING**
- Auction ends when `endsAt` timestamp passes (client-side countdown timer)
- Winner determination: Manual — buyer must checkout after auction ends
- **GAP:** No automatic winner notification
- **GAP:** No automatic checkout session creation for winner
- **GAP:** No handling of reserve price not met

**Evidence:**
- Checkout endpoint requires manual initiation (`project/app/api/stripe/checkout/create-session/route.ts` line 152-191)
- No scheduled job to process ended auctions
- No email notification on auction end

**Scheduled Function Exists:** `project/netlify/functions/autoReleaseProtected.ts`
- Purpose: Auto-release protected transactions after protection window expires
- Runs every 10 minutes (cron: `*/10 * * * *`)
- **NOT USED FOR:** Auction close processing

### 7. Shipping/Transfer Expectations

**Current State:**
- **NO SHIPPING/TRANSFER TRACKING IMPLEMENTED**
- Order status includes `in_transit` and `delivered` (seller can mark)
- No integration with shipping carriers
- No transfer permit tracking
- No CVI (Certificate of Veterinary Inspection) tracking
- No pickup/delivery address fields

**Evidence:**
- Order document has `deliveryProofUrls?: string[]` (optional, manual upload)
- Seller can mark order as `in_transit` or `delivered` (`project/app/api/orders/[orderId]/mark-delivered/route.ts`)
- No structured fields for transfer permits, CVIs, or shipping details

### 8. Admin Tools & Moderation

**Admin Pages:**
1. **Listing Approval:** `project/app/dashboard/admin/listings/page.tsx`
   - View listings with status `draft` or `pending`
   - Approve → sets status to `active`
   - Reject → sets status to `removed`

2. **Admin Ops Dashboard:** `project/app/dashboard/admin/ops/page.tsx`
   - View orders, disputes, protected transactions
   - Release payouts, process refunds

3. **Flagged Messages:** `project/app/dashboard/admin/messages/page.tsx`
   - Review messages flagged for anti-circumvention violations

**Admin Endpoints:**
- `POST /api/stripe/transfers/release` — Release escrow funds
- `POST /api/stripe/refunds/process` — Process refunds
- `POST /api/orders/[orderId]/confirm-delivery` — Confirm delivery (starts protection window)
- `POST /api/orders/[orderId]/disputes/resolve` — Resolve disputes

**What's Missing:**
- No bulk operations (bulk approve/reject listings)
- No category-specific compliance checks
- No permit verification tools
- No automated compliance warnings

---

## B) COMPLIANCE GAP ANALYSIS

| Category | Current Support | Missing Compliance Controls | Risk Level | Recommended Fix | Files to Change |
|----------|----------------|------------------------------|------------|-----------------|-----------------|
| **Breeder Whitetail Deer** | **Partial** | • No TPWD permit verification<br>• No transfer permit gating<br>• No breeder license validation<br>• Species field is free-text (could allow "wild whitetail")<br>• No blocking of prohibited sales | **HIGH** | • Add `permitNumber` field to listing attributes<br>• Require TPWD permit upload for whitetail listings<br>• Block listings without valid permit<br>• Add species validation (block "wild whitetail")<br>• Gate checkout until transfer permit obtained | `project/lib/types.ts` (WildlifeAttributes)<br>`project/components/listings/CategoryAttributeForm.tsx`<br>`project/app/dashboard/listings/new/page.tsx`<br>`project/app/api/stripe/checkout/create-session/route.ts`<br>`project/lib/firebase/listings.ts` |
| **Exotic Game Animals** | **Partial** | • No TAHC ID/health disclosure requirements<br>• No CVI upload/verification<br>• Health notes are optional free-text<br>• No interstate transfer warnings | **HIGH** | • Add `tahcId` field for exotic animals<br>• Require CVI upload for interstate sales<br>• Add health disclosure checklist<br>• Show interstate transfer warnings in UI<br>• Block checkout until CVI uploaded | `project/lib/types.ts` (WildlifeAttributes)<br>`project/components/listings/CategoryAttributeForm.tsx`<br>`project/app/listing/[id]/page.tsx`<br>`project/app/api/stripe/checkout/create-session/route.ts` |
| **Cattle** | **Partial** | • No TAHC interstate CVI warnings<br>• No brand inspection requirements<br>• Registration number optional (should be required if registered=true)<br>• No health certificate upload | **MEDIUM** | • Add interstate CVI warning for cattle sales<br>• Require brand inspection upload for Texas cattle<br>• Require registration number if registered=true<br>• Add health certificate upload field | `project/lib/types.ts` (CattleAttributes)<br>`project/components/listings/CategoryAttributeForm.tsx`<br>`project/app/dashboard/listings/new/page.tsx` |
| **Equipment** | **Yes** | • No title/bill of sale requirements for vehicles<br>• Serial number optional (should be required for vehicles) | **LOW** | • Add `hasTitle` checkbox for vehicles<br>• Require serial number for vehicles<br>• Add bill of sale upload field | `project/lib/types.ts` (EquipmentAttributes)<br>`project/components/listings/CategoryAttributeForm.tsx` |
| **Prohibited Sales** | **NO** | • No blocking of wild whitetail sales<br>• No blocking of venison sales<br>• No blocking of tag/license sales<br>• Species field allows any text | **HIGH** | • Add species validation (blocklist: "wild whitetail", "venison", "tags", "licenses")<br>• Add category validation (block "hunting tags" category)<br>• Server-side validation on listing creation | `project/lib/firebase/listings.ts` (createListingDraft)<br>`project/app/dashboard/listings/new/page.tsx`<br>`project/lib/validation/api-schemas.ts` |

### Platform Role Analysis

**Current Model:** **MARKETPLACE** (correct)
- ✅ Funds flow: Buyer → Platform (escrow) → Seller (manual release)
- ✅ Platform takes fee (4-7%)
- ✅ Platform does NOT take title/ownership
- ✅ Sellers create listings, set prices
- ✅ Platform facilitates transactions only

**Risk Areas:**
- Platform acts as escrow holder (acceptable for marketplace)
- No explicit "marketplace disclaimer" in terms
- No seller liability disclaimers

---

## C) RECOMMENDED COMPLIANCE ARCHITECTURE

### 1. Permit-Gated Transaction States

**Proposed Flow:**
```
listed → offer_accepted → escrow → permit_requested → permit_approved → completed
```

**Implementation:**
- Add `order.permitStatus`: `'none' | 'requested' | 'uploaded' | 'approved' | 'rejected'`
- Add `order.permitDocuments`: Array of Firebase Storage URLs
- Add `order.permitApprovedBy`: Admin UID (who approved permit)
- Gate checkout for regulated animals until permit uploaded
- Admin approves permit → order moves to `permit_approved` → funds can be released

**Files to Create/Modify:**
- `project/lib/types.ts` — Add permit fields to Order type
- `project/app/api/orders/[orderId]/upload-permit/route.ts` — New endpoint
- `project/app/api/orders/[orderId]/approve-permit/route.ts` — New endpoint
- `project/app/dashboard/admin/permits/page.tsx` — New admin page

### 2. Escrow Implementation (Current)

**Status:** ✅ **ALREADY IMPLEMENTED**

**How It Works:**
- Stripe Checkout → funds go to platform account (no `transfer_data`)
- Order created with status `paid`
- Admin releases via `POST /api/stripe/transfers/release`
- Creates Stripe transfer to seller's connected account

**Enhancement Needed:**
- Add permit approval gate before release
- Auto-release after permit approved + protection window expires

### 3. Verification Document Storage

**Proposed Firestore Structure:**
```
listings/{listingId}/permits/{permitId}
  - type: 'TPWD' | 'TAHC' | 'CVI' | 'brand_inspection' | 'title'
  - documentUrl: string (Firebase Storage)
  - permitNumber: string
  - issuedBy: string
  - issuedAt: Timestamp
  - expiresAt?: Timestamp
  - verifiedBy?: string (admin UID)
  - verifiedAt?: Timestamp
```

**Files to Create:**
- `project/lib/firebase/permits.ts` — Permit CRUD functions
- `project/app/api/permits/upload/route.ts` — Upload permit document
- `project/app/api/permits/verify/route.ts` — Admin verify permit

### 4. Blocking Illegal Categories

**Implementation:**
- Add server-side validation in `createListingDraft()`:
  ```typescript
  // Block prohibited species
  const PROHIBITED_SPECIES = ['wild whitetail', 'venison', 'hunting tags', 'licenses'];
  if (PROHIBITED_SPECIES.some(s => species.toLowerCase().includes(s))) {
    throw new Error('Prohibited species');
  }
  ```
- Add category validation: Block "hunting tags" or "licenses" categories
- Add Firestore security rule to reject prohibited listings

**Files to Modify:**
- `project/lib/firebase/listings.ts` — Add validation in `createListingDraft()`
- `project/firestore.rules` — Add validation rule for listings collection

---

## D) NEXT STEPS (Prioritized)

### P0: Must Fix Before Allowing Regulated Animals

#### 1. Add Species Validation & Blocklist
**Priority:** P0  
**Risk:** HIGH — Could enable illegal sales  
**Files:**
- `project/lib/firebase/listings.ts` (line 261 — `createListingDraft`)
- `project/lib/validation/api-schemas.ts` (add species validation schema)

**Implementation:**
```typescript
const PROHIBITED_SPECIES = [
  'wild whitetail',
  'venison',
  'hunting tags',
  'licenses',
  'game tags'
];

function validateSpecies(species: string, category: ListingCategory): void {
  const lowerSpecies = species.toLowerCase();
  if (PROHIBITED_SPECIES.some(prohibited => lowerSpecies.includes(prohibited))) {
    throw new Error(`Prohibited species: ${species}`);
  }
  
  if (category === 'wildlife_exotics' && lowerSpecies.includes('whitetail')) {
    // Require "breeder" or "game-farmed" in description for whitetail
    // Or add separate permit validation
  }
}
```

#### 2. Add TPWD Permit Requirement for Whitetail Deer
**Priority:** P0  
**Risk:** HIGH — TPWD violation  
**Files:**
- `project/lib/types.ts` — Add `permitNumber?: string` to `WildlifeAttributes`
- `project/components/listings/CategoryAttributeForm.tsx` — Add permit upload field
- `project/app/dashboard/listings/new/page.tsx` — Require permit for whitetail
- `project/lib/firebase/listings.ts` — Validate permit exists for whitetail

**Implementation:**
- Add `permitNumber` field (required if species includes "whitetail")
- Add permit document upload (Firebase Storage)
- Block listing publish if whitetail without permit
- Store permit in `listings/{id}/permits/{permitId}` subcollection

#### 3. Add Transfer Permit Gating for Checkout
**Priority:** P0  
**Risk:** HIGH — Transfer without permit is illegal  
**Files:**
- `project/app/api/stripe/checkout/create-session/route.ts` — Check permit before checkout
- `project/lib/types.ts` — Add `transferPermitStatus` to Order type

**Implementation:**
- Before creating checkout session, verify:
  - If listing is whitetail deer → require TPWD transfer permit uploaded
  - If listing is exotic → require TAHC permit/CVI uploaded
- Block checkout if permit not uploaded
- Add permit upload UI in order flow

#### 4. Add CVI/Health Certificate Requirements
**Priority:** P0  
**Risk:** HIGH — Interstate transfer violation  
**Files:**
- `project/lib/types.ts` — Add `cviRequired: boolean`, `cviDocumentUrl?: string` to Order
- `project/app/api/stripe/checkout/create-session/route.ts` — Check CVI requirement
- `project/app/listing/[id]/page.tsx` — Show CVI warning for interstate sales

**Implementation:**
- Detect interstate sale (buyer state ≠ seller state)
- Require CVI upload before checkout for interstate animal sales
- Store CVI in `orders/{orderId}/documents/cvi` subcollection

### P1: High Value Compliance Upgrades

#### 5. Add Admin Permit Verification Dashboard
**Priority:** P1  
**Risk:** MEDIUM — Manual verification needed  
**Files:**
- `project/app/dashboard/admin/permits/page.tsx` — New file
- `project/app/api/permits/verify/route.ts` — New endpoint

**Implementation:**
- Admin views pending permits
- Admin verifies permit number against TPWD/TAHC databases (manual or API)
- Admin approves/rejects permit
- Order status updated based on permit approval

#### 6. Add Cattle Brand Inspection Requirements
**Priority:** P1  
**Risk:** MEDIUM — Texas brand inspection law  
**Files:**
- `project/lib/types.ts` — Add `brandInspectionRequired: boolean` to CattleAttributes
- `project/components/listings/CategoryAttributeForm.tsx` — Add brand inspection checkbox
- `project/app/api/stripe/checkout/create-session/route.ts` — Require brand inspection for cattle

#### 7. Add Equipment Title/Bill of Sale Requirements
**Priority:** P1  
**Risk:** LOW — Title fraud prevention  
**Files:**
- `project/lib/types.ts` — Add `hasTitle: boolean`, `titleDocumentUrl?: string` to EquipmentAttributes
- `project/components/listings/CategoryAttributeForm.tsx` — Add title upload for vehicles

#### 8. Add Automated Auction Close Processing
**Priority:** P1  
**Risk:** MEDIUM — Winner notification & checkout  
**Files:**
- `project/netlify/functions/processEndedAuctions.ts` — New scheduled function
- `project/lib/email/templates.ts` — Add auction winner email template

**Implementation:**
- Scheduled function runs every minute
- Query auctions where `endsAt < now` and `status === 'active'`
- Determine winner (highest bid)
- Send email to winner with checkout link
- Send email to seller with winner info
- Optionally auto-create checkout session for winner

### P2: Nice-to-Have Trust Features

#### 9. Add Seller Verification Requirements
**Priority:** P2  
**Risk:** LOW — Trust enhancement  
**Files:**
- `project/app/seller/verification/page.tsx` — New page
- `project/lib/firebase/users.ts` — Add verification document upload

**Implementation:**
- Seller uploads business license, TPWD permit, etc.
- Admin verifies documents
- Verified sellers get badge

#### 10. Add Transfer Tracking
**Priority:** P2  
**Risk:** LOW — User experience  
**Files:**
- `project/lib/types.ts` — Add `transferTracking` fields to Order
- `project/app/dashboard/orders/[orderId]/page.tsx` — Add transfer tracking UI

**Implementation:**
- Seller enters transfer permit number
- Buyer confirms receipt
- Track transfer status

---

## EVIDENCE APPENDIX

### Key Files Referenced

**Listing Creation:**
- `project/app/dashboard/listings/new/page.tsx` — Listing creation UI (1239 lines)
- `project/lib/firebase/listings.ts` — Listing CRUD functions (898 lines)
- `project/components/listings/CategoryAttributeForm.tsx` — Category-specific form fields (376 lines)

**Bidding:**
- `project/lib/firebase/bids.ts` — Bid placement logic (240 lines)
- `project/components/auction/BidIncrementCalculator.tsx` — Bid increment UI (216 lines)

**Payment:**
- `project/app/api/stripe/checkout/create-session/route.ts` — Checkout creation (372 lines)
- `project/app/api/stripe/webhook/route.ts` — Webhook handler (357 lines)
- `project/app/api/stripe/webhook/handlers.ts` — Webhook event handlers (434 lines)
- `project/app/api/stripe/transfers/release/route.ts` — Payout release (177 lines)

**Admin:**
- `project/app/dashboard/admin/listings/page.tsx` — Listing approval (528 lines)
- `project/app/dashboard/admin/ops/page.tsx` — Admin ops dashboard (exists, not read)

**Data Models:**
- `project/lib/types.ts` — TypeScript types (includes Listing, Order, User types)
- `project/lib/types/firestore.ts` — Firestore document types (85 lines)
- `project/firestore.rules` — Security rules (246 lines)

**Scheduled Functions:**
- `project/netlify/functions/autoReleaseProtected.ts` — Auto-release protected transactions (exists, not read in full)

### Compliance Gaps Summary

**CRITICAL (P0):**
1. ❌ No species validation/blocklist
2. ❌ No TPWD permit requirement for whitetail
3. ❌ No transfer permit gating
4. ❌ No CVI requirements for interstate sales

**HIGH PRIORITY (P1):**
5. ⚠️ No admin permit verification dashboard
6. ⚠️ No cattle brand inspection requirements
7. ⚠️ No equipment title requirements
8. ⚠️ No automated auction close processing

**NICE-TO-HAVE (P2):**
9. ⚠️ No seller verification requirements
10. ⚠️ No transfer tracking

---

**END OF AUDIT REPORT**
