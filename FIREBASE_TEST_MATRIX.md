# Firebase Test Matrix — Wildlife Exchange

**Purpose:** Map core user flows to expected Firestore/Storage reads and writes and permissions. Use for QA and regression checks.

---

## 1. Auth & bootstrap

| Step | Actor | Firestore | Storage | Notes |
|------|--------|-----------|---------|-------|
| Sign up | User | Create `users/{uid}` (owner) | — | Rules: owner create, allowlist |
| Sign in | User | Read `users/{uid}` (client) | — | Owner or admin |
| Bootstrap user | Client → API | Create/merge `users/{uid}`, `publicProfiles/{uid}` | — | API uses Admin SDK |
| Send verification email | Client → API | Read `users/{uid}` | — | Auth only |

---

## 2. Listings

| Step | Actor | Firestore | Storage | Notes |
|------|--------|-----------|---------|-------|
| Create draft | Seller | Create `listings` (status draft, sellerId/createdBy) | — | Rules: owner, allowlist |
| Upload listing image | Seller | — | Write `listings/{id}/images/{file}` | Rules: listing owner or admin |
| Publish | Seller → API | Update `listings` (status, etc.) | — | Publish route; server validates |
| View listing (active) | Any | Read `listings/{id}` | Read listing images | Public read for active/sold/ended |
| Delete listing | Seller/admin → API | Delete `listings/{id}`; delete subcollections | Delete listing images, docs | Delete route; Admin SDK for Storage |

---

## 3. Watchlist

| Step | Actor | Firestore | Storage | Notes |
|------|--------|-----------|---------|-------|
| Add to watchlist | User → API | Create `users/{uid}/watchlist/{listingId}`; create `listings/{id}/watchers/{uid}`; update `listings` watcherCount | — | Toggle API; Admin SDK only |
| Remove | User → API | Delete watchlist + watchers docs; update listing counts | — | Same |
| View watchlist | User | Read `users/{uid}/watchlist` | — | Owner only |

---

## 4. Bids & auctions

| Step | Actor | Firestore | Storage | Notes |
|------|--------|-----------|---------|-------|
| Place bid | User → API | Create `bids`; update `listings` (currentBid, etc.) | — | Bids API; Admin SDK. Rules: bids create false |
| Set auto-bid | User → API | Create/update `listings/{id}/autoBids/{uid}` | — | Server-only; rules deny client |

---

## 5. Offers

| Step | Actor | Firestore | Storage | Notes |
|------|--------|-----------|---------|-------|
| Create offer | User → API | Create `offers`; optionally reserve listing | — | Offers API; Admin SDK. Rules: offers create false |
| Counter / decline / accept | Seller/buyer → API | Update `offers`; update `listings` if accepted | — | Admin SDK |

---

## 6. Checkout & orders

| Step | Actor | Firestore | Storage | Notes |
|------|--------|-----------|---------|-------|
| Create checkout session | User → API | Read listing, user; idempotency `checkoutSessions`; create `orders`; create `listings/{id}/purchaseReservations` | — | Checkout route; Admin SDK |
| Stripe webhook (payment success) | Webhook | Read `stripeEvents` (idempotency); update `orders`; update `listings`; delete reservation | — | Handlers; Admin SDK |
| Mark delivered / confirm receipt | Seller/buyer → API | Update `orders` (status) | — | Rules: buyer/seller allowlist |

---

## 7. Messaging

| Step | Actor | Firestore | Storage | Notes |
|------|--------|-----------|---------|-------|
| Get or create thread | User → API | Query `messageThreads`; create if missing | — | Participant create |
| Send message | User → API | Create `messageThreads/{id}/messages` | — | Participant create; senderId |
| Upload attachment | User | — | Write `messageThreads/{id}/attachments/...` | Rules: participant; 10 MB, image/* |
| List threads | User | Query `messageThreads` by buyerId/sellerId | — | Participant read |

---

## 8. Disputes & admin

| Step | Actor | Firestore | Storage | Notes |
|------|--------|-----------|---------|-------|
| Open dispute | Buyer → API | Update `orders`; create `chargebacks` (via API) | — | Admin SDK |
| Dispute packet | Admin → API | Read `orders`, `listings`, `users`; **messageThreads** + **messages** (not top-level `messages`) | — | Fix F1 |
| Resolve dispute | Admin → API | Update `orders`, `chargebacks` | — | Admin SDK |

---

## 9. Notifications & jobs

| Step | Actor | Firestore | Storage | Notes |
|------|--------|-----------|---------|-------|
| Process events | Netlify / API | Read `events`; write `users/{uid}/notifications`; write `emailJobs`, etc. | — | Admin SDK |
| Order delivery check-in | Scheduled | Query `orders` by `deliveryConfirmedAt` (**orderBy** required) | — | Fix F2 |
| Expire listings | Scheduled | Query `listings` (status, endAt or fallback); update `listings` | — | Index F4 |
| Auction ending soon | Scheduled | Query `listings`; `listings/{id}/watchers` or `collectionGroup('watchlist')` | — | Index F5 |

---

## 10. Storage summary

| Path | Read | Write | Who |
|------|------|-------|-----|
| `listings/{id}/images` | Public | Listing owner, admin | Listing images |
| `listings/{id}/documents` | Owner, admin | Owner, admin | Compliance docs |
| `orders/{id}/documents` | Buyer, seller, admin | Buyer, seller | Order docs |
| `messageThreads/{id}/attachments` | Participant | Participant (10 MB, image) | Attachments |
| `users/{uid}/uploads` | Owner | Owner | Upload library |
| `users/{uid}/profile` | Public | Owner | Avatar / logo |
| `seller-permits/{id}/...` | Owner, admin | Owner, admin | Permit docs |

---

*Use this matrix to design QA scenarios and to verify that each flow uses the intended collections and rules.*
