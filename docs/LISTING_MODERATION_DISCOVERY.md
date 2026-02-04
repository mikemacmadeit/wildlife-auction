# Listing Moderation & Auto-Publish — Discovery Answers

Answers to the Cursor Discovery Questions for implementing listing moderation and auto-publish.

---

## 1) Listing Data Model

**Primary collection path:** `listings/{listingId}`

**Key fields (from `lib/types.ts`, `lib/types/firestore.ts`):**

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Document ID |
| `title` | string | |
| `description` | string | |
| `type` | ListingType | `'auction' \| 'fixed' \| 'classified'` |
| `category` | ListingCategory | e.g. `whitetail_breeder`, `wildlife_exotics`, `cattle_livestock`, etc. |
| `status` | ListingStatus | **`'draft' \| 'pending' \| 'active' \| 'sold' \| 'ended' \| 'expired' \| 'removed'`** |
| `complianceStatus` | ComplianceStatus | `'none' \| 'pending_review' \| 'approved' \| 'rejected'` |
| `price`, `startingBid`, `reservePrice` | number | Type-specific pricing |
| `images`, `photoIds`, `photos`, `coverPhotoId` | various | Media (Firebase Storage URLs) |
| `location` | `{ city, state, zip? }` | |
| `sellerId` | string | Firebase Auth UID |
| `sellerSnapshot` | object | Denormalized at publish (displayName, verified, photoURL, completedSalesCount, badges) |
| `sellerTierSnapshot`, `sellerTierWeightSnapshot` | string/number | Set at publish for ranking |
| `trust` | object | verified, insuranceAvailable, transportReady |
| `transportOption` | string | `SELLER_TRANSPORT` \| `BUYER_TRANSPORT` |
| `deliveryDetails` | object | maxDeliveryRadiusMiles, deliveryTimeframe, deliveryNotes, deliveryStatusExplanation |
| `attributes` | ListingAttributes | Category-specific (WhitetailBreederAttributes, WildlifeAttributes, etc.) |
| `durationDays` | 1\|3\|5\|7\|10 | eBay-style |
| `startAt`, `endAt`, `endsAt`, `endedAt`, `endedReason` | Timestamp/Date | Duration lifecycle |
| `publishedAt` | Timestamp | Set when goes live |
| `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | Timestamp/string | Audit |
| `aiAdminSummary`, `aiAdminSummaryAt`, `aiAdminSummaryModel` | string/timestamp | AI-generated summary (advisory) |
| `internalFlags`, `internalFlagsNotes` | object | Whitetail: duplicatePermitNumber, duplicateFacilityId |
| `sellerAttestationAccepted`, `sellerAttestationAcceptedAt` | boolean/timestamp | Whitetail permit attestation |
| `sellerAnimalAttestationAccepted` | boolean | Animal category acknowledgment |

**Status / draft vs published:**  
- **`status: 'draft'`** = not published  
- **`status: 'pending'`** = submitted for review (admin approval or compliance)  
- **`status: 'active'`** = live  

**Editable after publish:** Yes. Sellers can update many fields; Firestore rules block changing `sellerId`, `createdBy`, `createdAt`, duration lifecycle (`startAt`, `endAt`, etc.), reservation fields, and `complianceStatus` to `approved`/`rejected`. Sellers cannot set `status` to `active` directly—only via server publish route.

---

## 2) Listing Creation & Publish Flow

**Where seller creates:**  
- **New:** `app/dashboard/listings/new/NewListingClient.tsx` (client)  
- **Edit:** `app/seller/listings/[id]/edit/page.tsx`  
- **Duplicate:** `app/api/listings/[id]/duplicate/route.ts` → creates draft  

**Where seller clicks Publish:**  
- New: `NewListingClient.tsx` → Review step → "Publish Listing" → seller ack modal → `handleComplete`  
- Edit: Edit page → "Publish Listing" when draft  
- My Listings: `app/seller/listings/page.tsx` → "Promote" on draft cards  

**What happens on Publish:**  
1. Client calls `publishListing(uid, listingId)` in `lib/firebase/listings.ts`  
2. That calls `POST /api/listings/publish` with `{ listingId }`  
3. Server (`app/api/listings/publish/route.ts`):  
   - Validates auth, ownership, required fields  
   - Runs compliance validation (`validateListingCompliance`)  
   - Checks seller attestation (whitetail + animal)  
   - Checks profile (name, phone, location) and Stripe payouts  
   - If **needs review** (unverified seller, compliance, whitetail): sets `status: 'pending'`, optionally generates AI summary (async), notifies admins  
   - If **no review**: sets `status: 'active'`, `publishedAt`, `startAt`, `endAt`, etc.  

**Validation before publish:** Server-side in `/api/listings/publish`: required fields (title, description, category, type, location, photos, pricing by type), compliance, attestations, profile, payouts.  

**Publish is async (server):** Optimistic UI with loading state; actual publish is server-driven.

---

## 3) Admin Approval / Review System (Current)

**Approval dashboard:**  
- `app/dashboard/admin/listings/page.tsx` — Approve Listings admin page  
- Filters: all, pending, compliance  
- Shows listing cards with Approve / Reject  

**How admin approves:**  
- Approve: `app/api/admin/listings/[id]/approve/route.ts` — sets `complianceStatus: 'approved'`, may set `status: 'active'` if seller is verified and not whitetail  
- Compliance-specific: `app/api/admin/compliance/listings/[listingId]/approve/route.ts` — same pattern  
- Reject: `app/api/admin/compliance/listings/[listingId]/reject/route.ts` — sets `complianceStatus: 'rejected'`, `complianceRejectionReason`  

**Manual vs automated:** Manual only. No auto-approval logic.  

**Review queue:** Filtering by `status === 'pending'` and optionally `complianceStatus === 'pending_review'`.  

**Rejection reasons:** Stored in `complianceRejectionReason`. Reject dialog options (e.g. `missing_required_info`, `prohibited_content`) in `AdminListingsPage`; custom note supported.

---

## 4) User Roles & Permissions

**Roles:** Stored in `users/{uid}` as `role`: `'admin'` \| `'super_admin'` (or legacy `superAdmin`). Also in Firebase Auth custom claims (`role`, `superAdmin`).  

**Where enforced:**  
- AdminContext / `useAdmin` for UI  
- API routes use `requireAdmin` or token verification  
- Firestore rules: `isAdmin()` checks token claims or `users/{uid}.role`  

**Sellers and `published`:** Sellers cannot set `status: 'active'` or `complianceStatus: 'approved'`/`'rejected'` in Firestore. Publish goes through `/api/listings/publish`; status transitions are server-authored.  

**Firestore rules:**  
- Create: must be `status: 'draft'`, `sellerId == auth.uid`, no server-only fields  
- Update: seller can update own listing but cannot change `complianceStatus` to approved/rejected; admins can  
- Read: public for active/sold/ended/expired; seller for own; admin for all  

---

## 5) AI / GPT Usage (Current)

**GPT on listings:**  
- **Where:** `lib/admin/ai-summary.ts` — `generateAISummary` for entities including listings  
- **Trigger:** When a listing goes to `status: 'pending'` in `/api/listings/publish` (async, non-blocking)  
- **Model:** `gpt-4o-mini`  
- **Input:** Full listing data (with sensitive fields stripped)  
- **Output:** Free-text summary stored in `aiAdminSummary`, `aiAdminSummaryAt`, `aiAdminSummaryModel`  
- **Admin UI:** `AIAdminSummary` component on admin listing detail; collapsible, advisory only  
- **Feature flag:** `AI_ADMIN_SUMMARY_ENABLED=true` (env)  

**GPT not used for:** Moderation decisions, auto-approve/reject, image analysis, species validation.  

**AI also used for:**  
- Order/admin summaries (`entityType: 'order'`)  
- Dispute summaries (`AIDisputeSummary`)  
- Help chat (KB-grounded)  
- Support ticket drafts  

---

## 6) Image Handling

**Storage:** Firebase Storage  
- User uploads: `users/{userId}/uploads/{photoId}/{fileName}`  
- Listing images (legacy): `listings/{listingId}/images/{imageId}.webp`  
- Listing documents: `listings/{listingId}/documents/{docId}/{fileName}`  

**Required photos:** At least one (validated in publish required-fields).  

**Image moderation:** None. No vision model, no content filters.  

---

## 7) Species / Category Structure

**Species:**  
- **Wildlife/Exotics:** Controlled list in `lib/types.ts` (`EXOTIC_SPECIES`), e.g. axis, fallow, blackbuck, nilgai, elk, etc.  
- **Labels:** `lib/taxonomy/exotic-species.ts` — searchable options for UI  
- **Stored as:** `attributes.speciesId` (e.g. `'axis'`, `'nilgai'`)  
- **Whitetail:** Fixed `speciesId: 'whitetail_deer'`  

**Category:** `ListingCategory` enum (whitetail_breeder, wildlife_exotics, cattle_livestock, horse_equestrian, etc.). Listings belong to one category.  

**Species requirement:** Required for animal categories (part of `attributes`).  

**Texas legality:**  
- `lib/compliance/validation.ts` — prohibited keywords, Texas-only for animal categories  
- `lib/compliance/requirements.ts` — `isTexasOnlyCategory`, `getCategoryRequirements`  
- Whitetail: TPWD permit, breeder facility, attestation  

---

## 8) Seller Compliance / Trust

**Profile:** `users/{uid}` with `profile` (fullName, businessName, location, etc.), `seller` (verified, credentials), `stripeAccountId`, `payoutsEnabled`, etc.  

**Trust signals:**  
- `seller.verified`, `seller.credentials.identityVerified`  
- `publicSellerTrust/{uid}` — `badgeIds` (e.g. `tpwd_breeder_permit_verified`)  
- Breeder permits: `breederPermits` collection (status, permit number, etc.)  
- `adminFlags.sellingDisabled` — blocks publish  

**Strikes/violations:** Not explicitly modeled; `sellingDisabled` is the main enforcement.  

**Trusted seller:** `seller.verified` or identity verification; used for admin approval gating (unverified → pending).

---

## 9) Firestore Structure & Patterns

**Collections:** Top-level (`listings`, `orders`, `users`, `bids`, `reviews`, etc.). Some subcollections (e.g. `listings/{id}/documents`, `listings/{id}/autoBids`, `orders/{id}/...`).  

**Denormalization:** Seller snapshot on listing at publish; order snapshots; publicSellerTrust for badges.  

**Naming:** camelCase for fields; collection names plural.  

**Indexes:** Composite indexes for common queries (browse, seller listings, admin filters); see `firestore.indexes.json`.  

---

## 10) Backend Architecture

**Primary backend:** Next.js API routes (`app/api/...`)  
**Also:** Netlify Functions (`netlify/functions/`) for background jobs (notifications, auction expiry, etc.)  

**Listing moderation logic:** Lives in Next.js API routes (`/api/listings/publish`, `/api/admin/listings/[id]/approve`, `/api/admin/compliance/listings/[listingId]/approve|reject`).  

**Firestore triggers:** Not used for listing moderation.  

**Async work:** AI summary generation is async (non-blocking) after listing submission. Background jobs are acceptable.

---

## 11) Admin Configuration & Feature Flags

**Config:** No dedicated admin config collection. Feature toggles are env vars (e.g. `AI_ADMIN_SUMMARY_ENABLED`, `AI_HELP_CHAT_ENABLED`).  

**Toggles:** Global, env-based. No per-category or per-user toggles for AI.  

**Effect:** Changes require redeploy for env-based flags.

---

## 12) Admin Audit & Oversight Requirements

**AI visibility:**  
- AI summary is shown in admin listing/order detail (collapsible)  
- No structured confidence scores; free-text summary only  
- Model name stored (`aiAdminSummaryModel`)  

**Override:** Admins approve/reject manually; AI is advisory.  

**Audit:** `auditLogs` collection; admin actions (approve, reject) log actor, actionType, target, createdAt, before/after state.  

**Policy version:** Not explicitly tracked.

---

## 13) Failure & Safety Expectations

**AI failure/timeout:** AI summary is non-blocking; listing submission succeeds. Summary generation failures are logged.  

**AI off:** When `AI_ADMIN_SUMMARY_ENABLED` is false, no AI summary is generated; admin sees "AI Summary is off" in UI.  

**Editable while pending:** Sellers can edit draft; pending listings can be resubmitted after rejection (`/api/listings/[id]/resubmit`). Edits while pending are allowed per Firestore rules (seller can update own listing).

---

## 14) Non-Goals (Important)

**Preserve:**  
- Existing Firestore schema and rules  
- Publish flow and validation  
- Admin approval UX pattern  
- Compliance validation for Texas wildlife  

**Constraints:**  
- Firebase/Firestore as primary DB  
- Netlify for deployment  
- Stripe for payments  
- No breaking changes to seller flows  

**Sensitive:** Texas wildlife regulations, whitetail breeder permits, prohibited content (venison, meat, tags, etc.).

---

## 15) Output Expectations

**Scope:** Incremental, behind feature flags where appropriate.  

**Structure:** Existing patterns (API routes, Firestore, env flags) should be followed.  

**Testing:** Unit tests exist for key logic; integration tests for some flows. Logging/audit for moderation actions is already in place.

---

## Summary: Current Moderation Flow

1. **Seller** creates draft → saves → clicks Publish.  
2. **Client** calls `POST /api/listings/publish` with `listingId`.  
3. **Server** validates; if needs review → `status: 'pending'`, optional AI summary (async), admin notifications.  
4. **Admin** sees pending listings in `/dashboard/admin/listings`, approves or rejects.  
5. **Approval** sets `complianceStatus: 'approved'` and optionally `status: 'active'` (if seller verified and not whitetail).  
6. **Rejection** sets `complianceStatus: 'rejected'`; seller can fix and resubmit.
