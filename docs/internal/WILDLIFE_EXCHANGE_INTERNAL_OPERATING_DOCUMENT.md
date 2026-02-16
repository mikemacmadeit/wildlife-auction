# Wildlife Exchange — Internal Business & Platform Operating Document (Evidence-Based)

**Document type:** Internal operating document (not marketing — not legal advice)  
**Audience:** Management/operators, Board, Legal counsel, regulators, banking/Stripe diligence, investors  
**Scope:** Texas-only animal marketplace; compliance enforcement via document workflow + payout holds  
**Hard rule:** Every statement about platform behavior is traceable to code/config/policy text. Unknown items are explicitly flagged.

---

## Founder Inputs (FOUNDER POLICY REQUIRED)

This repo cannot infer certain **corporate/legal/policy** facts. Those must be provided by the founder/counsel in:
- `docs/internal/FOUNDER_INPUTS.md`

Where this document requires founder policy, it will explicitly state:
**FOUNDER POLICY REQUIRED (see `docs/internal/FOUNDER_INPUTS.md`)**

## Executive Summary (Internal)

1) **Platform posture is explicitly “technology marketplace only”** (not seller/dealer/broker/auctioneer; no custody/transport; “Verified” ≠ regulator approval).  
   - Evidence: `app/terms/page.tsx:L30-L36`, `app/terms/page.tsx:L55-L69`, `app/terms/page.tsx:L162-L169`

2) **Texas-only for animal transactions is a core control enforced in policy text and in payment enforcement paths.**  
   - Policy text: `app/terms/page.tsx:L100-L110`  
   - Webhook enforcement for TX-only categories: `app/api/stripe/webhook/handlers.ts:L148-L229`

3) **Funds are held for payout release and moved only by explicit server-side release logic** gated by disputes/chargebacks/admin holds and (for certain categories/species) verified compliance docs + admin payout approval.  
   - Release gate and policy enforcement: `lib/stripe/release-payment.ts:L26-L45`, `lib/stripe/release-payment.ts:L148-L240`  
   - Manual admin release endpoint: `app/api/admin/orders/[orderId]/release/route.ts:L1-L114`

4) **Compliance policy is now centralized and species-aware for Wildlife Exotics** (cervids vs ESA/CITES overlay vs other_exotic) and used for payout holds and listing review decisions.  
   - Policy module: `lib/compliance/policy.ts:L6-L149`  
   - Listing review trigger for ESA/CITES overlays + other_exotic: `lib/compliance/validation.ts:L488-L506`

5) **Compliance documents are stored in Firebase Storage with restricted access** (not publicly readable), and are indexed under Firestore listing/order subcollections.  
   - Storage rules for listing/order documents: `storage.rules:L54-L91`  
   - Order doc upload API validates types and requires HTTPS URL: `app/api/orders/[orderId]/documents/upload/route.ts:L84-L100`

6) **Protected-transaction disputes are time-boxed and evidence-required**; disputes hold payout; admin resolves by refund/release with additional safety gating.  
   - Dispute open: `app/api/orders/[orderId]/disputes/open/route.ts:L20-L27`, `L100-L116`, `L132-L146`, `L175-L184`  
   - Dispute resolve safety: `app/api/orders/[orderId]/disputes/resolve/route.ts:L132-L140`, `L176-L195`

7) **Admin roles are checked via Firebase Auth claims first, then Firestore fallback, with server-side checks on privileged endpoints.**  
   - UI hook: `hooks/use-admin.ts:L26-L90`  
   - Server check example: `app/api/admin/orders/[orderId]/release/route.ts:L54-L59`

8) **Audit logging exists and records critical actions** including payouts, disputes, delivery confirmations, and admin compliance actions.  
   - Audit schema and action types: `lib/audit/logger.ts:L41-L105`  
   - Audit write: `lib/audit/logger.ts:L129-L171`

**Top residual risks (not sugarcoated):**
- **Policy scope vs enforcement mismatch risk**: the platform can enforce payout holds, but it does not (and should not) guarantee legal compliance or regulator approvals; all copy must remain consistent. Evidence of posture exists, but ongoing governance is required.  
- **Interstate misuse attempts**: TX-only is enforced in payment flows for Texas-only categories, but the platform still needs operational processes for attempted misuse, and the listing model currently does not capture origin/destination state for animals. **UNKNOWN — NEEDS VERIFICATION** if any UI captures origin/destination beyond general location.
- **Evidence/medical claims handling risk**: dispute workflows accept user-supplied evidence URLs; storage rules and upload controls mitigate, but operational review burdens remain. Evidence upload surfaces must be operationally monitored.

---

## 1) Table of Contents (Full Document Outline)

1. Company & Platform Overview  
2. Legal & Regulatory Posture  
3. Category & Species Governance Model (by category)  
4. Listing Lifecycle (Draft → Pending → Active → Sold/Expired/Removed)  
5. Order & Payment Lifecycle (Checkout → Webhook → Delivery → Dispute/Release)  
6. Compliance Document System (Document types, storage, verification, audit)  
7. Admin & Moderation Operations  
8. Data Architecture (high level)  
9. Risk Register  
10. Gap Analysis (implemented vs partial vs missing)  
11. Operational Playbook (internal responses)  
12. Appendices (glossary, tables, decision trees, reference mappings)  
13. Input Required From Founder (UNKNOWN items)  

---

## 2) Company & Platform Overview

### 2.1 Purpose and scope
Wildlife Exchange provides software that allows users to list items and communicate with other users, and supports payments and marketplace workflow holds.  
- Evidence: `app/terms/page.tsx:L61-L69`, `app/terms/page.tsx:L214-L218`

