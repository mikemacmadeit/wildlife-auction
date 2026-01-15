# Wildlife Exchange — Punchlist (Tickets)

Date: 2026-01-15

## P0 (must fix before real production money/traffic)

1) **Unify Firebase Admin init across ALL server routes (Netlify-safe)**
   - **Problem**: Multiple API routes use ad-hoc `initializeApp()` with `FIREBASE_PRIVATE_KEY` or ADC fallback; this is fragile in Netlify and bypasses the hardened `getAdminApp()` path.
   - **Evidence**: `project/app/api/stripe/webhook/route.ts`, `project/app/api/messages/send/route.ts`, `project/app/api/bids/place/route.ts`, `project/app/api/stripe/connect/create-account-link/route.ts`, others.
   - **Fix**: Replace with `getAdminAuth()` / `getAdminDb()` from `project/lib/firebase/admin.ts`. Move init inside handlers + return structured 503.

2) **Lock down Firebase Storage rules (docs must not be public; writes must be owner-only)**
   - **Evidence**: `project/storage.rules` (`allow read: if true` for listing documents; `allow write: if isAuthenticated()`).
   - **Fix**: Require listing ownership for writes, and owner/admin for reads. Consider signed upload URLs.

3) **Make `notifications` server-write-only**
   - **Evidence**: `project/firestore.rules` allows `allow create: if isAuthenticated()` for `/notifications/{id}`.
   - **Fix**: `allow create: if false` + create via Admin SDK only.

4) **Fix Stripe webhook Admin init to use `lib/firebase/admin.ts`**
   - **Evidence**: `project/app/api/stripe/webhook/route.ts` manual Admin init at module scope.
   - **Fix**: Use `getAdminDb()` and remove duplicated init logic.

5) **Remove module-scope Firebase Admin initialization from critical API routes**
   - **Evidence**: `project/app/api/stripe/checkout/create-session/route.ts` has `const auth = getAdminAuth(); const db = getAdminDb();` at module scope.
   - **Fix**: Initialize inside handler and return 503 with error codes (pattern used in `project/app/api/listings/publish/route.ts`).

6) **Fix fee mismatch: auction UI shows 3% while platform is 5%**
   - **Evidence**: `project/components/auction/BidIncrementCalculator.tsx` vs `project/lib/pricing/plans.ts`.
   - **Fix**: Use canonical `MARKETPLACE_FEE_PERCENT` (or remove fee display from bid calculator).

7) **Require Upstash Redis rate limiting in production**
   - **Evidence**: `project/lib/rate-limit.ts` falls back to in-memory if env vars missing.
   - **Fix**: For production (Netlify), fail closed: return 503 for protected routes if Upstash vars missing.

8) **Stop public reads of listing compliance documents**
   - **Evidence**: `project/storage.rules` listing documents `allow read: if true`.
   - **Fix**: same as #2, but tracked separately because it’s a major legal/privacy issue.

9) **Audit `messageThreads` creation + enforce participant/listing relationship**
   - **Evidence**: `project/firestore.rules` allows creating threads if buyerId or sellerId equals auth.uid (no listing relationship constraint).
   - **Fix**: Create threads server-side with validations; or add Firestore rule constraints based on listingId + sellerId.

10) **Define auction closeout + settlement job**
   - **Evidence**: No “auction ended → notify winner → enforce payment window → relist if unpaid” job found.
   - **Fix**: Add scheduled function + state machine fields on listings/orders.

## P1 (important; improves reliability/ops and reduces risk)

11) **Standardize admin/role system (claims vs Firestore role)**
   - **Evidence**: `project/firestore.rules` checks token claims and falls back to reading `/users/{uid}.role`. `project/scripts/set-admin-role.ts` sets Firestore role only.
   - **Fix**: Add an admin-only server endpoint / script to set Firebase Auth custom claims and document it; reduce Firestore reads in security rules.

12) **Harden order document subcollection rules (verify fields exist / correct references)**
   - **Evidence**: `project/firestore.rules` `/orders/{orderId}/documents/{documentId}` uses `resource.data.buyerId` etc, but that subcollection document may not contain buyerId/sellerId.
   - **Fix**: Reference parent order doc via `get(/orders/{orderId})` or enforce schema.

13) **Implement transactional email notifications (offers, orders, payout state changes)**
   - **Evidence**: Only newsletter (Brevo) endpoint found; no offer/order transactional email sender found.
   - **Fix**: Add server-side email module + triggers in webhook and offer routes (behind user notification preferences).

14) **Remove/flag unused or dead components and placeholder logic**
   - **Evidence**: `project/components/listing/RelatedListings.tsx` contains TODO and appears unused.
   - **Fix**: Remove or wire properly to Firestore.

15) **Privacy posture for user profiles**
   - **Evidence**: `project/firestore.rules` allows any authenticated user to read any user profile.
   - **Fix**: Split public profile (displayName, tier badge, compliance flags) from private profile (phone, exact address).

## P2 (cleanup/perf/devex)

16) **Remove unused dependency: `@supabase/supabase-js`**
   - **Evidence**: present in `project/package.json`; no usage found via grep.

17) **Consolidate duplicated Firebase Admin helper modules**
   - **Evidence**: `project/lib/firebase/admin-helper.ts` exists alongside `project/lib/firebase/admin.ts` (needs review to delete/merge).

18) **Reduce build/runtime log noise**
   - **Evidence**: Several routes log verbose objects in production paths (e.g. `connect/check-status`).

