# Wildlife Exchange (Next.js) — Production Readiness Executive Summary

Date: 2026-01-15  
Scope: `project/` (Next.js App Router + Netlify Functions + Firebase + Stripe + Brevo)

## What’s working (verified in code)

- **Client auth state** via Firebase Auth `onAuthStateChanged` (session persistence handled by Firebase SDK).  
  Evidence: `project/contexts/AuthContext.tsx`.
- **Listing creation (draft)** writes to Firestore via client SDK and strips nested `undefined` values.  
  Evidence: `project/lib/firebase/listings.ts` (`createListingDraft`, `stripUndefinedDeep`).
- **Listing publish** is routed through a server API for compliance gates and tier snapshots.  
  Evidence: `project/lib/firebase/listings.ts` (`publishListing` -> `POST /api/listings/publish`), `project/app/api/listings/publish/route.ts`.
- **Best Offer core flows** exist (create/accept/counter/decline/withdraw) and an offer expiry scheduled function exists.  
  Evidence: `project/app/api/offers/*`, `project/netlify/functions/expireOffers.ts`.
- **Checkout session creation** for fixed/auction, with Best Offer metadata support and escrow-style flow (no destination charge).  
  Evidence: `project/app/api/stripe/checkout/create-session/route.ts`.
- **Auto-release cron** exists for protected transactions and uses shared payout release logic.  
  Evidence: `project/netlify/functions/autoReleaseProtected.ts`, `project/lib/stripe/release-payment.ts`.
- **Newsletter (Brevo)** subscription endpoint exists and is wired to Brevo contacts + list.  
  Evidence: `project/app/api/marketing/newsletter/subscribe/route.ts`, `project/components/marketing/EmailCapturePopup.tsx`.

## Top production blockers (brutally honest)

### P0-1: Firebase Admin initialization is inconsistent across routes → Netlify runtime failures likely
Many server routes **do not** use the hardened `project/lib/firebase/admin.ts` (which supports Netlify “bundled file” credentials). Instead, they do ad-hoc `initializeApp()` with `FIREBASE_PRIVATE_KEY` or ADC fallback.

This is a known failure mode in Netlify (previous “metadata plugin / DECODER routines::unsupported” style errors).

Evidence (examples; not exhaustive):
- `project/app/api/stripe/webhook/route.ts` initializes Admin at module scope using `process.env.FIREBASE_PRIVATE_KEY.replace(...)`.
- `project/app/api/messages/send/route.ts` custom init function uses `FIREBASE_PRIVATE_KEY`/ADC.
- `project/app/api/bids/place/route.ts` module-scope Admin init uses `FIREBASE_PRIVATE_KEY`/ADC.
- Stripe Connect routes: `project/app/api/stripe/connect/*` (mixed patterns).

Minimal fix approach:
- Replace all ad-hoc Admin init with `getAdminAuth()` / `getAdminDb()` from `project/lib/firebase/admin.ts`.
- Avoid module-scope initialization where possible; initialize inside handlers and return structured 503s like `app/api/listings/publish/route.ts`.

### P0-2: Storage rules are dangerously permissive (compliance docs are public; any authed user can upload anywhere)
Evidence: `project/storage.rules`
- Listing documents: `allow read: if true;` → **compliance documents are publicly readable**.
- Listing images/documents: `allow write: if isAuthenticated();` → any authed user can write to **any listingId** path.

Impact:
- PII/leak risk (documents).
- Integrity risk (malicious uploads, defacement, storage cost abuse).

Minimal fix approach:
- Restrict document reads to listing owner + admins only.
- Restrict writes to listing owner by checking Firestore listing ownership in Storage rules (or require signed upload URLs).

### P0-3: Firestore `notifications` can be spoofed by any authenticated user
Evidence: `project/firestore.rules`:
- `match /notifications/{notificationId}` → `allow create: if isAuthenticated();`

Impact:
- Users can create fake system/admin notifications for other users.

Minimal fix approach:
- Make notifications **server-only writes** (`allow create: if false`) and create via Admin SDK only.

