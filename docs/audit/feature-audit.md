# Wildlife Exchange — Feature-by-Feature Audit Report (evidence-based)

Date: 2026-01-15  
Repo scope audited: `project/` (Next.js app + API routes + Netlify scheduled functions + Firebase + Stripe + Brevo)

## Ground rules for this report

- **No guessing**: everything below is traced to code in this repo.
- If something can’t be proven from code alone, it’s listed under **Needs Verification** with exact checks.
- “Real vs Mock” means “wired to live external services / persistent data” vs “stubbed, mock arrays, placeholder UI”.

---

## Feature Matrix (high-level)

| Feature | Entry points (routes/components) | Real/Mock | Dependencies | Current status | Production risk | Fix summary |
|---|---|---:|---|---|---|---|
| Auth / Session | `project/contexts/AuthContext.tsx`, auth pages under `project/app/(auth)` | Real | Firebase Auth client SDK | Works (client session) | P1 | Ensure server routes consistently verify ID tokens; add claim-setting workflow |
| Users / Profiles | `project/lib/firebase/users.ts`, Firestore rules `users/{uid}` | Real | Firestore | Works, but broad reads | P0/P1 | Restrict profile reads or split public/private profile |
| Listings: Draft | `project/lib/firebase/listings.ts` (`createListingDraft`), `app/dashboard/listings/new` | Real | Firestore client SDK | Implemented | P1 | Ensure Firestore rules match fields; tighten Storage rules |
| Listings: Publish | `POST project/app/api/listings/publish/route.ts` | Real | Firebase Admin, Firestore | Implemented w/ compliance gates | P0 | Fix Admin init consistency across all routes; avoid module-scope init |
| Listing Images Upload | `project/lib/firebase/storage.ts`, `project/storage.rules` | Real | Firebase Storage | Upload works, rules unsafe | **P0** | Owner-only writes; non-public reads for docs |
| Browse / Filters | `project/app/browse/page.tsx`, `project/lib/firebase/listings.ts` browse query | Real | Firestore | Implemented | P1 | Pagination correctness & index coverage verify |
| Listing Detail | `project/app/listing/[id]/page.tsx` | Real | Firestore | Implemented | P1 | Ensure “related listings” not dead/placeholder |
| Watchlist | `POST project/app/api/watchlist/toggle/route.ts`, `project/hooks/use-favorites.ts` | Real | Firebase Admin + Firestore rules | Implemented | P1 | Rate limit + ensure auth prompt UX acceptable |
| Best Offer | `project/app/api/offers/*`, `project/components/offers/OfferPanel.tsx`, `netlify/functions/expireOffers.ts` | Real | Firebase Admin + Firestore | Implemented | P1 | Confirm indexes deployed; add email notifications |
| Auctions / Bidding | `POST project/app/api/bids/place/route.ts`, listing page bidding UI | Real-ish | Firebase Admin + Firestore | Bid placement exists | **P0** | Fix Admin init + add auction closeout/settlement job |
| Checkout | `POST project/app/api/stripe/checkout/create-session/route.ts` | Real | Stripe + Firebase Admin | Implemented (payout-hold model) | P0/P1 | Remove module-scope Admin init; add more idempotency + monitoring |
| Stripe Webhooks | `POST project/app/api/stripe/webhook/route.ts` + `handlers.ts` | Real | Stripe + Firebase Admin | Implemented | **P0** | Use `lib/firebase/admin.ts` credentials; harden error handling |
| Stripe Connect | `project/app/api/stripe/connect/*` | Real | Stripe Connect | Implemented | P0 | Admin init inconsistent; ensure onboarding URLs + status stored |
| Payouts release | `project/lib/stripe/release-payment.ts`, `api/stripe/transfers/release` + cron | Real | Stripe transfers | Implemented | P1 | Confirm order schema fields always present; ops telemetry |
| Messaging | `POST project/app/api/messages/send/route.ts` + Firestore rules | Real | Firebase Admin + Firestore | Implemented | P0/P1 | Fix Admin init; tighten thread creation and notification spoofing |
| Newsletter | `POST project/app/api/marketing/newsletter/subscribe/route.ts` + popup | Real | Brevo | Implemented | P1 | Add server-side logging/telemetry; handle attribute schema |
| Admin dashboards | `project/app/dashboard/admin/*`, `project/app/api/admin/*` | Real-ish | Firebase Admin + Firestore | Implemented | P0/P1 | Verify auth enforcement; avoid static rendering pitfalls |
| Scheduled jobs | `project/netlify/functions/*` | Real | Netlify schedule + Firebase Admin | Implemented | P1 | Verify scheduling configured in Netlify + logs/opsHealth |

