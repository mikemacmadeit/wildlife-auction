# Firebase Audit Report — Wildlife Exchange

**Audit Date:** 2025-01-26  
**Scope:** Firestore, Firebase Auth, Storage, Indexes, Admin SDK, Observability, Cost/Quota  
**Constraints:** No large rewrites; minimal, surgical fixes only.

---

## 1. Executive Summary

| Metric | Value |
|--------|--------|
| **Overall score** | 72 / 100 |
| **Ship verdict** | **Conditional ship** — Address High/Critical findings before production scale. |

**Summary:** The Wildlife Exchange Firebase setup is broadly solid: Firestore rules are detailed and enforce server-controlled fields, Admin SDK is used correctly for sensitive writes, and critical flows (checkout, bids, offers) use transactions or idempotency. Gaps include: **invalid Firestore query** (dispute packet `messages` collection), **missing `orderBy`** causing failed scheduled job (order delivery check-in), **missing composite indexes** for several queries, **leftover debug instrumentation** (fetch to `127.0.0.1:7242`), **empty `catch` blocks** swallowing errors in webhook handlers, and **no orphan Storage cleanup** when listing create/publish fails. Fixing these will materially reduce production risk.

---

## 2. Collections & Usage

| Collection / Path | Used by | Rules |
|-------------------|--------|-------|
| `users` | Client + API | Owner/admin read; owner write with allowlist |
| `publicProfiles` | Client | Public read; owner write, allowlist |
| `publicSellerTrust` | Client | Public read; write false (server-only) |
| `users/{uid}/photos`, `watchlist`, `savedSearches`, `notifications`, `helpFlags`, `notificationPreferences`, `pushTokens`, `following`, `followers` | Client + API | Owner-only or server-only as designed |
| `listings` + `documents`, `autoBids` | Client + API + Netlify | Read active/sold/ended + owner/admin; create draft, update allowlist |
| `listings/{id}/purchaseReservations` | API (checkout, wire, webhook) | Not in rules → deny; Admin SDK only ✓ |
| `listings/{id}/watchers` | API (watchlist toggle) | Not in rules → deny; Admin SDK only ✓ |
| `bids` | API | Read auth; create/update/delete false (server-only) ✓ |
| `orders` + `documents` | API + Netlify | Read buyer/seller/admin; create false; update allowlist |
| `offers` | API | Read buyer/seller/admin; create/update/delete false ✓ |
| `messageThreads` + `messages` | Client + API | Participant create/read; participant-limited updates |
| `sellerPermits` | Client + API | Owner + admin read; owner create pend, admin update |
| `stripeEvents`, `checkoutSessions`, `orderReminders`, `opsHealth`, `chargebacks`, `auditLogs` | API + Netlify | Deny or not referenced → Admin SDK only ✓ |
| `events`, `emailJobs`, `pushJobs`, `smsJobs`, `notificationRateLimits`, *DeadLetters | API + Netlify | Admin read; write false ✓ |
| `userSummaries`, `adminUserNotes` + `notes` | Admin API | Admin read; write false ✓ |
| `supportTickets` + `messages` | API | Not in rules → deny; Admin SDK only ✓ |
| `knowledgeBaseArticles` | Admin API | Not in rules → deny; Admin SDK only ✓ |
| `notifications` (top-level) | — | Legacy; app uses `users/{uid}/notifications` |

---

## 3. Findings Table