### 2.2 Jurisdictional scope: Texas-only animal transactions
The platform states that **all animal transactions are Texas-only** and may apply geographic restrictions and workflow checks.  
- Evidence: `app/terms/page.tsx:L100-L110`

### 2.3 Business model: technology marketplace (not broker/auctioneer)
The platform explicitly asserts:
- Not seller/dealer/broker/agent/auctioneer
- Buyer and seller contract directly
- Platform provides tools/templates but does not represent sufficiency for legal transfer
- Evidence: `app/terms/page.tsx:L30-L36`, `app/terms/page.tsx:L55-L85`

### 2.4 What the platform does NOT do (explicit non-responsibilities)
- No custody/possession/control; no transport arrangement; no vet services; no regulator approval representation.  
- Evidence: `app/terms/page.tsx:L64-L68`, `app/terms/page.tsx:L162-L169`, `app/terms/page.tsx:L34-L36`

### 2.5 Role separation (platform vs buyer vs seller)
- Sellers are responsible for accuracy, legality, permits/records, and compliance; buyers are responsible for due diligence and transfer/pickup requirements.  
- Evidence: `app/terms/page.tsx:L172-L206`, `app/legal/seller-policy/page.tsx:L45-L66`, `app/legal/buyer-acknowledgment/page.tsx:L68-L78`

### 2.6 Revenue model
**UNKNOWN — NEEDS VERIFICATION**: exact fee schedules, subscription tiers, and billing mechanics should be documented from pricing/subscription code and Stripe product configuration.
- Known: Stripe is used; platform may collect marketplace fees.  
  - Evidence: `app/terms/page.tsx:L214-L218`
- Known (technical model description in code comments): checkout uses a marketplace model with destination charges + application fee.  
  - Evidence: `app/api/stripe/checkout/create-session/route.ts:L4-L6`
- Required verification steps:
  - Confirm Stripe products/prices used and where configured in env (`STRIPE_PRICE_ID_*`): `env.example:L40-L50`.
  - Confirm fee percent source of truth in code (e.g., `MARKETPLACE_FEE_PERCENT`) and any tier overrides (code not fully cited in this section).

---

## 3) Legal & Regulatory Posture (Tech Provider)

### 3.1 “Technology provider only” posture (what it means internally)
Operationally, “technology provider only” means the platform:
- Does not take title/custody/control of animals/goods.
- Does not arrange transport.
- Does not represent “verified/approved” as regulator approval.
- Contracts are between buyer and seller; platform is not party.
- Evidence: `app/terms/page.tsx:L30-L36`, `app/terms/page.tsx:L74-L85`, `app/terms/page.tsx:L162-L169`

### 3.2 How posture is enforced in Terms and legal pages
- Terms: marketplace-only + “Verified” scope: `app/terms/page.tsx:L30-L36`  
- Marketplace policies: disclaimers and compliance responsibility: `app/legal/marketplace-policies/page.tsx:L30-L36`, `L46-L61`, `L87-L98`  
- Seller policy: seller compliance obligations + indemnity: `app/legal/seller-policy/page.tsx:L45-L86`  
- Buyer acknowledgment: buyer due diligence: `app/legal/buyer-acknowledgment/page.tsx:L73-L78`

### 3.3 How posture is enforced in UI copy and workflow labels
- Platform uses “payout hold / payout release” language and scopes approvals to marketplace workflow.  
  - Example: `app/dashboard/admin/compliance-holds/page.tsx:L130-L134`  
  - Example: payout approval endpoint explicitly says it is **not regulator approval**: `app/api/admin/orders/[orderId]/payout-approval/route.ts:L1-L6`

### 3.4 How posture is enforced in backend logic and payment flows
- TX-only enforcement for Texas-only categories in Stripe webhook handling: `app/api/stripe/webhook/handlers.ts:L148-L229`  
- Payout release blocked when disputes/chargebacks/admin holds exist: `lib/stripe/release-payment.ts:L35-L45`, `L103-L146`  

### 3.5 Applicable regulators (internal mapping)
This document does not provide legal advice; it documents where the platform references or is designed around certain regimes:
- **TPWD (Texas Parks & Wildlife)**: whitetail breeder transfer approval is explicitly represented as a required workflow document type and used as a payout gate.  
  - Evidence: `lib/compliance/policy.ts:L73-L80`, `lib/stripe/release-payment.ts:L148-L176`  
- **TAHC (Texas Animal Health Commission)**: CVI (`TAHC_CVI`) is a recognized document type and is required for payout release by policy for several categories.  
  - Evidence: `lib/compliance/policy.ts:L37-L45`, `L91-L98`, `L100-L139`; `app/api/orders/[orderId]/documents/upload/route.ts:L89-L100`
- **USDA / interstate movement**: the platform’s primary control is Texas-only gating for animal categories; it does not guarantee interstate compliance.  
  - Evidence: `app/terms/page.tsx:L100-L110`; TX-only enforcement in webhook: `app/api/stripe/webhook/handlers.ts:L165-L229`
- **USFWS / CITES / ESA overlay**: the platform forces listing review and blocks payout (admin approval required) for explicitly enumerated overlay species.  
  - Evidence: `lib/compliance/policy.ts:L22-L29`, `L55-L60`, `L115-L122`; `lib/compliance/validation.ts:L488-L506`

---

## 4) Category & Species Governance Model (by category)

### 4.1 Category: `whitetail_breeder`
**Intent:** highest-control category (“gold standard”).
- Listing-level review: always requires compliance review.  
  - Evidence: `lib/compliance/validation.ts:L496-L500`
- Payout-release gating: requires verified `TPWD_TRANSFER_APPROVAL`.  
  - Evidence: `lib/stripe/release-payment.ts:L148-L176`
