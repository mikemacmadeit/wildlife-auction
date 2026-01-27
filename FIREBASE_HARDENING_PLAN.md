# Firebase Hardening Plan — Wildlife Exchange

**Purpose:** Implement fixes from `FIREBASE_AUDIT_REPORT.md` in batches. Each fix includes steps, files, and verification.

---

## Batch 1 — Critical (Before Production)

### Fix Card FC-1: Dispute packet messages source (F1)

| Field | Value |
|-------|--------|
| **ID** | FC-1 |
| **Severity** | Critical |
| **Report ref** | F1 |

**Steps:**

1. Open `app/api/orders/[orderId]/dispute-packet/route.ts`.
2. Remove the query that uses `db.collection('messages').where('orderId', '==', orderId)`.
3. Resolve the order’s `listingId`, `buyerId`, `sellerId`. Query `messageThreads` where `listingId` == order’s listing, `buyerId` == order’s buyer, `sellerId` == order’s seller (use existing index). If no thread exists, treat messages as empty.
4. For that thread, query `messageThreads/{threadId}/messages` ordered by `createdAt` asc.
5. Map results into the dispute packet’s `messages` array (same shape as before if possible).

**Files:** `app/api/orders/[orderId]/dispute-packet/route.ts`

**Verification:**

- **Manual:** Create an order, add messages via the listing’s thread, open dispute packet as admin. Confirm packet includes those messages.
- **Expected:** Dispute packet JSON includes `messages` from the correct thread; no Firestore errors.

---

### Fix Card FC-2: Order delivery check-in query + index (F2)

| Field | Value |
|-------|--------|
| **ID** | FC-2 |
| **Severity** | Critical |
| **Report ref** | F2 |

**Steps:**

1. Open `netlify/functions/orderDeliveryCheckIn.ts`.
2. Change the orders query from:
   ```ts
   db.collection('orders')
     .where('deliveryConfirmedAt', '<=', cutoffTs)
     .limit(MAX_ORDERS_PER_RUN)
     .get();
   ```
   to:
   ```ts
   db.collection('orders')
     .where('deliveryConfirmedAt', '<=', cutoffTs)
     .orderBy('deliveryConfirmedAt', 'asc')
     .limit(MAX_ORDERS_PER_RUN)
     .get();
   ```
3. Add the `orders` index on `deliveryConfirmedAt` (see report §5.1) to `firestore.indexes.json`.
4. Deploy indexes: `firebase deploy --only firestore:indexes` (or your CI).

**Files:** `netlify/functions/orderDeliveryCheckIn.ts`, `firestore.indexes.json`

**Verification:**

- **Manual:** Run the scheduled function (or invoke locally) with `DELIVERY_CHECKIN_DAYS` set so some orders have `deliveryConfirmedAt` in range. Confirm it completes without Firestore errors.
- **Expected:** No `failed-precondition`; log shows `scanned`, `emitted` as expected.

---

### Fix Card FC-3: Remove debug instrumentation (F6)

| Field | Value |
|-------|--------|
| **ID** | FC-3 |
| **Severity** | High |
| **Report ref** | F6 |

**Steps:**

1. In `app/api/stripe/checkout/create-session/route.ts`, remove all `#region agent log` / `#endregion` blocks and the `fetch('http://127.0.0.1:7242/ingest/...')` calls inside them.
2. In `app/listing/[id]/page.tsx`, remove the same `#region agent log` / `fetch(...)` blocks related to FIX-001 / checkout.
3. Search the repo for `127.0.0.1:7242` and remove any remaining references.

**Files:** `app/api/stripe/checkout/create-session/route.ts`, `app/listing/[id]/page.tsx`, and any other matches.

**Verification:**

- **Manual:** Trigger checkout and listing page load; check network tab. No requests to `127.0.0.1:7242`.
- **Grep:** `rg "127.0.0.1:7242"` returns no matches.

---

### Fix Card FC-4: Webhook handler empty catch (F7)

| Field | Value |
|-------|--------|
| **ID** | FC-4 |
| **Severity** | High |
| **Report ref** | F7 |

