# Bids & Offers Data Isolation Audit

**Date:** 2026-01-26  
**Context:** User reports (1) bids that aren’t theirs appearing in Bids & Offers → Bids tab, and (2) their own bid not appearing.

## Findings

### 1. API data isolation

- **`GET /api/bids/mine`**: Uses JWT `uid` only. Queries `bids` with `bidderId == uid` and `autoBids` (collection group) with `userId == uid`. All listingIds come from those queries. No cross-user data possible at query level.
- **`GET /api/offers/mine`**: `buyerId == uid`. Scoped to current user.
- **`GET /api/offers/seller`**: `sellerId == uid`. Scoped to current user.

### 2. Client

- **Bids & Offers page**: Calls `getMyBids`, `getMyOffers`, `getSellerOffers` with current user token. Renders **Bids** tab from `rows.filter(r => r.type === 'bid')` only (offers excluded). **Offers** tab from `type === 'offer'` only.

### 3. Possible causes of “wrong bids” / “my bid missing”

1. **Stale state on logout**: If user A logs out and user B logs in (shared device), old bids could remain in React state until next load. **Fix:** Clear `bids` and `offers` when `!user && !authLoading`.
2. **GET response caching**: Cached `GET /api/bids/mine` or offers could serve another user’s data if cache is keyed poorly. **Fix:** `Cache-Control: no-store, no-cache, must-revalidate` on these endpoints.
3. **autoBids skipped**: `collectionGroup('autoBids')` had no index. Query failed, we caught and skipped autoBids. Users with **max-bid-only** (no visible bid doc) then see no row for that listing. **Fix:** Add `autoBids` collection group indexes; log when we skip autoBids.

## Fixes applied

| Fix | Location |
|-----|----------|
| **autoBids indexes** | `firestore.indexes.json`: `autoBids` collection group on `userId`; `userId` + `enabled` |
| **Cache-Control** | `app/api/bids/mine/route.ts`: all responses; `app/api/offers/mine` and `seller`: success responses |
| **Clear on logout** | `app/dashboard/bids-offers/page.tsx`: `useEffect` clears `bids` and `offers` when `!user && !authLoading` |
| **Log autoBids skip** | `app/api/bids/mine/route.ts`: `console.warn` when collection group fails |

## Verification

1. **Logout clear**: Log in → open Bids & Offers → log out. Bids/offers UI should clear (or redirect).
2. **No cache**: DevTools → Network → `/api/bids/mine` → response headers include `Cache-Control: no-store, ...`.
3. **autoBids**: Deploy indexes; place max bid only (no price move). Row should appear in Bids tab. If not, check logs for `[bids/mine] autoBids collectionGroup skipped`.

## Deploy

- Run `npx firebase deploy --only firestore:indexes` to create `autoBids` indexes (if using Firebase CLI).
- Redeploy app for API and client changes.