- Seller attestation is required even for draft creation (whitetail-only hard gate).  
  - Evidence: `lib/firebase/listings.ts:L487-L492`

**Prohibited / constraints (in rules):** whitetail status transitions to pending/active require permit expiration date not in past and seller attestation.  
- Evidence: `firestore.rules:L235-L248`

**Residual risks:**  
- **UNKNOWN — NEEDS VERIFICATION**: exact whitetail-specific document collection and admin compliance queue behaviors beyond payout gating (additional files required for full whitetail operations mapping).

### 4.2 Category: `wildlife_exotics`
**Allowed species list is controlled** via `WildlifeAttributes.speciesId` values.  
- Evidence: `lib/types.ts:L107-L121` and `lib/types.ts:L236-L280` (EXOTIC_SPECIES list)

**Species-aware policy (internal controls):**
- All exotics require verified `TAHC_CVI` before payout release.  
  - Evidence: `lib/compliance/policy.ts:L42-L45`, `L100-L139`
- Exotic cervids require **admin payout approval** before payout release.  
  - Evidence: `lib/compliance/policy.ts:L124-L130`
- ESA/CITES overlay species: listing forced to `pending_review` and payout approval required (block by default until approval).  
  - Evidence: listing review: `lib/compliance/policy.ts:L55-L60`; validator: `lib/compliance/validation.ts:L488-L506`; payout block: `lib/compliance/policy.ts:L115-L122`
- `other_exotic`: listing forced to `pending_review` and payout approval required (block by default).  
  - Evidence: `lib/compliance/validation.ts:L502-L506`; payout block: `lib/compliance/policy.ts:L106-L113`

### 4.3 Category: `cattle_livestock`
Requires verified `TAHC_CVI` before payout release (policy).  
- Evidence: `lib/compliance/policy.ts:L39-L40`, `L91-L98`

### 4.4 Category: `horse_equestrian`
**Texas-only:** yes (policy attribute).  
- Evidence: `lib/compliance/requirements.ts:L62-L70`

**Checkout gate:** requires a Bill of Sale to be generated/available before checkout session creation (server-side).  
- Category requirement: `lib/compliance/requirements.ts:L62-L71`  
- Checkout enforcement: `app/api/stripe/checkout/create-session/route.ts:L719-L777`

**Payout gate (policy):** requires verified `TAHC_CVI` before payout release (does not block checkout by design; payout-only).  
- Evidence: `lib/compliance/policy.ts:L39-L41`, `lib/compliance/policy.ts:L91-L98`

**Bill of Sale document implementation details (internal):**
- Stored path uses an order-scoped Storage path: `lib/orders/billOfSale.ts:L11-L13`  
- Document content is generated deterministically and rendered to HTML/PDF: `lib/orders/billOfSale.ts:L108-L174`, `lib/orders/billOfSale.ts:L176-L204`  
- Inputs validate that parties and at least one identifier/registration exist: `lib/orders/billOfSale.ts:L71-L105`

### 4.5 Category: `sporting_working_dogs`
**Texas-only:** yes (policy attribute).  
- Evidence: `lib/compliance/requirements.ts:L72-L80`

**Document gates:** no mandatory payout doc gates under the current policy module (disclosure-only posture).  
- Evidence: `lib/compliance/policy.ts:L82-L89` (no required docs; no admin approval required)

**Optional documents supported for the category (uploadable):** includes health certificate, CVI, delivery proof, bill of sale, other.  
- Evidence: `lib/compliance/requirements.ts:L72-L80`

### 4.6 Non-animal categories (`ranch_equipment`, `ranch_vehicles`, `hunting_outfitter_assets`)
**Texas-only:** no (category requirements allow multi-state).  
- Evidence: `lib/compliance/requirements.ts:L82-L112`

**Residual risks:** non-animal categories still have fraud/title/lien risks; mitigations are primarily policy text + payment + dispute tooling.  
- Evidence (policy disclaimers): `app/legal/marketplace-policies/page.tsx:L56-L61`

---

## 5) Listing Lifecycle (Draft → Pending → Active → Sold/Expired/Removed)

### 5.1 Listing status model
Canonical listing statuses are: `draft` | `pending` | `active` | `sold` | `expired` | `removed`.  
- Evidence: `lib/types.ts:L15`

### 5.2 Draft creation
Draft listings are created client-side via `createListingDraft` and written to `listings/{listingId}` with `status: 'draft'` and a computed `complianceStatus`.  
- Evidence: `lib/firebase/listings.ts:L482-L529`

Draft creation gates that apply immediately:
- **Whitetail** draft creation requires seller attestation.  
  - Evidence: `lib/firebase/listings.ts:L487-L492`
- **Compliance validation** is executed at draft creation time (Texas-only, prohibited content checks, and category-specific validation), so invalid drafts should fail closed.  
  - Evidence: `lib/firebase/listings.ts:L494-L507`, `lib/compliance/validation.ts:L434-L483`

### 5.3 Publish (go-live) is server-authoritative
Publishing is performed through the server route `POST /api/listings/publish` to prevent bypassing gates (compliance validation, seller readiness, tier snapshots, whitetail internal flags).  
- Evidence: client uses server publish: `lib/firebase/listings.ts:L546-L585`  
- Evidence: server handler: `app/api/listings/publish/route.ts:L1-L23`, `L188-L241`

Publish preconditions (server-side):
- **Must be owner**: listing `sellerId` must match authenticated user.  
  - Evidence: `app/api/listings/publish/route.ts:L306-L309`
- **Must not already be active** (idempotent no-op if it is):  
  - Evidence: `app/api/listings/publish/route.ts:L311-L316`
- **Compliance validation must pass**:  
  - Evidence: `app/api/listings/publish/route.ts:L318-L346`