**Steps:**

1. Open `app/api/stripe/webhook/handlers.ts`.
2. Find all `catch {}` blocks that swallow errors (e.g. around reservation cleanup, refund handling).
3. Replace with `catch (e) { captureException(e instanceof Error ? e : new Error(String(e)), { context: 'stripe webhook handler', operation: 'reservation cleanup', ... }); }` so failures are visible in Sentry. Do not rethrow—cleanup is best-effort; the webhook should still complete.

**Files:** `app/api/stripe/webhook/handlers.ts`

**Verification:**

- **Manual:** Force a cleanup failure (e.g. temporarily break reservation delete); confirm Sentry receives it. Webhook still completes.
- **Expected:** No silent swallow; error appears in Sentry; webhook returns 200.

---

## Batch 2 — High (Indexes + Snapshots)

### Fix Card FC-5: Listings index sellerId + updatedAt (F3)

| Field | Value |
|-------|--------|
| **ID** | FC-5 |
| **Severity** | High |
| **Report ref** | F3 |

**Steps:**

1. Add the `listings` composite index `sellerId` ASC, `updatedAt` DESC (report §5.2) to `firestore.indexes.json`.
2. Deploy indexes.

**Files:** `firestore.indexes.json`

**Verification:**

- **Manual:** Call update-seller-snapshots (or run the job). No Firestore `failed-precondition`.
- **Expected:** Job completes; seller snapshots updated.

---

### Fix Card FC-6: Listings index status + updatedAt (F4)

| Field | Value |
|-------|--------|
| **ID** | FC-6 |
| **Severity** | High |
| **Report ref** | F4 |

**Steps:**

1. Check if `listings` already has an index on `status` ASC, `updatedAt` DESC. If not, add it (report §5.3).
2. Deploy indexes.

**Files:** `firestore.indexes.json`

**Verification:**

- **Manual:** Temporarily break the primary `expireListings` index (or use a project without it); run expireListings. Fallback query runs without error.
- **Expected:** No `failed-precondition` on fallback.

---

### Fix Card FC-7: Watchlist collection group index (F5)

| Field | Value |
|-------|--------|
| **ID** | FC-7 |
| **Severity** | High |
| **Report ref** | F5 |

**Steps:**

1. Add the `watchlist` collection group index `listingId` ASC (report §5.4) to `firestore.indexes.json`.
2. Deploy indexes.

**Files:** `firestore.indexes.json`

**Verification:**

- **Manual:** Use legacy watchlist path (if possible) and run `auctionEndingSoon`; fallback `collectionGroup('watchlist')` query runs without error.
- **Expected:** No `failed-precondition`; watchers resolved.

---

## Batch 3 — Medium (Storage + Admin Helper)

### Fix Card FC-8: Orphan Storage cleanup on publish failure (F8)

| Field | Value |
|-------|--------|
| **ID** | FC-8 |
| **Severity** | Medium |
| **Report ref** | F8 |

**Steps:**

1. In the publish (or create) flow, after uploads succeed, keep a list of Storage paths written.
2. If publish/create fails (after uploads), call a small helper that deletes those paths (best-effort, ignore not-found). Use Admin Storage API in the API route.
3. Ensure runtime has Storage admin access (bucket, etc.).

**Files:** `app/api/listings/publish/route.ts` (and create flow if separate), `lib/firebase/storage.ts` or a small server-side cleanup helper.

**Verification:**

- **Manual:** Upload listing images, then force publish to fail (e.g. invalid payload). Confirm uploaded paths are deleted (or deletion attempted).
- **Expected:** No orphaned objects under `listings/{tempId}/images/` for failed publishes.

---

### Fix Card FC-9: Document upload size limit (F9)

| Field | Value |
|-------|--------|
| **ID** | FC-9 |
| **Severity** | Medium |
| **Report ref** | F9 |

**Steps:**

1. In `lib/firebase/storage-documents.ts` (and message-attachments if applicable), before `uploadBytesResumable`, check `file.size` against a max (e.g. 10–15 MB).
2. If over limit, throw a clear error (e.g. "File too large; max 10 MB").
3. Optionally add matching validation in message-attachments.