| # | Severity | Area | What breaks | Repro | Files | Fix |
|---|----------|------|-------------|-------|-------|-----|
| F1 | **Critical** | Firestore | Dispute packet queries non-existent `messages` collection; order messages live in `messageThreads/{id}/messages`. | Admin opens dispute packet for an order. | `app/api/orders/[orderId]/dispute-packet/route.ts` | Query `messageThreads` by `listingId`+`buyerId`+`sellerId` (from order), then that thread’s `messages` subcollection. Remove top-level `messages` query. |
| F2 | **Critical** | Firestore | `orderDeliveryCheckIn` uses `where('deliveryConfirmedAt', '<=', cutoff)` with no `orderBy`. Firestore requires `orderBy` on inequality field. | Scheduled job runs; fails with `failed-precondition` or similar. | `netlify/functions/orderDeliveryCheckIn.ts` | Add `.orderBy('deliveryConfirmedAt', 'asc')` before `.limit()`. Add composite index on `orders`: `deliveryConfirmedAt` ASC. |
| F3 | **High** | Indexes | `update-seller-snapshots` uses `listings` `sellerId` + `orderBy('updatedAt','desc')`. No index. | Run update-seller-snapshots; query fails. | `app/api/listings/update-seller-snapshots/route.ts`, `firestore.indexes.json` | Add composite index: `listings` — `sellerId` ASC, `updatedAt` DESC. |
| F4 | **High** | Indexes | `expireListings` fallback uses `listings` `status` + `orderBy('updatedAt','desc')`. Index may be missing. | Primary `endAt` index missing; fallback runs and fails. | `netlify/functions/expireListings.ts`, `firestore.indexes.json` | Ensure index: `listings` — `status` ASC, `updatedAt` DESC. |
| F5 | **High** | Indexes | `auctionEndingSoon` fallback uses `collectionGroup('watchlist').where('listingId','==',id)`. No collection group index. | Watchers use legacy path; fallback runs and fails. | `netlify/functions/auctionEndingSoon.ts`, `firestore.indexes.json` | Add collection group index: `watchlist` — `listingId` ASC. |
| F6 | **High** | Observability | Debug `fetch('http://127.0.0.1:7242/ingest/...')` left in checkout + listing page. | Every checkout/listening view hits local debug server; noise/failures. | `app/api/stripe/checkout/create-session/route.ts`, `app/listing/[id]/page.tsx` | Remove all `#region agent log` / `fetch('http://127.0.0.1:7242/...')` blocks. |
| F7 | **High** | Observability | Empty `catch {}` in Stripe webhook handlers swallow errors. | Webhook handler fails; no log, no Sentry, hard to debug. | `app/api/stripe/webhook/handlers.ts` | Replace with `catch (e) { captureException(...); throw e; }` or log + rethrow. |
| F8 | **Medium** | Storage | No delete of listing images/docs if create or publish fails after upload. | User uploads images, publish fails; orphaned Storage objects. | `lib/firebase/storage.ts`, `app/api/listings/publish/route.ts` (or create flow) | On publish/create failure after uploads, call delete for uploaded paths (best-effort). Optional: scheduled cleanup for orphans. |
| F9 | **Medium** | Storage | Order/listing document uploads have no client-side size limit. | Very large uploads; cost, timeouts, Storage rules may not enforce. | `lib/firebase/storage-documents.ts`, `lib/firebase/message-attachments` | Enforce max size (e.g. 10–15 MB) before `uploadBytesResumable`; return clear error. |
| F10 | **Medium** | Admin SDK | `admin-helper.ts` uses `require('firebase-admin')` + `serviceAccountKey.json`; unused by API. Duplicate init pattern. | Confusion; accidental use could bypass env-based init. | `lib/firebase/admin-helper.ts` | Prefer deprecating or removing; use `lib/firebase/admin.ts` only. |
| F11 | **Low** | Rules | `listings/{id}/watchers` not explicitly in rules (deny by default). Relies on Admin-only writes. | None; current use is Admin-only. | `firestore.rules` | Optional: add explicit `match /listings/{id}/watchers/{uid}` with read/write false for clarity. |
| F12 | **Low** | Auth | Token refresh before checkout is best-effort; no forced refresh immediately before create-session. | Rare stale token near expiry could 401. | `app/api/stripe/checkout/create-session/route.ts`, `lib/stripe/api.ts` | Ensure `getIdToken(forceRefresh: true)` (or equivalent) immediately before checkout API call. |

---

## 4. Top 10 Fixes (Prioritized)

1. **F1** — Fix dispute-packet messages source (use message threads).
2. **F2** — Add `orderBy('deliveryConfirmedAt','asc')` + index for order delivery check-in.
3. **F6** — Remove debug `fetch` instrumentation from checkout + listing page.
4. **F7** — Replace empty `catch` in webhook handlers with log + capture + rethrow.
5. **F3** — Add `listings` index `sellerId` + `updatedAt` for update-seller-snapshots.
6. **F4** — Ensure `listings` index `status` + `updatedAt` for expireListings fallback.
7. **F5** — Add `watchlist` collection group index for auctionEndingSoon fallback.
8. **F8** — Orphan Storage cleanup on create/publish failure (best-effort).
9. **F9** — Client-side file size limit for document uploads.
10. **F10** — Deprecate or remove `admin-helper.ts`; use `admin.ts` only.

---

## 5. Index Changes Required

Add the following to `firestore.indexes.json` (inside the `indexes` array). Omit any that already exist.

