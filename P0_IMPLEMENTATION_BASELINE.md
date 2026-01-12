# P0 Implementation - As-Is Baseline Map

**Date:** January 12, 2026  
**Status:** Pre-P0 Implementation

---

## 1. Browse Data Flow

### Current Implementation
- **File:** `app/browse/page.tsx`
- **Fetch:** `listActiveListings({ limitCount: 50 })` from `lib/firebase/listings.ts`
- **Query:** Firestore query with `where('status', '==', 'active')` + `orderBy('createdAt', 'desc')` + `limit(50)`
- **Filtering:** **100% CLIENT-SIDE** in `useMemo` hook (lines 80-200)
  - Type filter (client-side)
  - Category filter (client-side)
  - Location filter (client-side)
  - Price range filter (client-side)
  - Search query (client-side string matching)
  - Sorting (client-side)
- **Pagination:** ❌ **NONE** - Hard limit of 50 listings
- **Indexes:** Only one composite index exists: `status + createdAt`

### Data Flow
```
Browse Page Load
  → useEffect triggers
  → listActiveListings() fetches ALL 50 active listings
  → setListings(data) stores in state
  → filteredListings useMemo filters 50 items in browser
  → UI renders filtered results
```

**Problem:** Will break at 100+ listings, no pagination, all filtering in browser.

---

## 2. Favorites Flow

### Current Implementation
- **File:** `hooks/use-favorites.ts`
- **Storage:** **localStorage ONLY** (`wildlife-exchange-favorites`)
- **No Firestore:** ❌ No `/watchlist` or `/users/{uid}/watchlist` collection
- **No Sync:** ❌ Not synced across devices
- **No Auth Check:** Works same for logged in/out users

### Data Flow
```
User clicks favorite
  → toggleFavorite(listingId)
  → Updates useState Set
  → useEffect saves to localStorage
  → No Firestore write
  → No cross-device sync
```

**Problem:** Favorites lost on different device, not synced with user account.

---

## 3. Firestore Collections Currently Used

### ✅ Implemented Collections

1. **`/users/{userId}`**
   - Created on registration
   - Updated via profile completion
   - Fields: userId, email, displayName, profile, seller, createdAt, updatedAt

2. **`/listings/{listingId}`**
   - Created via `createListingDraft()` ✅
   - Published via `publishListing()` ✅
   - Read via `listActiveListings()` ✅
   - Read via `getListingById()` ✅
   - Updated via `updateListing()` ✅
   - Fields: title, description, type, category, status, price, sellerId, sellerSnapshot, location, trust, metadata, metrics, createdAt, updatedAt

### ❌ Missing Collections

- `/bids/{bidId}` - Not created
- `/orders/{orderId}` - Not created
- `/watchlist/{docId}` - Not created
- `/users/{uid}/watchlist/{listingId}` - Not created
- `/messages/{messageId}` - Not created

---

## 4. Mock Implementations

### 🔴 Critical Mocks (Must Fix)

1. **Bid Placement** (`app/listing/[id]/page.tsx:165`)
   ```typescript
   // TODO: Implement bid placement in Phase 2
   setTimeout(() => {
     toast({ title: 'Bid placed successfully' });
   }, 1000);
   ```
   - **Status:** Mock with setTimeout
   - **Impact:** Bids don't actually save

2. **Buy Now** (`app/listing/[id]/page.tsx:179`)
   ```typescript
   // TODO: Implement buy now in Phase 2 (orders/payments)
   toast({ title: 'Coming soon' });
   ```
   - **Status:** Mock toast only
   - **Impact:** Can't actually purchase

### ⚠️ Mock Data Imports

1. **Insurance Tiers** (`app/listing/[id]/page.tsx:53`)
   ```typescript
   import { insuranceTiers } from '@/lib/mock-data';
   ```
   - **Status:** Used in production UI
   - **Impact:** Mock data shown to users

2. **Bid History** (`components/auction/BidHistory.tsx:50`)
   - Uses `mockBids` if no bids prop provided
   - **Status:** Shows fake bid history

### 📁 Mock Data Files

- `lib/mock-data.ts` - Contains `mockListings` and `insuranceTiers`
- `lib/seller-mock-data.ts` - Contains seller mock data
- **Status:** Still in codebase, may be imported

---

## 5. Duplicate Dashboards

### Current Structure

1. **`/dashboard`** (`app/dashboard/page.tsx`)
   - **Action:** Redirects to `/seller/overview`
   - **Sub-routes:**
     - `/dashboard/listings/new` - Create listing ✅
     - `/dashboard/orders` - Orders page (empty/mock)
     - `/dashboard/account` - Account page

2. **`/seller`** (`app/seller/page.tsx`)
   - **Sub-routes:**
     - `/seller/overview` - Seller overview
     - `/seller/listings` - Listings management
     - `/seller/listings/new` - Create listing (duplicate?)
     - `/seller/listings/[id]/edit` - Edit listing
     - `/seller/sales` - Sales page
     - `/seller/logistics` - Logistics page
     - `/seller/messages` - Messages page
     - `/seller/payouts` - Payouts page
     - `/seller/reputation` - Reputation page
     - `/seller/settings` - Settings page

### Duplication Issues

- `/dashboard/listings/new` vs `/seller/listings/new` - Both exist
- `/dashboard` redirects to `/seller/overview` - Confusing navigation
- Two separate layouts: `app/dashboard/layout.tsx` and `app/seller/layout.tsx`

**Recommendation:** Consolidate to single `/dashboard` route (P1, not P0).

---

## 6. Error Handling

### Current State

- ❌ **No error boundaries** - No `app/error.tsx`
- ❌ **No not-found page** - No `app/not-found.tsx`
- ⚠️ **Silent catches** - Some errors logged but not shown to user
- ✅ **Try-catch blocks** - Most async operations wrapped
- ⚠️ **Generic error messages** - Technical errors shown to users

### Example Issues

```typescript
// app/browse/page.tsx:70
catch (err) {
  console.error('Error fetching listings:', err);
  setError(err instanceof Error ? err.message : 'Failed to load listings');
}
// Error shown in UI, but no error boundary if component crashes
```

---

## 7. Security Rules Status

### Current State

- ❌ **No `firestore.rules` file** - Rules documented in `FIRESTORE_SECURITY_RULES.md` but NOT deployed
- ⚠️ **Rules exist in docs** - `FIRESTORE_SECURITY_RULES.md` has rules but they're not active
- ❌ **Default rules likely active** - Database may be open or have default rules

### Required Rules (from docs)

- `/users/{uid}` - Read: authenticated, Write: own document only
- `/listings/{listingId}` - Read: active OR owner, Write: owner only
- `/watchlist` - Not implemented yet

---

## Summary

### ✅ What Works
- User authentication and profiles
- Listing creation and publishing
- Listing display (browse, detail pages)
- Basic Firestore integration

### 🔴 Critical Gaps (P0)
1. No Firestore security rules deployed
2. No error boundaries (white screen crashes)
3. Client-side filtering only (will break at scale)
4. No pagination (hard limit 50)
5. Favorites in localStorage only (not synced)
6. Mock bid/buy implementations
7. Mock data files still imported

### ⚠️ Medium Priority (P1)
- Duplicate dashboards
- No real-time updates
- No search indexing
- No payment processing

---

**Next:** Implement P0.1 - Firestore Security Rules