---

## 1) Auth / Users

### What it should do
- Sign up / login / persistent sessions.
- Role-based access: buyer/seller/admin for dashboards and API routes.
- No bypass / no mock auth.

### What it does in this repo (verified)

- **Session persistence**: Firebase Auth client SDK tracks login and provides `user` in context.
  - Evidence: `project/contexts/AuthContext.tsx` uses `onAuthStateChanged(auth, ...)`.
- **Admin role**:
  - Firestore rules check **token claims first**, then fallback to reading `/users/{uid}.role`.
    - Evidence: `project/firestore.rules` `function isAdmin()` uses `request.auth.token.role` and `get(/users/{uid}).data.role`.
  - Client-side admin checks prefer **custom claims** but also fall back to Firestore profile role.
    - Evidence: `project/hooks/use-admin.ts`.
  - A script exists to set Firestore role to `super_admin`.
    - Evidence: `project/scripts/set-admin-role.ts` writes `users/{uid}.role = 'super_admin'`.

### Real vs Mock
- **Real**: Firebase Auth + Firestore profiles.
- **No mock auth** found.

### Production risks
- **P0**: Admin claims workflow is unclear; code supports claims but only scripts writing Firestore role were found. If claims are not set, Firestore rules do `get()` reads in rules (cost/hotspot).
- **P0/P1**: `users/{userId}` read rule is broad: any authenticated user can read any user doc.
  - Evidence: `project/firestore.rules` `match /users/{userId} { allow read: if isAuthenticated(); }`

### Next steps
- **P0**: Define and implement one canonical admin-role system (prefer custom claims) and stop relying on rules-time `get()` in hot paths.
- **P1**: Split public profile data from private data; restrict reads accordingly.

---

## 2) Listings

### Draft creation

**What it should do**: create draft, save partial data, upload images, allow edits.

**Current behavior (verified)**:
- `createListingDraft` writes to Firestore using client SDK (`addDoc`) and sets `status: 'draft'`.
  - Evidence: `project/lib/firebase/listings.ts` around `createListingDraft`, and it calls `stripUndefinedDeep` before write.

**Production risks**:
- **P1**: Relies on permissive Storage rules to make uploads “just work” (see Storage section).

### Edit listing

**What it should do**: seller can update their listing; cannot mutate immutable fields.

**Current behavior (verified)**:
- `updateListing` checks ownership client-side and strips immutable fields before `updateDoc`.
  - Evidence: `project/lib/firebase/listings.ts` (`updateListing`).

### Publish listing

**What it should do**: server-authoritative publish: compliance validation, whitetail gates, status transitions, tier snapshot.

**Current behavior (verified)**:
- Client calls server publish endpoint:
  - Evidence: `project/lib/firebase/listings.ts` (`publishListing` → `POST /api/listings/publish`).
- Server endpoint enforces:
  - **auth** (`Bearer` token -> `verifyIdToken`)
  - **ownership** (listing.sellerId == userId)
  - **compliance validation** (`validateListingCompliance(...)`)
  - **whitetail seller attestation** required
  - **tier snapshot** onto listing for browse badge/ranking
  - **pending review** behavior for whitetail or pending_review compliance
  - Evidence: `project/app/api/listings/publish/route.ts`.