- **Required publish fields must be present** (title/desc/type/category/city/state/photos; price/auction fields).  
  - Evidence: `app/api/listings/publish/route.ts:L348-L360`, plus validation details: `app/api/listings/publish/route.ts:L60-L121`
- **Seller readiness gates**: profile completeness and Stripe payouts readiness.  
  - Evidence: profile completeness: `app/api/listings/publish/route.ts:L400-L414`  
  - Evidence: payouts readiness: `app/api/listings/publish/route.ts:L416-L431`
- **Animal-category seller acknowledgment** is required for non-whitetail animal categories; whitetail uses a stricter attestation gate.  
  - Evidence: whitetail attestation at publish: `app/api/listings/publish/route.ts:L362-L372`  
  - Evidence: seller animal attestation for other animal categories: `app/api/listings/publish/route.ts:L374-L389`

### 5.4 Publish outcomes (Pending vs Active)
**Pending path:** if the seller is not verified and/or the listing requires compliance review and/or category is whitetail, the listing moves to `status: 'pending'`.  
- Evidence: `app/api/listings/publish/route.ts:L481-L489`, `L498-L508`, `L598-L604`

**Active path:** otherwise the listing moves to `status: 'active'` and `publishedAt` is set.  
- Evidence: `app/api/listings/publish/route.ts:L607-L618`, `L627-L631`

### 5.5 Admin approval and compliance approval
There are distinct admin actions:
- **Admin listing approve** (`/api/admin/listings/[id]/approve`) sets listing `status: 'active'` and writes approval metadata; for whitetail it requires compliance approval first.  
  - Evidence: whitetail requires compliance approval: `app/api/admin/listings/[id]/approve/route.ts:L71-L81`  
  - Evidence: approve updates: `app/api/admin/listings/[id]/approve/route.ts:L83-L91`
- **Admin listing reject** (`/api/admin/listings/[id]/reject`) sets listing `status: 'removed'` and stores reason.  
  - Evidence: `app/api/admin/listings/[id]/reject/route.ts:L74-L83`
- **Compliance approve** (`/api/admin/compliance/listings/[listingId]/approve`) updates `complianceStatus: 'approved'` and may publish the listing depending on seller verification and category.  
  - Evidence: decision and update: `app/api/admin/compliance/listings/[listingId]/approve/route.ts:L39-L59`
- **Compliance reject** keeps listing pending and stores `complianceRejectionReason`.  
  - Evidence: `app/api/admin/compliance/listings/[listingId]/reject/route.ts:L53-L60`

### 5.6 “Sold / Expired / Removed” states
**UNKNOWN — NEEDS VERIFICATION**: exact server-side transitions to `sold` and `expired` for listings are not fully documented in this section yet.  
Known constraints:
- Listing read visibility includes `sold` and `expired` as public-readable statuses.  
  - Evidence: `firestore.rules:L168-L170`
- In checkout creation, fixed/classified require `listing.status === 'active'`, while auctions allow `active` or `expired` depending on finalization.  
  - Evidence: `app/api/stripe/checkout/create-session/route.ts:L257-L267`

Verification steps:
- Identify where listing is marked `sold` during checkout/webhook and where auctions are marked `expired`. (Expected surfaces include Stripe webhook handlers and auction finalization code.)

---

## 6) Order & Payment Lifecycle (Checkout → Webhook → Delivery → Dispute/Release)

### 6.1 Order status model
Canonical order statuses include `paid_held`, `paid`, `in_transit`, `delivered`, `buyer_confirmed`, `ready_to_release`, `completed`, `refunded`, `cancelled`, plus async-bank-rail states.  
- Evidence: `lib/types.ts:L495-L513`

### 6.2 Core principle: this is not a custody/intermediary service
Internally, funds are held for a **payout-hold workflow** (settlement + risk controls) and released only after workflow gates are satisfied. This does not represent custody of the underlying animal/good.  
- Legal framing: `app/terms/page.tsx:L214-L218`  
- Enforcement mechanism: `lib/stripe/release-payment.ts:L35-L45`, `L103-L146`

### 6.3 Checkout session creation (server route)
`POST /api/stripe/checkout/create-session` is the canonical checkout entrypoint. It enforces:
- Rate limiting (`RATE_LIMITS.checkout`) prior to auth: `app/api/stripe/checkout/create-session/route.ts:L87-L97`
- Auth via Firebase ID token, buyerId derived server-side: `app/api/stripe/checkout/create-session/route.ts:L99-L120`
- Email verification required: `app/api/stripe/checkout/create-session/route.ts:L121-L133`
- Listing availability and reservation logic to avoid double-selling: `app/api/stripe/checkout/create-session/route.ts:L201-L211`
- Texas-only enforcement (listing in TX and buyer profile state TX) for Texas-only categories: `app/api/stripe/checkout/create-session/route.ts:L368-L400`
- Bill of Sale required for certain categories (horses): `app/api/stripe/checkout/create-session/route.ts:L719-L777`

