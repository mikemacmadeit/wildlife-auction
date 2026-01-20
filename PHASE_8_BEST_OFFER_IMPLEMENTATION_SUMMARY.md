# Phase 8 — Best Offer (“Or Best Offer”) Implementation Summary

## Goal
Add an eBay-style **Best Offer** flow for **Fixed Price** and **Classified** listings:
- Buyer makes offer
- Seller can accept / counter / decline
- Buyer can accept / counter / decline seller counter
- Offers expire automatically
- All transitions are **server-authoritative**
- Accepted offer converts into **Stripe Checkout** at agreed price
- Audit logs + least-privilege Firestore rules + indexes

---

## Data Model

### Listing fields (added)
Files:
- `project/lib/types.ts`
- `project/lib/types/firestore.ts`

Added:
- `bestOfferEnabled?: boolean`
- `bestOfferMinPrice?: number`
- `bestOfferAutoAcceptPrice?: number`
- `bestOfferSettings?: { enabled, minPrice?, autoAcceptPrice?, allowCounter, offerExpiryHours }`
- Reservation (server-only):
  - `offerReservedByOfferId?: string`
  - `offerReservedAt?: Date/Timestamp`

### Offers collection
Collection: `offers/{offerId}`

Shape:
- `listingId`
- `listingSnapshot { title, category, type, sellerId }`
- `sellerId`, `buyerId`
- `currency: "usd"`
- `status`: `open | countered | accepted | declined | withdrawn | expired | cancelled`
- `currentAmount`, `originalAmount`
- `lastActorRole`: `buyer | seller | system`
- `expiresAt`, `createdAt`, `updatedAt`
- `history[]` (thread)
- `acceptedAmount?`, `acceptedAt?`, `acceptedBy?`
- `checkoutSessionId?`, `orderId?`

---

## Server-Authoritative API Routes
All offer writes are **server-only** via Next.js route handlers. Clients cannot write to `offers` directly.

### Implemented routes
Files under `project/app/api/offers/`:
- `POST /api/offers/create` → `create/route.ts`
- `POST /api/offers/[offerId]/accept` → `[offerId]/accept/route.ts`
- `POST /api/offers/[offerId]/counter` → `[offerId]/counter/route.ts`
- `POST /api/offers/[offerId]/decline` → `[offerId]/decline/route.ts`
- `POST /api/offers/[offerId]/withdraw` → `[offerId]/withdraw/route.ts`
- `GET  /api/offers/listing/[listingId]` → `listing/[listingId]/route.ts` (seller/admin for a single listing)
- `GET  /api/offers/mine` → `mine/route.ts` (buyer)

Additional supporting routes (for UI):
- `GET /api/offers/seller` → `seller/route.ts` (seller inbox)
- `GET /api/offers/[offerId]` → `[offerId]/route.ts` (detail view)

Key behaviors enforced server-side:
- Listing must be `active`
- Listing type must be `fixed` or `classified`
- Best Offer must be enabled
- Buyer cannot be seller
- Minimum price enforced (if set)
- One active offer per buyer per listing (`open/countered`)
- Expiration enforced on every action; expired offers are marked `expired` in-transaction and actions are rejected
- Accept reserves listing (`offerReservedByOfferId`, `offerReservedAt`) in same transaction (prevents double accept)
- Listing reservation blocks new offers and blocks “Buy Now” checkout unless checkout is tied to the accepted offer
- Audit logs written for lifecycle actions (`offer_created`, `offer_countered`, etc.)

Shared helpers:
- `project/app/api/offers/_util.ts`
- `project/lib/firebase/admin.ts` (deterministic Admin SDK init)

---

## Stripe Checkout Integration (Accepted Offer → Buy)

### Checkout session route updated
File:
- `project/app/api/stripe/checkout/create-session/route.ts`

Changes:
- Accepts optional `offerId`
- If `offerId` present:
  - Loads offer, validates `accepted` + buyer ownership
  - Ensures listing is reserved by that offer
  - Uses `acceptedAmount` as the authoritative price
  - Prevents multiple sessions by locking `offer.checkoutSessionId`
  - Adds `offerId` to Stripe metadata

Client schema updated:
- `project/lib/validation/api-schemas.ts` (`offerId` optional)

Client helper updated:
- `project/lib/stripe/api.ts` now supports `createCheckoutSession(listingId, offerId?)`

### Webhook updated
File:
- `project/app/api/stripe/webhook/handlers.ts`

Changes:
- If `metadata.offerId` exists:
  - `order.offerId` stored
  - offer is linked with `checkoutSessionId` + `orderId`

---

## UI

### Listing page
File:
- `project/app/listing/[id]/page.tsx`

Changes:
- “Buy Now” is disabled if listing is reserved by an accepted offer
- Added Best Offer panel (buyer-side) via:
  - `project/components/offers/OfferPanel.tsx`

### Seller inbox + detail
Files:
- `project/app/seller/offers/page.tsx`
- `project/app/seller/offers/[offerId]/page.tsx`

Uses API routes to list and act on offers.

### Buyer “My Offers”
File:
- `project/app/dashboard/offers/page.tsx`

### Listing create/edit controls
Files:
- `project/app/dashboard/listings/new/page.tsx`
- `project/app/seller/listings/[id]/edit/page.tsx`

Adds a simple “Or Best Offer” section for fixed/classified listings.

---

## Scheduled Expiration Job
File:
- `project/netlify/functions/expireOffers.ts`

Runs every 10 minutes:
- Finds `open/countered` offers with `expiresAt <= now`
- Marks `expired`, appends history entry, writes audit logs

---

## Security (Firestore Rules)
File:
- `project/firestore.rules`

Changes:
- `offers`:
  - **read** only for buyerId/sellerId/admin
  - **no writes** from clients
- `listings`:
  - Reservation fields (`offerReservedByOfferId`, `offerReservedAt`) are **server-only**

---

## Indexes
File:
- `project/firestore.indexes.json`

Added composite indexes for:
- sellerId/status/updatedAt
- buyerId/status/updatedAt
- listingId/status/updatedAt
- status/expiresAt (expiration job)
- listingId/buyerId/status (one-active-offer enforcement)

---

## Manual Test Checklist

### Setup
- Create a fixed price listing
- Enable Best Offer, set min price, set expiry to 48h

### Buyer creates offer
- Offer below min → **rejected**
- Offer valid → status `open`
- Same buyer tries again while open/countered → **rejected**

### Negotiation
- Seller counters → buyer sees `countered` and can accept/counter/decline
- Buyer counters → seller sees updated amount/history

### Accept + reserve
- Seller accepts open/countered → offer becomes `accepted`, listing reserved
- Verify “Buy Now” on listing is blocked for everyone

### Checkout at accepted price
- Buyer clicks “Buy at accepted price” → creates Stripe session with `offerId` metadata
- Complete checkout → order created with `offerId`; offer updated with `orderId`
- Existing payout-hold/dispute flows continue unchanged

### Expiration
- Force an offer to expire (edit `expiresAt` in Firestore) → scheduled job marks `expired`
- Attempt action on expired offer → rejected and remains `expired`

---

## Deployment Notes
- Deploy Firestore rules: `firebase deploy --only firestore:rules`
- Deploy Firestore indexes: `firebase deploy --only firestore:indexes`
- Ensure Netlify scheduled functions are enabled (expire job runs every 10 min)