**Production risks**:
- **P0**: This route is hardened; however other routes still use legacy Admin init → inconsistent production reliability (see Deploy/Env section).

### Images upload

**What it should do**: upload listing images with ownership checks; prevent cross-tenant writes.

**Current behavior (verified)**:
- Client uploads via Firebase Storage SDK (`uploadBytesResumable`) with WebP compression.
  - Evidence: `project/lib/firebase/storage.ts`.

**Production risk (P0)**:
- Storage rules currently allow any authenticated user to upload to any listingId path.
  - Evidence: `project/storage.rules` `allow write: if isAuthenticated()` for `/listings/{listingId}/images/*`.

---

## 3) Offers / Best Offer system

### What it should do
- Buyer offers; seller accepts/counters/declines; buyer can respond; auto-expire; checkout at agreed price; audit trail.

### Current behavior (verified)
- Server routes exist for core lifecycle actions.
  - Evidence: `project/app/api/offers/create/route.ts`, `.../[offerId]/accept|counter|decline|withdraw`, `mine`, `seller`, `listing/[listingId]`, and shared util `project/app/api/offers/_util.ts`.
- Auto-expiration scheduled job exists.
  - Evidence: `project/netlify/functions/expireOffers.ts`.
- Checkout integration uses `offerId` metadata and reserves listing by offer id (enforced in checkout create-session).
  - Evidence: `project/app/api/stripe/checkout/create-session/route.ts`.

### Real vs Mock
- **Real**: Firestore `offers` collection; server-only writes in rules.
  - Evidence: `project/firestore.rules` `match /offers/{offerId} { allow create, update, delete: if false; }`.

### Production risks
- **P1**: No transactional email notifications found for offers (only in-app `notifications` writes).
- **P1**: Ensure required Firestore indexes are deployed for queries used by `/api/offers/*`.
  - Evidence: `project/firestore.indexes.json` includes composite indexes for offers.

---

## 4) Auctions / Bidding

### What it should do
- Place bid with anti-abuse, increment rules, prevent late sniping/define policy, real-time updates, settle auction.

### Current behavior (verified)
- Server-side bid placement exists and uses a Firestore transaction:
  - Ensures listing is auction + active + not ended, and enforces TX-only for animal categories by reading buyer profile.
  - Evidence: `project/app/api/bids/place/route.ts`.
- UI has a bid increment calculator and an “auto-bid strategy” *UI-only* helper.
  - Evidence: `project/components/auction/BidIncrementCalculator.tsx`.

### Production risks
- **P0**: `/api/bids/place` uses legacy Admin init at module scope (`initializeApp` + `FIREBASE_PRIVATE_KEY`).
- **P0**: Auction lifecycle appears incomplete:
  - Checkout requires auction ended and buyer is winning bidder (`/api/stripe/checkout/create-session` queries bids).
  - No scheduled job found to automatically notify winner, enforce a payment deadline, or transition listing state when auction ends.
- **P0**: Fee copy mismatch in bidding UI (“Platform Fee (3%)”) vs platform fee 5%.

---

## 5) Checkout / Payments (Stripe)

### Create session (payout-hold model)
- `POST /api/stripe/checkout/create-session`:
  - Validates auth token, listing state, auction winning bidder, offer acceptance/reservation.
  - Uses **payout-hold model** (funds stay in platform until later payout release) — explicitly does **not** use `transfer_data`.
  - Stores sellerAmount/platformFee in checkout metadata for later transfer.
  - Evidence: `project/app/api/stripe/checkout/create-session/route.ts`.

### Webhooks
- `POST /api/stripe/webhook`:
  - Verifies Stripe signature, records idempotency via `stripeEvents/{eventId}`.
  - Calls extracted handlers in `handlers.ts` and subscription handlers.
  - Evidence: `project/app/api/stripe/webhook/route.ts`, `project/app/api/stripe/webhook/handlers.ts`.