### 6.4 Stripe webhook ingestion (signature + idempotency)
`POST /api/stripe/webhook`:
- Reads raw body and verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET`: `app/api/stripe/webhook/route.ts:L61-L67`, `L105-L151`
- Implements idempotency via a Firestore transaction on `stripeEvents/{eventId}`: `app/api/stripe/webhook/route.ts:L153-L207`

### 6.5 Texas-only enforcement in the money path
In `checkout.session.completed` processing, TX-only categories trigger state verification via Stripe address signals; non-TX buyer triggers refund for card flows and a deferred path for async flows.  
- Evidence: `app/api/stripe/webhook/handlers.ts:L148-L229`

### 6.6 Delivery and confirmation flow
Seller marks delivered: `POST /api/orders/[orderId]/mark-delivered`
- Seller-only, status transition enforced, and delivery proof URLs can be attached: `app/api/orders/[orderId]/mark-delivered/route.ts:L94-L131`

Admin confirms delivery (starts protection window if enabled): `POST /api/orders/[orderId]/confirm-delivery`
- Admin-only check: `app/api/orders/[orderId]/confirm-delivery/route.ts:L64-L77`
- Sets protection window and payout hold reason `protection_window`: `app/api/orders/[orderId]/confirm-delivery/route.ts:L107-L133`
- Writes audit log: `app/api/orders/[orderId]/confirm-delivery/route.ts:L142-L173`

Buyer confirms receipt: `POST /api/orders/[orderId]/confirm-receipt`
- Buyer-only, requires delivered first: `app/api/orders/[orderId]/confirm-receipt/route.ts:L64-L90`
- If protected transaction and no dispute, transitions to `ready_to_release` and clears payout hold reason: `app/api/orders/[orderId]/confirm-receipt/route.ts:L106-L113`

### 6.7 Disputes (protected transaction)
Buyer opens dispute (evidence required; time windows enforced):  
- Evidence requirements: `app/api/orders/[orderId]/disputes/open/route.ts:L20-L27`, `L148-L152`  
- Time window logic: `app/api/orders/[orderId]/disputes/open/route.ts:L132-L146`  
- Opening dispute sets `payoutHoldReason: 'dispute_open'`: `app/api/orders/[orderId]/disputes/open/route.ts:L173-L184`

Admin resolves dispute (release/refund/partial refund):  
- Admin-only role check: `app/api/orders/[orderId]/disputes/resolve/route.ts:L69-L82`  
- Release path includes safety block against chargebacks/admin holds via shared gate: `app/api/orders/[orderId]/disputes/resolve/route.ts:L132-L140`
- Whitetail TPWD transfer approval is enforced before dispute-release payout: `app/api/orders/[orderId]/disputes/resolve/route.ts:L147-L174`

### 6.8 Payout release (manual and scheduled fallback)
Manual admin release: `POST /api/admin/orders/[orderId]/release`
- Admin role check: `app/api/admin/orders/[orderId]/release/route.ts:L54-L59`
- Uses shared `releasePaymentForOrder` logic: `app/api/admin/orders/[orderId]/release/route.ts:L63-L74`

Shared payout release gates:
- Blocks payout if chargeback/open protected dispute/admin hold already exists: `lib/stripe/release-payment.ts:L35-L45`, `L90-L110`, `L112-L137`
- Enforces whitetail TPWD transfer approval doc existence and updates transfer status: `lib/stripe/release-payment.ts:L148-L186`
- Enforces policy-driven docs/admin approval for non-whitetail categories: `lib/stripe/release-payment.ts:L189-L239` and policy: `lib/compliance/policy.ts:L65-L149`

Scheduled fallback auto-release: **RETIRED**. Payments are direct buyer→seller; no platform-held escrow or release job. System Health shows "autoReleaseProtected [RETIRED — informational only]" for historical opsHealth data only.

---

## 7) Compliance Document System

### 7.1 Document taxonomy
Document types are explicitly enumerated in `DocumentType`.  
- Evidence: `lib/types.ts:L975-L985`

Document status is one of `uploaded` | `verified` | `rejected`.  
- Evidence: `lib/types.ts:L987-L987`

### 7.2 Storage and access control (Firebase Storage)
Storage paths include:
- Listing documents: `listings/{listingId}/documents/{docId}/{fileName}` (not publicly readable; seller/admin only)  
  - Evidence: `storage.rules:L52-L63`
- Order documents: `orders/{orderId}/documents/{docId}/{fileName}` (buyer/seller/admin reads; buyer/seller writes)  
  - Evidence: `storage.rules:L65-L91`

### 7.3 Firestore document metadata
Listing documents are stored as Firestore docs under `listings/{listingId}/documents` and orders docs under `orders/{orderId}/documents`.  
- Listing rules: `firestore.rules:L262-L292`  
- Order rules: `firestore.rules:L476-L515`

Both listing and order document creates enforce:
- `status == 'uploaded'`
- `uploadedBy == request.auth.uid`
- `documentUrl` is `https://...`
- Evidence: listing docs: `firestore.rules:L279-L283`  
- Evidence: order docs: `firestore.rules:L492-L506`

### 7.4 Upload workflow (API routes)
Listing document upload API: `POST /api/listings/[id]/documents/upload`
- Seller-only ownership enforcement: `app/api/listings/[id]/documents/upload/route.ts:L66-L77`
- HTTPS URL enforcement and “never write undefined”: `app/api/listings/[id]/documents/upload/route.ts:L88-L107`

Order document upload API: `POST /api/orders/[orderId]/documents/upload`
- Buyer or seller only: `app/api/orders/[orderId]/documents/upload/route.ts:L62-L73`
- HTTPS URL enforcement and explicit allowlist of doc types: `app/api/orders/[orderId]/documents/upload/route.ts:L84-L100`

### 7.5 Verification workflow (admin-only)
Listing document verify/reject: `POST /api/admin/listings/[id]/documents/verify`
- Admin check via `requireAdmin`: `app/api/admin/listings/[id]/documents/verify/route.ts:L25-L33`
- Writes audit logs: `app/api/admin/listings/[id]/documents/verify/route.ts:L75-L99`
- Side effect: verifying `TPWD_BREEDER_PERMIT` can update listing compliance status: `app/api/admin/listings/[id]/documents/verify/route.ts:L101-L110`