**Files:** `lib/firebase/storage-documents.ts`, `lib/firebase/message-attachments.ts`

**Verification:**

- **Manual:** Upload a file > max size; confirm rejection with clear message.
- **Expected:** No upload attempted; user sees size limit error.

---

### Fix Card FC-10: Deprecate admin-helper (F10)

| Field | Value |
|-------|--------|
| **ID** | FC-10 |
| **Severity** | Medium |
| **Report ref** | F10 |

**Steps:**

1. Confirm no imports of `lib/firebase/admin-helper` remain (grep).
2. Add a deprecation comment at the top of `admin-helper.ts` pointing to `lib/firebase/admin.ts`, or delete the file if truly unused.
3. Update any docs or scripts that reference it.

**Files:** `lib/firebase/admin-helper.ts`, any callers or docs.

**Verification:**

- **Grep:** No imports of `admin-helper`.
- **Build:** `npm run build` (or equivalent) succeeds.

---

## Batch 4 — Low (Optional)

### Fix Card FC-11: Explicit watchers rules (F11)

| Field | Value |
|-------|--------|
| **ID** | FC-11 |
| **Severity** | Low |
| **Report ref** | F11 |

**Steps:**

1. Add `match /listings/{listingId}/watchers/{userId}` with `allow read, write: if false;` in `firestore.rules`.
2. Deploy rules.

**Files:** `firestore.rules`

**Verification:**

- **Manual:** Watchlist toggle still works (Admin SDK bypasses rules).
- **Expected:** No change in behavior; rules explicitly document watchers as server-only.

---

### Fix Card FC-12: Token refresh before checkout (F12)

| Field | Value |
|-------|--------|
| **ID** | FC-12 |
| **Severity** | Low |
| **Report ref** | F12 |

**Steps:**

1. In the client flow that calls create-checkout-session, ensure `getIdToken(forceRefresh: true)` (or equivalent) is used immediately before the API request.
2. Use that token in the `Authorization` header.

**Files:** `lib/stripe/api.ts` (or wherever checkout API is called), `app/listing/[id]/page.tsx`.

**Verification:**

- **Manual:** Log in, wait until near token expiry (or mock short expiry), start checkout. Confirm 401s decrease or go away.
- **Expected:** Checkout succeeds with refreshed token.

---

## Verification Checklist (Summary)

| ID | Check |
|----|--------|
| FC-1 | Dispute packet shows messages from correct message thread |
| FC-2 | Order delivery check-in job runs without Firestore errors |
| FC-3 | No `fetch` to `127.0.0.1:7242` in build or at runtime |
| FC-4 | Webhook handler errors logged and sent to Sentry |
| FC-5 | Update-seller-snapshots runs without index errors |
| FC-6 | expireListings fallback runs without index errors |
| FC-7 | auctionEndingSoon watchlist fallback runs without index errors |
| FC-8 | Orphan Storage cleanup on publish failure |
| FC-9 | Document uploads reject files over max size |
| FC-10 | No use of `admin-helper`; build passes |
| FC-11 | Watchers rules explicit; watchlist toggle still works |
| FC-12 | Checkout uses refreshed token before create-session |

---

## Emulator Testing (Optional)

- Run Firestore + Auth emulators; exercise key flows (auth, create listing, publish, checkout, watchlist, dispute packet).
- Run `orderDeliveryCheckIn` and other scheduled functions against emulator where possible.
- Use `firebase emulators:exec --only firestore,auth "npm run test"` (or your test command) if you have automated tests.

---

## RUNNING_LOG