### Production risks (P0)
- Webhook route uses its own Admin init (no hardened Netlify-safe path).
- Checkout route initializes Admin at module scope (crash-at-import risk).

---

## 6) Payouts / Seller balance

### What exists (verified)
- Stripe Connect Express account creation + onboarding link + status check endpoints exist.
  - Evidence: `project/app/api/stripe/connect/create-account/route.ts`, `create-account-link`, `check-status`.
- Release flow:
  - Admin endpoint `POST /api/stripe/transfers/release` calls shared `releasePaymentForOrder`.
  - Scheduled function `autoReleaseProtected` also uses shared release logic.
  - Evidence: `project/app/api/stripe/transfers/release/route.ts`, `project/lib/stripe/release-payment.ts`, `project/netlify/functions/autoReleaseProtected.ts`.

### Production risks
- **P0**: Connect endpoints use legacy Admin init; likely Netlify fragility.
- **P1**: No dedicated ledger model found; seller balances likely computed from orders.

---

## 7) Messaging / Email notifications

### Messaging (in-app)
- `POST /api/messages/send`:
  - Verifies token, verifies thread membership, sanitizes message (anti-circumvention), writes message + updates thread + creates notification doc.
  - Evidence: `project/app/api/messages/send/route.ts`.

**Production risks**:
- **P0**: Uses custom Admin init; not `lib/firebase/admin.ts`.
- **P0**: Notifications can be spoofed (rules allow any authed user to create).

### Email notifications
- Newsletter uses Brevo.
  - Evidence: `project/app/api/marketing/newsletter/subscribe/route.ts`.
- Email capture popup suppression is localStorage-based (14 days + subscribed).
  - Evidence: `project/components/marketing/EmailCapturePopup.tsx`.

**Missing**:
- No transactional email sender for offers/orders found (Needs Verification / likely missing).

---

## 8) Admin

### What exists (verified by routing)
- API endpoints:
  - `project/app/api/admin/reconcile/route.ts`
  - `project/app/api/admin/revenue/route.ts`
  - `project/app/api/admin/orders/route.ts`
  - `project/app/api/admin/listings/[id]/documents/verify/route.ts`
- UI pages:
  - `project/app/dashboard/admin/*` (health, compliance, listings, ops, payouts, revenue, etc)

### Production risks (P0/P1)
- Confirm every admin API route enforces admin via token claims or user role document (mixed patterns seen elsewhere).
- Avoid static rendering pitfalls for admin routes (some force dynamic; verify coverage).

---

## 9) Data layer (Firestore)

### Collections observed (from rules + code)
- `users/{uid}`
- `listings/{listingId}`
  - `listings/{listingId}/documents/{documentId}`
- `offers/{offerId}`
- `bids/{bidId}`
- `orders/{orderId}`
  - `orders/{orderId}/documents/{documentId}`
- `messageThreads/{threadId}`
  - `messageThreads/{threadId}/messages/{messageId}`
- `notifications/{notificationId}`
- `auditLogs/{auditId}`
- `opsHealth/{docId}`
- `stripeEvents/{eventId}`
- `chargebacks/{disputeId}`

### Security rules posture (high-signal findings)
- **Users readable by any authenticated user** (privacy risk).
  - Evidence: `project/firestore.rules` users read.
- **Offers are read-only for buyer/seller/admin; server-only writes** (good).
  - Evidence: `project/firestore.rules` offers block.
- **Notifications can be created by any authenticated user** (spoofing risk).
  - Evidence: `project/firestore.rules` notifications block.

### Indexes
- `project/firestore.indexes.json` includes offers composite indexes and listings browse indexes.
- Needs Verification: indexes deployed to production project.

---

## 10) Deploy / Environment (Netlify)

### Netlify build/runtime configuration (verified)
- Build command writes a Firebase service-account JSON file and then runs `next build`.
  - Evidence: `project/netlify.toml` build command.