### 5.1 Orders — `deliveryConfirmedAt` (for orderDeliveryCheckIn)

```json
{
  "collectionGroup": "orders",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "deliveryConfirmedAt", "order": "ASCENDING" }
  ]
}
```

### 5.2 Listings — `sellerId` + `updatedAt` (for update-seller-snapshots)

```json
{
  "collectionGroup": "listings",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "sellerId", "order": "ASCENDING" },
    { "fieldPath": "updatedAt", "order": "DESCENDING" }
  ]
}
```

### 5.3 Listings — `status` + `updatedAt` (for expireListings fallback)

```json
{
  "collectionGroup": "listings",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "updatedAt", "order": "DESCENDING" }
  ]
}
```

### 5.4 Watchlist collection group (for auctionEndingSoon fallback)

```json
{
  "collectionGroup": "watchlist",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "listingId", "order": "ASCENDING" }
  ]
}
```

**Note:** Verify `status` + `updatedAt` for `listings` is not already present; if it is, skip 5.3.

---

## 6. Rules Changes Required

### 6.1 Explicit `watchers` subcollection (optional, low priority)

Add under `match /listings/{listingId}` (before the closing `}` of that block):

```c
// ============================================
// LISTING WATCHERS (SERVER-AUTHORED)
// ============================================
// /listings/{listingId}/watchers/{userId}
// Written only by Admin SDK (watchlist toggle). No client access.
match /watchers/{userId} {
  allow read, write: if false;
}
```

**Note:** Path must be `match /listings/{listingId}/watchers/{userId}`; the snippet above is conceptual. Adjust to your rules structure.

### 6.2 No other rules changes required

- Server-only collections (`checkoutSessions`, `orderReminders`, `stripeEvents`, etc.) correctly rely on deny-by-default.
- `users`, `listings`, `orders`, `offers`, `bids`, `messageThreads`, etc. already have appropriate allowlists and validation.

---

## 7. Query / Index Consistency Notes

- **Bounded queries:** All audited queries use `limit()`; no unbounded reads found.
- **Pagination:** Browse, admin orders, update-seller-snapshots use `startAfter` appropriately.
- **Transactions:** Checkout, watchlist toggle, offer create/accept, bid place use transactions or idempotency.
- **Index coverage:** Main gaps are F2–F5 above; elsewhere indexes align with usage.

---

## 8. Cost / Quota Risks

- **Hot collections:** `listings`, `orders`, `users` are hottest; queries are bounded and paginated.
- **Fan-out writes:** Watchlist toggle updates listing doc + watchlist + watchers; acceptable.
- **Unbounded queries:** None identified.
- **Recommendation:** Monitor read/write usage per collection in Firebase Console; set budgets if needed.

---

## 9. Auth & Admin SDK

- **Token verification:** API routes that require auth use `getAdminAuth().verifyIdToken()` (or equivalent) and validate `uid`.
- **Admin routes:** Use `requireAdmin` / `requireSuperAdmin`; check token claims + user doc `role` / `superAdmin`.
- **Stripe webhook:** Correctly does not use Firebase Auth; validates Stripe signature.
- **Secrets:** Admin SDK uses env vars / bundled service account; no secrets logged. `capture` sanitizes context.

---

## 10. Storage

- **Paths:** `listings/{id}/images`, `listings/{id}/documents`, `orders/{id}/documents`, `users/{id}/uploads`, `messageThreads/{id}/attachments`, `seller-permits/{id}/...` align with rules.
- **Listing delete:** `app/api/listings/[id]/delete/route.ts` deletes listing images and documents; good.
- **Gaps:** Orphan cleanup on create/publish failure (F8); file size limits for docs (F9).

---

## 11. Verification Checklist (High-Level)

- [ ] Dispute packet returns messages from the correct message thread (F1).
- [ ] `orderDeliveryCheckIn` scheduled job runs without Firestore errors (F2).
- [ ] Update-seller-snapshots and expireListings (incl. fallback) succeed (F3, F4).
- [ ] auctionEndingSoon fallback works when watchers use legacy path (F5).
- [ ] No `fetch` to `127.0.0.1:7242` in checkout or listing page (F6).
- [ ] Webhook handler errors are logged and sent to Sentry (F7).
- [ ] Orphan Storage cleanup runs on publish failure (F8); document uploads reject oversized files (F9).

---

*End of report. See `FIREBASE_HARDENING_PLAN.md` for fix cards, batching, and step-by-step verification.*