Order document verify/reject: `POST /api/admin/orders/[orderId]/documents/verify`
- Admin check via `requireAdmin`: `app/api/admin/orders/[orderId]/documents/verify/route.ts:L27-L36`
- Writes audit logs: `app/api/admin/orders/[orderId]/documents/verify/route.ts:L77-L101`
- Side effect: verifying `TPWD_TRANSFER_APPROVAL` updates transfer permit status and writes timeline event: `app/api/admin/orders/[orderId]/documents/verify/route.ts:L103-L130`
- Side effect: verifying/rejecting `TAHC_CVI` updates payout hold reason and recomputes compliance snapshot: `app/api/admin/orders/[orderId]/documents/verify/route.ts:L132-L163`

### 7.6 How documents affect listing publish and payout eligibility
- Listing publish gating uses `complianceStatus` and seller verification state to decide `pending` vs `active`: `app/api/listings/publish/route.ts:L481-L489`, `L498-L508`, `L607-L618`
- Payout release gating checks for required verified docs under `orders/{orderId}/documents`: `lib/stripe/release-payment.ts:L195-L223`
- Admin payout approval gate exists for certain cases: `lib/stripe/release-payment.ts:L225-L239` and admin API: `app/api/admin/orders/[orderId]/payout-approval/route.ts:L1-L51`

---

## 8) Admin & Moderation Operations

### 8.1 Admin roles and permissions (what “admin” means in code)
Admin is determined by:
- Token claims (preferred): `hooks/use-admin.ts:L26-L51`
- Fallback to Firestore `users/{uid}.role` or legacy `superAdmin`: `hooks/use-admin.ts:L59-L89`

Server endpoints frequently re-check admin by reading `users/{uid}.role`:  
- Example: payout release endpoint: `app/api/admin/orders/[orderId]/release/route.ts:L54-L59`

### 8.2 Admin queues and primary actions
**Listing queues**
- Listing submission can route to `pending` for admin/compliance review: `app/api/listings/publish/route.ts:L481-L604`
- Approve listing: `app/api/admin/listings/[id]/approve/route.ts:L83-L91`
- Reject listing: `app/api/admin/listings/[id]/reject/route.ts:L74-L83`
- Compliance approve/reject: `app/api/admin/compliance/listings/[listingId]/approve/route.ts:L52-L59`, `app/api/admin/compliance/listings/[listingId]/reject/route.ts:L53-L60`

**Payout hold queue (compliance-specific)**
- Admin UI lists orders where `payoutHoldReason` is in a compliance set and allows “Approve payout” for review-required holds.  
  - Evidence: `app/dashboard/admin/compliance-holds/page.tsx:L27-L38`, `L65-L69`, `L176-L207`

### 8.3 Abuse/fraud prevention controls (observed)
- **Rate limiting**: sensitive routes require Redis in Netlify runtime or fail closed with 503.  
  - Evidence: config + behavior: `lib/rate-limit.ts:L61-L89`, `lib/rate-limit.ts:L122-L132`
- **Email verification gates**: required for publishing listings and checkout.  
  - Publish: `app/api/listings/publish/route.ts:L241-L252`  
  - Checkout: `app/api/stripe/checkout/create-session/route.ts:L121-L133`
- **Chargeback safety gate**: payout release blocks on open chargeback statuses.  
  - Evidence: `lib/stripe/release-payment.ts:L35-L45`, `L112-L128`

### 8.4 Logging and auditability
Audit log entries are written to Firestore `auditLogs` with standardized action types.  
- Evidence: audit types: `lib/audit/logger.ts:L41-L105`  
- Evidence: write path: `lib/audit/logger.ts:L129-L171`

Admin actions that write audits include:
- Listing approve/reject: `app/api/admin/listings/[id]/approve/route.ts:L93-L108`, `app/api/admin/listings/[id]/reject/route.ts:L93-L108`
- Listing compliance approve/reject: `app/api/admin/compliance/listings/[listingId]/approve/route.ts:L61-L75`, `app/api/admin/compliance/listings/[listingId]/reject/route.ts:L62-L76`
- Doc verify/reject (listing + order): `app/api/admin/listings/[id]/documents/verify/route.ts:L75-L99`, `app/api/admin/orders/[orderId]/documents/verify/route.ts:L77-L101`
- Payout release manual: `app/api/admin/orders/[orderId]/release/route.ts:L76-L86`

---

## 9) Data Architecture (High Level)

### 9.1 Core Firestore collections (compliance-relevant)
- `users/{userId}`: contains role and operational flags; protected by rules.  
  - Evidence: `firestore.rules:L46-L110`
- `publicProfiles/{userId}`: public-safe profile surface (explicitly disallows sensitive keys).  
  - Evidence: `firestore.rules:L115-L137`
- `publicSellerTrust/{userId}`: public trust signals (server-authored only).  
  - Evidence: `firestore.rules:L139-L147`
- `listings/{listingId}`: listing lifecycle states.  
  - Evidence: `firestore.rules:L160-L260`, listing statuses: `lib/types.ts:L15`
- `listings/{listingId}/documents/{documentId}`: listing compliance docs metadata.  
  - Evidence: `firestore.rules:L262-L292`
- `orders/{orderId}`: orders (server-created; controlled updates).  
  - Evidence: `firestore.rules:L417-L475`
- `orders/{orderId}/documents/{documentId}`: order docs metadata.  
  - Evidence: `firestore.rules:L476-L515`
- `stripeEvents/{eventId}`: webhook idempotency ledger.  
  - Evidence: `app/api/stripe/webhook/route.ts:L153-L200`
- `auditLogs/{auditId}`: audit trail.  
  - Evidence: `lib/audit/logger.ts:L144-L168`
- `opsHealth/{docId}`: operational health snapshots (e.g. stripeWebhook, aggregateRevenue, finalizeAuctions; autoReleaseProtected doc is historical/retired).