- Netlify functions are configured to include `netlify/secrets/firebase-service-account.json`.
  - Evidence: `project/netlify.toml` `[functions."*"].included_files`.
- Firebase Admin helper supports:
  - bundled file (`netlify/secrets/firebase-service-account.json`)
  - base64 env var (`FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`)
  - split-key env vars (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
  - Evidence: `project/lib/firebase/admin.ts`.

### Required env vars (verified in code/env.example)

**Client (NEXT_PUBLIC\_*)**
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**Server**
- Firebase Admin (preferred Netlify): `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` (Build-only) -> bundled file
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Subscription price IDs: `STRIPE_PRICE_ID_PRIORITY`, `STRIPE_PRICE_ID_PREMIER` (legacy: `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_ELITE`)
- Brevo: `BREVO_API_KEY`, `BREVO_NEWSLETTER_LIST_ID`
- Rate limit (Upstash): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- App URL: `APP_URL` or `NEXT_PUBLIC_APP_URL` (else falls back to localhost)

### Netlify production breakers (P0)
- Any server route using legacy `initializeApp()` w/ `FIREBASE_PRIVATE_KEY` (instead of `lib/firebase/admin.ts`) can fail with credentials parsing / metadata plugin issues.
- Module-scope Admin init in API routes increases “crash at import” risk.

---

## 11) UX / App behavior / placeholders

### Verified placeholder/dead code
- `project/components/listing/RelatedListings.tsx` includes TODO and appears unused (no references found via grep).

### Verified UX behavior: email popup persistence
- Popup uses localStorage keys:
  - `we_email_capture_dismissed` (14-day cooldown)
  - `we_email_capture_subscribed` (never show again)
  - Evidence: `project/components/marketing/EmailCapturePopup.tsx`.

---

## Needs Verification (explicit checks)

1) **Firestore indexes deployment**
   - Check Firebase project has the composite indexes in `project/firestore.indexes.json`.
2) **Firestore rules deployment**
   - Confirm `project/firestore.rules` is deployed to the production Firebase project.
3) **Netlify scheduled functions actually running**
   - Check Netlify “Scheduled Functions” UI/logs for:
     - `autoReleaseProtected`
     - `expireOffers`
4) **Stripe Connect + Transfers viability**
   - Confirm platform Stripe account is allowed to hold funds and later transfer (payout-hold model) and Connect is properly configured.
5) **Admin role claims**
   - Confirm whether Firebase Auth custom claims are set in production; otherwise rules fallback reads will add latency/cost.

---

## Smoke Test Plan (staging manual script)

1) **Auth**
   - Register → confirm `users/{uid}` doc created.
   - Login/logout → session persists on reload.

2) **Listings**
   - Create draft listing → Firestore `listings` doc exists with `status='draft'`.
   - Upload image → Storage path `listings/{listingId}/images/*` returns a URL.
   - Publish listing:
     - Non-whitetail → becomes `active`.
     - Whitetail → becomes `pending` and UI shows “pending review”.

3) **Offers**
   - Enable best offer on a fixed listing.
   - Buyer creates offer → offer `status=open` with `expiresAt`.
   - Seller counter/accept → offer updates and listing reserved.
   - Wait/poke expiry function → open offer becomes `expired`.

4) **Bidding**
   - Create auction, place bid → listing `currentBid` increments, bid doc created.
   - Attempt bid after endsAt → rejected.

5) **Checkout + webhook**
   - Fixed listing checkout → Stripe session created, complete payment in test mode.
   - Confirm webhook creates `orders` doc and listing becomes sold (or whatever handler sets).
   - Confirm `stripeEvents/{eventId}` created for idempotency.

6) **Connect + payout**
   - Seller creates Connect account and completes onboarding.
   - Purchase listing; confirm order stores `sellerStripeAccountId`.
   - Trigger release:
     - Manual admin release endpoint
     - Auto-release after protection/dispute windows