### P0-4: Stripe webhook uses legacy Admin init and may fail in Netlify / lacks hardened credential loading
Evidence: `project/app/api/stripe/webhook/route.ts` initializes Admin manually and does not use `getAdminApp()`.

Impact:
- Webhooks are business-critical: if they fail, orders won’t be created, listings won’t mark sold, disputes/chargebacks won’t sync.

Minimal fix approach:
- Use `getAdminDb()` / `getAdminApp()` and remove the duplicate init logic.

### P0-5: Marketplace fee copy is inconsistent (5% model vs 3% shown in auction UI)
Evidence:
- Flat 5% model: `project/lib/pricing/plans.ts` (`MARKETPLACE_FEE_PERCENT = 0.05`).
- Auction UI shows “Platform Fee (3%)”: `project/components/auction/BidIncrementCalculator.tsx` (Bid Summary block).

Impact:
- Legal/comms risk: user-facing fee mismatch.

Minimal fix approach:
- Replace 3% copy and math with the canonical `MARKETPLACE_FEE_PERCENT` (or remove from bid UI entirely).

### P0-6: Rate limiting in production is optional; fallback is in-memory (weak in serverless)
Evidence: `project/lib/rate-limit.ts`
- Upstash env vars missing → warns and uses **in-memory** store.

Impact:
- Checkout/bidding/offers endpoints are brute-forceable/cost-amplifiable.

Minimal fix approach:
- Require Upstash env vars in Netlify production (hard-fail startup or return 503 for protected endpoints).

### P0-7: Auction lifecycle is incomplete (no automatic winner settlement flow)
Verified:
- Bids can be placed server-side (`/api/bids/place`).
- Checkout requires auction end and winning bidder (`/api/stripe/checkout/create-session` queries bids).

Missing/unclear:
- No scheduled “auction ended → notify winner → enforce payment deadline → relist if unpaid” job was found.

Impact:
- Auctions will not reliably convert; manual steps required.

Minimal fix approach:
- Add a scheduled function to finalize auctions and notify winner; enforce a payment window and update listing status accordingly.

### P0-8: Multiple critical routes still initialize Admin at module load (build/runtime crash risk)
Example: `project/app/api/stripe/checkout/create-session/route.ts` has:
- `const auth = getAdminAuth(); const db = getAdminDb();` at module scope.

Impact:
- If Admin init fails, the module import can crash the route before handler executes.

Minimal fix approach:
- Move initialization inside `POST()` with structured error handling (mirroring `listings/publish`).

### P0-9: Privacy/authorization posture for user profiles is broad
Evidence: `project/firestore.rules`:
- `match /users/{userId}` → `allow read: if isAuthenticated();` (any authed user can read any user profile).

Impact:
- Potential PII exposure depending on what’s stored in profiles (phone/location).

Minimal fix approach:
- Split public vs private profile data or restrict reads to owner + required public subset.

### P0-10: Messaging thread creation constraints are weak (needs verification)
Rules allow creating messageThreads if buyerId or sellerId matches auth; no listing ownership link check in rules.
Evidence: `project/firestore.rules` `match /messageThreads/{threadId}`.

Impact:
- Users may be able to create arbitrary threads with other users if client allows it.

Minimal fix approach:
- Enforce thread creation server-side or validate listing relationship and participants.

## Needs Verification (cannot confirm from code alone)

- **Netlify environment**: confirm `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` is truly Build-only and that `netlify/secrets/firebase-service-account.json` is bundled into functions at runtime.  
  Evidence to check: `project/netlify.toml`, Netlify UI env var scopes.
- **Admin custom claims**: code supports claims (`request.auth.token.role`), but I only found scripts that write Firestore role. Confirm whether custom claims are actually set in production.  
  Evidence: `project/scripts/set-admin-role.ts`, `project/firestore.rules` `isAdmin()`.
- **Stripe product configuration**: confirm real Stripe price IDs exist for priority/premier.  
  Evidence: `project/env.example`, `project/app/api/stripe/subscriptions/create/route.ts`.