### 9.2 Least-privilege enforcement (rules)
- Orders cannot be client-created; clients must use API/webhooks.  
  - Evidence: `firestore.rules:L427-L430`
- Buyer/seller updates on orders are limited; payment/payout fields cannot be mutated by clients.  
  - Evidence: buyer restrictions: `firestore.rules:L431-L451`  
  - Evidence: seller restrictions: `firestore.rules:L452-L469`

### 9.3 Runtime/deployment configuration (relevant to compliance + money paths)
**Firebase Admin initialization in Netlify**
- Recommended approach: provide a base64-encoded service account JSON as a **build-only** env var, generate `netlify/secrets/firebase-service-account.json`, and bundle it into functions to avoid serverless env var limits.  
  - Evidence: `env.example:L17-L25`
- Netlify build step writes the bundled secret and builds Next.js; functions include only the bundled service account file (explicit included_files).  
  - Evidence: `netlify.toml:L1-L13`

**Stripe webhook secret**
- Webhook handler requires `STRIPE_WEBHOOK_SECRET` to verify signatures.  
  - Evidence: `app/api/stripe/webhook/route.ts:L105-L113`, `app/api/stripe/webhook/route.ts:L128-L151`

**Rate limiting (Upstash Redis)**
- Sensitive endpoints can be configured to **fail closed** (503) in Netlify runtime if Upstash env vars are missing (durable rate limiting requirement).  
  - Evidence: `lib/rate-limit.ts:L61-L89`, `lib/rate-limit.ts:L122-L132`
