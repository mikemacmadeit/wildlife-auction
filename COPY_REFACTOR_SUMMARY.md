# Copy Refactoring Summary - January 24, 2026

## Objective
Refactor all user-facing language to present the app as a **Texas-only agricultural/livestock marketplace** facilitating legal private-party sales of ranch animals, while preserving all existing functionality, routes, schemas, and APIs.

## Changes Made

### 1. Category Display Labels ✅
**File: `components/browse/filters/constants.ts`**
- **Before:** `'Wildlife & Exotics'`
- **After:** `'Registered & Specialty Livestock'`
- **Note:** Category enum value `wildlife_exotics` remains unchanged (database/persistence)

### 2. Meta Tags & SEO ✅
**File: `app/layout.tsx`**
- **Title:** `'Wildlife Exchange | Texas Exotic & Breeder Animal Marketplace'` → `'Wildlife Exchange | Texas Livestock & Ranch Marketplace'`
- **Description:** `'Buy and sell exotics, breeder stock...'` → `'Buy and sell registered livestock, breeder stock...'`
- **OG Description:** `'Texas marketplace for exotic and breeder animal sales...'` → `'Texas-only marketplace for registered livestock and ranch animal sales...'`
- **Twitter:** Updated similarly

### 3. Homepage Copy ✅
**File: `app/page.tsx`**
- **Hero text:** `'Wildlife-first marketplace for Texas livestock...'` → `'Texas-only marketplace for registered livestock...'`
- **Category card:** `'Wildlife & Exotics'` → `'Registered & Specialty Livestock'`
- **Category description:** `'Axis deer, blackbuck, fallow deer, and other exotic species'` → `'Axis deer, blackbuck, fallow deer, and other registered ranch species'`
- **Badge:** `'Escrow + payout gating'` → `'Delayed settlement + payout gating'`

### 4. Listing Creation/Edit Pages ✅
**Files: `app/dashboard/listings/new/page.tsx`, `app/seller/listings/[id]/edit/page.tsx`**
- **Category card title:** `'Wildlife & Exotics'` → `'Registered & Specialty Livestock'`
- **Category description:** `'exotic species'` → `'registered ranch species'`
- **Alert text:** `'All animal transactions (whitetail breeder, exotics, cattle...)'` → `'All animal transactions (whitetail breeder, registered livestock, cattle...)'`
- **Disclosure text:** `'I acknowledge health disclosure requirements for exotic animals.'` → `'I acknowledge health disclosure requirements for registered livestock.'`

### 5. Browse Pages ✅
**File: `app/browse/wildlife-exotics/page.tsx`**
- **Page title:** `'Wildlife & Exotics'` → `'Registered & Specialty Livestock'`
- **Description:** `'Browse axis deer, blackbuck, fallow deer, and other exotic species'` → `'Browse axis deer, blackbuck, fallow deer, and other registered ranch species'`
- **Empty state:** `'No wildlife & exotics listings...'` → `'No registered & specialty livestock listings...'`

### 6. Legal Pages ✅
**Files: `app/terms/page.tsx`, `app/legal/marketplace-policies/page.tsx`, `app/legal/seller-policy/page.tsx`, `app/legal/buyer-acknowledgment/page.tsx`**
- **Terms:** `'Wildlife Exchange may hold and release funds...'` → `'Wildlife Exchange processes payments through the platform and releases funds...'`
- **Marketplace Policies:** `'Animal categories (whitetail, exotics, livestock...)'` → `'Animal categories (whitetail, registered livestock, cattle...)'`
- **Prohibited items:** `'wild-caught protected wildlife'` → `'wild-caught protected species'` (added `'endangered or protected species'`)
- **Seller/Buyer Policy:** `'Applies to whitetail, exotics, livestock...'` → `'Applies to whitetail, registered livestock, cattle...'`

### 7. Compliance Page ✅
**File: `app/compliance/page.tsx`**
- **Disclosure header:** `'Exotic animal listings require...'` → `'Registered livestock listings require...'`
- **Alert text:** `'"Other Exotic" species require...'` → `'"Other" specialty species require...'`

### 8. Trust Page ✅
**File: `app/trust/page.tsx`**
- **Section header:** `'Wildlife/Exotics Listings'` → `'Registered & Specialty Livestock Listings'`
- **List item:** `'Other exotics: Review if "other_exotic" species'` → `'Other specialty livestock: Review if "other_exotic" species'`
- **List item:** `'"Other Exotic" species: Requires admin review'` → `'"Other" specialty species: Requires admin review'`

### 9. Register Page ✅
**File: `app/register/page.tsx`**
- **Description:** `'Join Texas' premier marketplace for exotic and breeder animal sales...'` → `'Join Texas' premier marketplace for registered livestock and breeder animal sales...'`

### 10. How It Works Page ✅
**File: `app/how-it-works/page.tsx`**
- **Description:** `'Whether you're selling trophy whitetail, exotic species, cattle...'` → `'Whether you're selling trophy whitetail, registered livestock, cattle...'`

### 11. UI Components ✅
**Files: `components/listings/CategoryAttributeForm.tsx`, `components/listings/ListingCard.tsx`, `components/navigation/Footer.tsx`, `components/orders/TransactionTimeline.tsx`, `components/payments/PaymentMethodDialog.tsx`, `components/payments/WireInstructionsDialog.tsx`**
- **Alert:** `'TAHC Compliance: Exotic animal transactions...'` → `'TAHC Compliance: Registered livestock transactions...'`
- **Tooltip:** `'Funds held for payout release...'` → `'Payments are processed through the platform and released according to marketplace confirmation and dispute rules...'`
- **Footer badge:** `'Escrow + payout gating'` → `'Delayed settlement + payout gating'`
- **Timeline:** `'Escrow released to the seller...'` → `'Payment released to the seller...'`
- **Payment dialogs:** `'Funds are held for payout release...'` → `'Payments are processed through the platform and released according to marketplace confirmation and dispute rules...'`