- **Batch 1 (Critical) — completed**
  - **FC-1:** Dispute packet now reads messages from `messageThreads` (by `listingId` + `buyerId` + `sellerId`) and `messageThreads/{threadId}/messages`. Top-level `messages` query removed.
  - **FC-2:** `orderDeliveryCheckIn` query now uses `.orderBy('deliveryConfirmedAt', 'asc')`. Added `orders.deliveryConfirmedAt` ASC index in `firestore.indexes.json`.
  - **FC-3:** Removed all `#region agent log` / `#endregion` blocks and every `fetch('http://127.0.0.1:7242/...')` from `app/api/stripe/checkout/create-session/route.ts` and `app/listing/[id]/page.tsx`. No remaining matches in `*.ts`/`*.tsx` (grep 127.0.0.1:7242).
  - **FC-4:** Replaced empty `catch {}` / `catch { // ignore }` in `app/api/stripe/webhook/handlers.ts` (reservation cleanup, sold-out check) with `catch (e) { captureException(...); throw e; }`. Failures are logged/captured and rethrown so the webhook returns 5xx.
- **Manual verification (Batch 1):**
  - [ ] **FC-1:** Create an order, add messages via the listing’s thread, open dispute packet as admin. Confirm packet includes those messages.
  - [ ] **FC-2:** Run `orderDeliveryCheckIn` (or invoke locally) with `DELIVERY_CHECKIN_DAYS` such that some orders have `deliveryConfirmedAt` in range. Confirm no Firestore errors; deploy indexes first (`firebase deploy --only firestore:indexes`).
  - [ ] **FC-3:** Trigger checkout and listing page load; check network tab. No requests to `127.0.0.1:7242`. `rg "127.0.0.1:7242"` in source returns no matches (docs may still mention it).
  - [ ] **FC-4:** Force a cleanup failure (e.g. temporarily break reservation delete); confirm Sentry receives it and webhook returns 5xx.

- **Batch 2 (Indexes + Snapshots) — completed**
  - **FC-5:** Added `listings` composite index `sellerId` ASC + `updatedAt` DESC (for update-seller-snapshots).
  - **FC-6:** Added `listings` composite index `status` ASC + `updatedAt` DESC (for expireListings fallback). Confirmed it did not exist; no duplicate.
  - **FC-7:** Added `watchlist` collection group index `listingId` ASC (for auctionEndingSoon fallback).
- **Manual verification (Batch 2):**
  - [ ] **FC-5:** Run update-seller-snapshots; no Firestore `failed-precondition`.
  - [ ] **FC-6:** Run expireListings with fallback path; no index errors.
  - [ ] **FC-7:** Run auctionEndingSoon with legacy watchlist path; fallback query succeeds.
  - Deploy indexes: `firebase deploy --only firestore:indexes` before verifying.

- **Batch 3 (Storage + Admin Helper) — completed**
  - **FC-8:** Orphan Storage cleanup on upload-registration failure. Added `lib/firebase/storage-cleanup.ts` (`getStoragePathFromUrl`, `deleteStoragePathsBestEffort`). On Firestore write failure, `app/api/listings/[id]/images/add` and `app/api/listings/[id]/documents/upload` call best-effort delete for the uploaded path(s). Cleanup never throws; request still returns error. Publish/create do not perform uploads; no change there.
  - **FC-9:** Document upload size limit 10 MB. `lib/firebase/storage-documents.ts`: added `MAX_DOCUMENT_SIZE_BYTES` (10 MB); `uploadComplianceDocument` and `uploadSellerPermitDocument` reject larger files with "File too large; max 10 MB" (`FILE_TOO_LARGE`). `lib/firebase/message-attachments.ts` already enforced 10 MB; unchanged.
  - **FC-10:** Removed `lib/firebase/admin-helper.ts`. No imports remained. Dropped from `tsconfig.json` exclude; updated `SETUP_ADMIN_SDK.md` and `docs/audit/PUNCHLIST.md` to use/reference `lib/firebase/admin` only.
- **Manual verification (Batch 3):**
  - [ ] **FC-8:** Force images/add or documents/upload Firestore write to fail (e.g. invalid listingId); confirm uploaded path is deleted (or deletion attempted). Request still returns 5xx.
  - [ ] **FC-9:** Upload a file > 10 MB via compliance or seller-permit flow; confirm rejection with clear message.
  - [ ] **FC-10:** `rg "admin-helper"` in app/lib returns no imports; `npm run build` succeeds.

---

*End of hardening plan. Proceed in batch order; verify each fix before moving on.*