- **Gap:** `env.example` currently does not document `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.  
  - Evidence of required env lookup: `lib/rate-limit.ts:L33-L35`

---

## 10) Risk Register (Formal)

The likelihood/impact ratings below are internal assessments; mitigations are tied to specific code/policy controls.

| Risk | Likelihood | Impact | Mitigations (Evidence) | Residual Risk |
|---|---:|---:|---|---|
| Platform misclassified as broker/shipper/custody service by regulator/bank | Medium | High | Explicit marketplace-only posture + no transport statement (`app/terms/page.tsx:L30-L36`, `L162-L169`) and payout-hold framing (`app/terms/page.tsx:L214-L218`) | Copy drift and operational behavior could still create appearance risk |
| Interstate misuse attempts (non-TX buyer purchases animal) | Medium | High | TX-only enforcement at checkout + webhook (`app/api/stripe/checkout/create-session/route.ts:L368-L400`, `app/api/stripe/webhook/handlers.ts:L165-L229`) | Buyer profile location spoofing vs Stripe address mismatch; async rails have deferred handling |
| Missing required compliance docs before payout release (policy breach) | Medium | High | Policy gating at payout release (`lib/stripe/release-payment.ts:L189-L239`, `lib/compliance/policy.ts:L65-L149`), admin verification (`app/api/admin/orders/[orderId]/documents/verify/route.ts:L132-L163`) | Manual admin override mistakes; operational workload |
| Seller misrepresentation (permits/identity/health) | High | High | Seller attestation for whitetail (`lib/firebase/listings.ts:L487-L492`, `app/api/listings/publish/route.ts:L362-L372`) + dispute workflow and audit logs (`app/api/orders/[orderId]/disputes/open/route.ts:L175-L212`, `lib/audit/logger.ts:L41-L105`) | Cannot guarantee truth; relies on enforcement + user reports |
| Disease outbreak / animal health incidents | Medium | High | Terms disclaim risk and place responsibility on parties (`app/terms/page.tsx:L113-L130`) and dispute process exists | **UNKNOWN**: incident response SOP, regulator contact protocol |
| Fraud/abuse on sensitive endpoints | Medium | Medium | Rate limits with Redis-required fail-closed on Netlify (`lib/rate-limit.ts:L61-L89`, `L122-L132`) | Misconfiguration can cause 503s; monitoring needed |
| Webhook spoofing or replay | Low | High | Signature verification (`app/api/stripe/webhook/route.ts:L105-L151`) + idempotency ledger (`app/api/stripe/webhook/route.ts:L153-L207`) | **UNKNOWN**: Stripe dashboard webhook config correctness |
| Admin overreach / insufficient auditability | Medium | High | Audit logs on admin actions (`lib/audit/logger.ts:L41-L105`, `app/api/admin/orders/[orderId]/release/route.ts:L76-L86`) | **UNKNOWN**: retention policies, access controls to auditLogs in production |

---

## 11) Gap Analysis (Implemented vs Partial vs Missing)

### 11.1 Fully implemented (with evidence)
- TX-only enforcement in checkout + webhook (money path): `app/api/stripe/checkout/create-session/route.ts:L368-L400`, `app/api/stripe/webhook/handlers.ts:L165-L229`
- Payout release safety gates (chargeback/admin hold/disputes): `lib/stripe/release-payment.ts:L35-L45`, `L103-L146`
- Compliance policy module and payout gating: `lib/compliance/policy.ts:L65-L149`, `lib/stripe/release-payment.ts:L189-L239`
- Compliance doc upload + admin verification + audit logs: listing docs `app/api/listings/[id]/documents/upload/route.ts:L66-L107`, admin verify `app/api/admin/listings/[id]/documents/verify/route.ts:L75-L110`; order docs `app/api/orders/[orderId]/documents/upload/route.ts:L62-L100`, admin verify `app/api/admin/orders/[orderId]/documents/verify/route.ts:L132-L163`

### 11.2 Partially implemented / operationally dependent
- Auto-release scheduled function: **RETIRED**. Direct buyer→seller payments; no platform release job.
- Seller “verified” concept exists in snapshots and affects publish gating, but the process for verifying sellers is **UNKNOWN** without a documented SOP.  
  - Evidence of usage: publish gating uses `sellerVerified`: `app/api/listings/publish/route.ts:L441-L488`

### 11.3 Missing or unclear (explicit UNKNOWNs)
- Listing lifecycle transitions to `sold`/`expired` and their authoritative setters (beyond checkout gating). **UNKNOWN — NEEDS VERIFICATION**.  
- Origin/destination state capture for animals (beyond location state and buyer profile state). **UNKNOWN — NEEDS VERIFICATION**.  
- Formal written compliance SOP for TAHC/TPWD/USFWS inquiries and record retention. **UNKNOWN — NEEDS VERIFICATION**.

---

## 12) Operational Playbook (Internal)

### 12.1 Regulator inquiry (TPWD/TAHC/USDA/USFWS)
**Immediate steps:**
1) Confirm inquiry scope (specific listing/order/seller).  
2) Pull immutable evidence:
   - Listing doc + compliance status: `listings/{listingId}` (read rules allow admin): `firestore.rules:L168-L170`
   - Listing documents metadata: `listings/{listingId}/documents/*`: `firestore.rules:L262-L292`
   - Order doc + payout hold reason: `orders/{orderId}`: `firestore.rules:L419-L425`, `lib/types.ts:L663-L670`
   - Order documents metadata: `orders/{orderId}/documents/*`: `firestore.rules:L476-L515`
   - Audit logs for the listing/order: `lib/audit/logger.ts:L176-L205`
3) Provide the platform posture statement and explain the workflow scope:
   - Marketplace-only + Verified scope: `app/terms/page.tsx:L30-L36`
   - No transport: `app/terms/page.tsx:L162-L169`
4) If needed, show TX-only enforcement controls in payment path:
   - Checkout TX checks: `app/api/stripe/checkout/create-session/route.ts:L368-L400`
   - Webhook TX enforcement: `app/api/stripe/webhook/handlers.ts:L165-L229`

### 12.2 Stripe/bank inquiry (risk review / funds flow)
Provide:
- Webhook signature verification and idempotency controls: `app/api/stripe/webhook/route.ts:L105-L151`, `L153-L207`
- Payout release controls (gates): `lib/stripe/release-payment.ts:L35-L45`, `L189-L239`
- Proof of manual release being admin-only + audited: `app/api/admin/orders/[orderId]/release/route.ts:L54-L86`

### 12.3 Seller compliance dispute (documents / payout blocked)
Operator steps:
- Check `order.payoutHoldReason` and `order.complianceDocsStatus`: `lib/types.ts:L663-L690`
- Verify doc status and rejection reason in order docs: `orders/{orderId}/documents/*` per rules: `firestore.rules:L489-L515`
- If hold is review-required (e.g., exotic cervid / ESA overlay), use admin payout approval endpoint: `app/api/admin/orders/[orderId]/payout-approval/route.ts:L32-L51`

### 12.4 Buyer dispute (protected transaction)
Operator steps:
- Confirm delivery confirmation exists: `orders/{orderId}.deliveryConfirmedAt` is required for dispute open: `app/api/orders/[orderId]/disputes/open/route.ts:L105-L108`
- Verify evidence requirements and dispute status: `app/api/orders/[orderId]/disputes/open/route.ts:L148-L159`
- Admin resolves using dispute resolve route; payout release will be safety-gated: `app/api/orders/[orderId]/disputes/resolve/route.ts:L132-L140`

### 12.5 Disease-related incident
**UNKNOWN — NEEDS VERIFICATION**: this requires a founder-approved incident protocol (who contacts whom, what records are retained, and how quickly actions occur).
Suggested minimum input: designated incident owner, legal counsel escalation, and communications policy.

---

## 13) Appendices

### 13.1 Glossary (selected)
- **CVI**: Certificate of Veterinary Inspection (document type `TAHC_CVI` in platform). Evidence: `lib/types.ts:L976-L985`
- **TPWD transfer approval**: document type `TPWD_TRANSFER_APPROVAL` used as a payout gate for whitetail breeder orders. Evidence: `lib/stripe/release-payment.ts:L148-L176`
- **Payout hold**: internal settlement hold that prevents releasing funds to seller until workflow conditions are met. Evidence: `lib/types.ts:L519-L529`, `lib/stripe/release-payment.ts:L103-L146`

### 13.2 Category requirements table (code-derived)
See `lib/compliance/requirements.ts` for `texasOnly`, required disclosures, and required order documents by category.  
- Evidence: `lib/compliance/requirements.ts:L31-L112`

### 13.3 Document type table (code-derived)
See `lib/types.ts` for full document type list.  
- Evidence: `lib/types.ts:L975-L985`

---

## 14) INPUT REQUIRED FROM FOUNDER (UNKNOWN — NEEDS VERIFICATION)

These items cannot be proven from code/config in this repo and must be provided/confirmed:

1) **Corporate/legal**
   - Legal entity name, jurisdiction, registered agent, and official support contact.
   - Final Terms acceptance process (how versions are recorded for each user/order).
2) **Regulatory policy decisions**
   - Final “allowed species” policy mapping for wildlife exotics beyond the current controlled list (`EXOTIC_SPECIES`) and how “other_exotic” is operationally reviewed.
   - Whether the platform ever permits intrastate movement-only requirements vs exhibition transfers (currently not captured in listing fields in this document).
3) **Stripe / banking configuration**
   - Stripe account country, MCC/descriptor decisions, Connect settings, dispute handling processes.
   - Webhook endpoint configuration (events enabled, live secret correctness).
4) **Operational SOP**
   - Admin staffing/coverage for compliance review and dispute resolution.
   - Incident response SOP (disease outbreaks, regulator inquiries, fraud escalations).
5) **Data governance**
   - Retention period for audit logs and compliance docs.
   - Policy for deleting user data and documents.