### 12. Email Templates ✅
**File: `lib/email/templates.ts`**
- **Email header:** `'Texas Exotic & Breeder Animal Marketplace'` → `'Texas Livestock & Ranch Marketplace'`

### 13. Knowledge Base ✅
**Files: `knowledge_base/getting-started/what-is-wildlife-exchange.md`, `knowledge_base/getting-started/how-to-list-animal.md`, `knowledge_base/getting-started/how-to-sell.md`, `knowledge_base/listings/creating-listings.md`, `knowledge_base/payments/payment-protection-explained.md`, `knowledge_base/payments/payment-methods-accepted.md`**
- **Category references:** `'Wildlife & Exotics'` → `'Registered & Specialty Livestock'`
- **Category descriptions:** `'exotic species'` → `'registered ranch species'`
- **Payment protection:** `'Funds held securely...'` → `'Payments are processed through the platform and released according to marketplace confirmation and dispute rules...'`
- **Tags:** Removed `'escrow'`, added `'delayed settlement'`
- **Payment methods:** `'Secure escrow-like protection'` → `'Secure delayed settlement protection'`

### 14. Seller Sales Page ✅
**File: `app/seller/sales/page.tsx`**
- **Helper text:** `'This order uses a payout hold model. Funds are released...'` → `'This order uses a delayed settlement model. Payments are processed through the platform and released...'`

### 15. Copy Lint Script ✅
**File: `scripts/copy-lint.ts`**
- Created comprehensive lint script that scans user-facing strings for banned terms
- Banned terms: `exotic animals/species/listings`, `escrow`, `buy wildlife`, `sell wildlife`, `wildlife marketplace`, `exotic marketplace`
- Exceptions: `'Wildlife Exchange'` (brand name), enum values, constant names
- Added to `package.json` as `"copy:lint"` script

## Key Language Mappings (Display Text Only)

| Before | After |
|--------|-------|
| "Wildlife & Exotics" | "Registered & Specialty Livestock" |
| "Exotic animals" | "Specialty livestock" or "Ranch animals" |
| "Exotic species" | "Registered ranch species" |
| "Exotic listings" | "Specialty livestock listings" |
| "Wildlife marketplace" | "Texas livestock & ranch marketplace" |
| "Escrow" | "Delayed settlement" or removed |
| "Funds held until delivery" | "Payments are processed through the platform and released according to marketplace confirmation and dispute rules" |
| "Texas Exotic & Breeder Animal Marketplace" | "Texas Livestock & Ranch Marketplace" |

## What Was NOT Changed

✅ **Database schemas** - All enum values, field names, and stored values remain unchanged
✅ **API contracts** - All API endpoints, request/response formats unchanged
✅ **Firestore collections** - Collection names and document structures unchanged
✅ **Route paths** - All URL paths and route handlers unchanged
✅ **Component names** - All React component names and IDs unchanged
✅ **Variable names** - All code variable names unchanged (only display labels changed)
✅ **Business logic** - All functional code paths unchanged

## Compliance Additions

Added clarifying copy where appropriate:
- "Texas-only transactions"
- "Only animals legal to own and transfer under Texas law are permitted."
- "Endangered or protected species are prohibited."
- "The platform does not take possession of animals or arrange transport."

## Testing Recommendations

1. **Visual Testing:**
   - Verify category labels show "Registered & Specialty Livestock" in all UI locations
   - Check homepage hero text and category cards
   - Verify meta tags in browser dev tools
   - Check email template headers

2. **Functional Testing:**
   - Verify category filtering still works (uses `wildlife_exotics` enum value)
   - Verify listing creation/editing still works
   - Verify all routes still function
   - Verify API endpoints still work

3. **Copy Lint:**
   - Run `npm run copy:lint` to verify no banned terms remain
   - Add to CI/CD pipeline to prevent future violations

## Summary

The app now presents as a **Texas-only livestock & ranch marketplace** for payment processor review. All user-facing language has been refactored to:
- Remove references to "exotic" (as descriptor of animals)
- Remove references to "wildlife" (as descriptor of what is sold)
- Remove "escrow" terminology (replaced with "delayed settlement")
- Frame as agricultural/livestock marketplace
- Maintain "Wildlife Exchange" as brand name only
- Preserve all functionality, schemas, and APIs

**No functional regressions** - All changes are display-only.

## Verification

✅ **Copy lint script passes** - `npm run copy:lint` confirms no banned terms in user-facing copy
✅ **All category labels updated** - Display text changed, enum values preserved
✅ **All meta tags updated** - SEO and social sharing tags compliant
✅ **All legal pages updated** - Terms, policies, and acknowledgments compliant
✅ **All email templates updated** - Email headers and content compliant
✅ **All knowledge base articles updated** - Help content compliant

## Next Steps

1. **Add to CI/CD:** Include `npm run copy:lint` in build pipeline to prevent future violations
2. **Review in staging:** Test all user-facing pages to verify copy changes
3. **Payment processor review:** Submit updated copy for Stripe/payment processor review

## Important Notes

- **Internal code usage preserved:** Filter keys, enum values, and internal identifiers like `'escrow'` remain unchanged (these are not user-facing)
- **Brand name preserved:** "Wildlife Exchange" remains as the brand name throughout
- **Functionality unchanged:** All routes, APIs, database schemas, and business logic remain identical
