# Seller Pricing Model Update Summary

## Overview
Updated seller-side pricing tiers, fees, listing limits, and all related UI/copy/calculations to match the new pricing model.

## New Pricing Model

### Plans
1. **Free** (`free`)
   - Monthly price: $0
   - Transaction fee: 7%
   - Active listing limit: 3

2. **Pro** (`pro`)
   - Monthly price: $49/month
   - Transaction fee: 6%
   - Active listing limit: 10

3. **Elite** (`elite`)
   - Monthly price: $199/month
   - Transaction fee: 4%
   - Active listing limit: Unlimited

## Files Changed

### Core Configuration
1. **`lib/pricing/plans.ts`** (NEW)
   - Single source of truth for plan definitions
   - `PLAN_CONFIG` constant with all plan details
   - Helper functions: `getPlanConfig()`, `getPlanTakeRate()`, `getPlanListingLimit()`, `canCreateListing()`, etc.
   - Backward compatibility: Maps old plan names (`ranch`, `broker`, `starter`) to new ones

2. **`lib/types.ts`**
   - Added `subscriptionPlan?: string` field to `UserProfile` interface
   - Defaults to `'free'` if not set

3. **`lib/stripe/config.ts`**
   - Added `calculatePlatformFeeForPlan()` function
   - Uses plan-based take rate instead of hardcoded 5%
   - Kept old `calculatePlatformFee()` for backward compatibility

### API Routes
4. **`app/api/stripe/checkout/create-session/route.ts`**
   - Fetches seller's `subscriptionPlan` from user profile
   - Uses `calculatePlatformFeeForPlan()` to calculate fees based on plan
   - Stores plan-based fees in metadata

### Listing Management
5. **`lib/firebase/listings.ts`**
   - Updated `publishListing()` to check listing limits before publishing
   - Counts active listings for the seller
   - Enforces plan-based limits (Free: 3, Pro: 10, Elite: unlimited)
   - Throws descriptive error if limit reached

### UI Updates
6. **`app/pricing/page.tsx`**
   - Updated pricing tiers to use `PLAN_CONFIG`
   - Changed "Starter" to "Free"
   - Changed "Ranch / Broker" to "Elite"
   - Updated features to show actual listing limits and transaction fees
   - Updated listing fees section to show "4-7% (varies by plan)"

7. **`app/seller/payouts/page.tsx`**
   - Updated fee display from "5%" to "4-7% (varies by plan)"
   - Updated description to mention plan-based fees

8. **`app/dashboard/admin/payouts/page.tsx`**
   - Updated fee references from "5%" to "Platform fee (varies by seller plan)"

9. **`app/seller/settings/page.tsx`**
   - Updated mock subscription data to reflect new model
   - Updated display to handle unlimited listings

## PLAN_CONFIG Location

**File:** `lib/pricing/plans.ts`

The `PLAN_CONFIG` constant is the single source of truth for all plan definitions:
- Plan IDs: `'free' | 'pro' | 'elite'`
- Display names
- Monthly prices
- Transaction fees (take rates)
- Listing limits

## Backward Compatibility

### Plan Name Mapping
The `getPlanConfig()` function handles backward compatibility by mapping old plan names to new ones:

- `'ranch'` → `'elite'`
- `'broker'` → `'elite'`
- `'ranch / broker'` → `'elite'`
- `'starter'` → `'free'`

### Default Behavior
- If `subscriptionPlan` is not set on a user profile, it defaults to `'free'`
- Old fee calculation (`calculatePlatformFee()`) still exists but uses 5% (legacy)
- New code uses `calculatePlatformFeeForPlan()` which respects the user's plan

## Listing Limit Enforcement

### How It Works
1. When a user tries to publish a listing, `publishListing()` is called
2. The function:
   - Fetches the user's profile to get their `subscriptionPlan`
   - Counts their current active listings (status === 'active')
   - Checks if they can create more using `canCreateListing(planId, activeListingsCount)`
   - Throws an error with upgrade instructions if limit reached

### Active Listings Count
- Only listings with `status === 'active'` are counted
- Draft listings do NOT count toward the limit (existing behavior preserved)
- The count is done via Firestore query: `where('sellerId', '==', uid).where('status', '==', 'active')`

## Fee Calculation

### Before
- Hardcoded 5% platform fee for all sellers

### After
- Plan-based fees:
  - Free: 7%
  - Pro: 6%
  - Elite: 4%
- Fees are calculated in `calculatePlatformFeeForPlan(amount, planId)`
- Used in checkout session creation to set correct fees

## Remaining Work / Notes

### Not Changed (Intentionally)
- Buyer-side fees, transport, or insurance (seller-side only per requirements)
- Database schema (added optional `subscriptionPlan` field, backward compatible)
- Existing listing status logic (only updated numeric caps)

### Potential Future Work
- Subscription management UI (currently plans are set manually in user profile)
- Stripe subscription integration (if needed for paid plans)
- Plan upgrade/downgrade flows
- Email notifications for plan limits

### Leftover References
- Some hardcoded "5%" references may still exist in comments or documentation
- Mock data in `app/seller/settings/page.tsx` still uses mock subscription data (needs real integration)
- Admin payout page shows "varies by seller plan" but doesn't show the actual plan for each order

## Testing Checklist

- [ ] Verify Free plan users can create 3 active listings
- [ ] Verify Free plan users get error when trying to publish 4th listing
- [ ] Verify Pro plan users can create 10 active listings
- [ ] Verify Elite plan users have unlimited listings
- [ ] Verify transaction fees are calculated correctly (7%, 6%, 4%)
- [ ] Verify backward compatibility (old "ranch" plan users get Elite features)
- [ ] Verify pricing page displays correct information
- [ ] Verify listing limit error messages are clear and mention upgrade

## Build Status

The code compiles successfully. There are some unrelated Next.js module resolution warnings that don't affect functionality.
