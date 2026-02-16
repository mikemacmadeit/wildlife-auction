# Best-in-Class Marketplace Features — Repo Review

**Purpose:** After reviewing the repo, this list shows what you **already have** vs. what would make users **love** the marketplace. All items are grounded in the codebase.

---

## What you already have ✅

### Discovery & search
- **Browse** with filters: category, type (auction/fixed), location (state), price range, ending soon, sort (newest, price, ending soon). (`app/browse/page.tsx`, `lib/firebase/listings.ts` — `queryListingsForBrowse`)
- **Full-text search** (client-side): title, description, location, attributes. (`app/browse/page.tsx` — `debouncedSearchQuery` filter)
- **Saved searches** with alerts: create from browse filters, instant/daily/weekly email + in-app. (`lib/firebase/savedSearches.ts`, `SavedSearchesPanel`, `savedSearchInstant.ts`, `savedSearchWeeklyDigest.ts`, `matchListingToSavedSearch`)
- **Category browse pages**: cattle, horse, wildlife, ranch equipment, etc. (`app/browse/*`)

### Watchlist & favorites
- **Watchlist**: add/remove per listing, Firestore-backed, cross-device. (`useFavorites`, `FavoriteButton`, `app/dashboard/watchlist/page.tsx`, `app/api/watchlist/toggle`)
- **Watchlist page**: tabs (Active, Ended, Sold), filters, sort (ending soon, newest, price), countdown timers, bulk actions. (`app/dashboard/watchlist/page.tsx`)
- **Saved sellers** list on watchlist. (`SavedSellersList`)
- **Watcher count** on listings; dashboard shows watchers per listing. (`watcherCount`, `getSellerDashboardData` — `watcherCount` / `metrics.favorites`)

### Make an offer
- **Best Offer**: make offer, counter, accept, decline, withdraw; expiry; payment method preference; checkout from accepted offer. (`OfferPanel`, `lib/offers/api`, `app/api/offers/create`, Bids & Offers dashboard)
- **Offer from messages** dialog. (`OfferFromMessagesDialog`)

### Reviews & trust
- **Reviews**: verified-purchase reviews (1–5 stars + text), stored per order, aggregated on seller. (`reviews` collection, `app/api/reviews/create`, `lib/reviews/aggregates`, seller profile + reputation page)
- **Seller profile** shows reviews, rating, “Verified purchase.” (`app/sellers/[sellerId]/page.tsx`, `app/api/reviews/seller`)
- **Trust badges**: StatusBadge, TrustBadges, SellerTrustBadges, BreederPermitCard. (`components/trust`, `components/seller`, `components/compliance`)

### Seller analytics & insights
- **Listing view count**: POST `/api/listings/[id]/view` increments `metrics.views`; seller listings page shows views. (`app/api/listings/[id]/view`, seller listings — `metrics.views`)
- **Seller dashboard**: active listings, offers, orders, watcher count, bid count per listing. (`getSellerDashboardData`, `app/seller/overview/page.tsx`)
- **Seller insights**: “High watchers no bids,” “Offers expiring soon,” etc. (`getSellerInsights`, overview)

### Checkout & delivery
- **Saved addresses**: save, default, use at checkout; AddressPickerModal (Places + manual). (`lib/firebase/addresses.ts`, `SavedAddressesPanel`, `users/{uid}/addresses`, `users/{uid}/checkout/current`)
- **Delivery address** at order creation (webhook uses checkout current); set/update post-payment on order page. (webhook handlers, `api/orders/[orderId]/set-delivery-address`)

### Notifications
- **Channels**: in-app, email, push, SMS (pipeline in place; SMS pending A2P). (`lib/notifications/processEvent`, rules, NotificationPreferencesPanel)
- **Auction ending soon** (24h/1h/10m/2m), outbid, won, message received, order/delivery events. (notification rules, email templates, `auctionEndingSoon` cron)

### Onboarding & first-time
- **Quick Setup Tour**: profile → email verify → Stripe Connect → first listing; for new users (7 days). (`QuickSetupTour`, `useQuickSetupTour`)
- **Profile completion** gate/modal; legal accept flow. (`ProfileCompletionModal`, `RequireAuth` → `/legal/accept`)

### Related listings & comps
- **Related listings**: same category, client-side from `allListings` prop. (`RelatedListings.tsx`)
- **Sold comps** API and UI on listing detail. (`/api/listings/comps`, ListingDetailClient — `soldComps`, `soldCompsStats`)

### Payout clarity
- **Order snapshot**: `sellerPayoutAmount`, `platformFeeAmount` in order. (webhook)
- **Copy**: “Seller receives funds immediately…”, Payouts page, help. (`lib/orders/copy`, seller sales, trust page, help)

---

## Gaps & best-in-class additions

### High impact (users will notice)

| Feature | Status | Notes |
|--------|--------|--------|
| **Watchlist “ending soon” / “price drop” alerts** | Partial | Ending-soon notifications exist for *auction* watchers (notification rules); no dedicated “watchlist item ending in 1h” or “price dropped” email/in-app. Add: trigger for “listing on watchlist is ending in X” and optional “price reduced” (if you store price history). |
| **Similar listings (server-side)** | Partial | `RelatedListings` uses same-category only and needs `allListings` passed in (client-side). Best-in-class: server-side “more like this” by category + attributes (e.g. species, state) or a small recommendation endpoint so listing detail doesn’t depend on preloaded list. |
| **Seller “why isn’t this selling?” tips** | Partial | `getSellerInsights` has “high watchers no bids”; no explicit “add a photo,” “lower price,” “improve title” tips. Add: 2–3 concrete, rule-based tips per listing (e.g. no primary image, price above median, short title). |
| **“You get $X” before publish / at sale** | Partial | Order has `sellerPayoutAmount`; publish flow and listing preview don’t clearly show “You’ll get ~$X after fees.” Add: on publish (or preview) and on sale confirmation, show estimated/actual net to seller. |
| **Reviews on listing page** | Missing | Reviews live on seller profile and reputation; listing detail doesn’t show “X reviews for this seller” or recent reviews for that listing/seller. Add: small block on listing page (e.g. seller rating + “See all reviews” link). |
| **Empty states with next step** | Partial | Some “no listings,” “no orders” copy exists; not every list has a clear CTA (e.g. “No watchlist items — browse and tap the heart”). Audit empty states and add one clear action per screen. |
| **First-time buyer flow** | Partial | No dedicated “first purchase” tooltip or 3-step (find → pay → track). Optional: short “How buying works” or contextual tip on first visit to checkout/order page. |

### Medium impact (trust and polish)

| Feature | Status | Notes |
|--------|--------|--------|
| **Listing-level review snippet** | Missing | Seller has aggregate rating; listing card/detail doesn’t show “4.8 · 12 reviews” for that seller. Add: denormalized or fetched rating + count on listing card and detail. |
| **Response time / “Usually responds in Xh”** | Missing | No “responds in &lt; 24h” style metric. Add: from message threads, compute last N response times and show on seller profile/card. |
| **Saved address at checkout** | Done | Saved addresses + default + checkout current; ensure “Choose from saved” is obvious on first checkout. |
| **SMS for critical alerts** | Pending | Pipeline and UI done; enable once A2P approved so “order shipped,” “delivery tomorrow” can be SMS. |

### Nice to have

| Feature | Status | Notes |
|--------|--------|--------|
| **Duplicate listing** | Missing | “Sell another like this” from existing listing (copy draft with new id, clear sold/order fields). |
| **Bulk “mark shipped”** | Missing | Seller can do one-by-one; bulk action for “Mark these as shipped” would save time. |
| **“Back in stock” / “Similar listing available”** | Missing | Saved search covers “new listing matching criteria”; no explicit “this seller listed something similar” or “back in stock” for a previously sold listing. |
| **Referral (invite seller/buyer)** | Missing | No in-app referral link or “invite and get X” (optional for growth). |

---

## Prioritized “love it” roadmap (from this repo)

1. **Watchlist alerts** — “Items on your watchlist ending in 1h” (and optionally price drop); reuse existing notification channels.
2. **Reviews on listing page** — Seller rating + “See reviews” on listing detail and optionally on card.
3. **“You get $X”** — Show estimated net to seller at publish/preview and actual “You received $X” on sale/order confirmation.
4. **Seller tips** — Rule-based “Add a photo,” “Consider lowering price,” “Longer title” (or similar) in seller dashboard/insights.
5. **Similar listings (server)** — Small API that returns “more like this” by category + attributes so listing detail and browse can use it without passing full list.
6. **Empty states** — One clear CTA per empty list (watchlist, orders, listings, search).
7. **Response time** — “Usually responds in Xh” on seller profile from message data.
8. **Duplicate listing** — “Sell another like this” from seller’s listing.
9. **SMS** — Turn on and tune once Twilio A2P is approved.

---

## Summary

You already have: strong browse/filters, saved searches with alerts, watchlist with a dedicated page, make an offer, reviews and trust badges, seller dashboard with views and insights, saved addresses and delivery flow, multi-channel notifications, onboarding tour, related listings (client-side), sold comps, and clear payout copy.  

The list above focuses on **gaps** that would make the product feel “best in class”: watchlist alerts, reviews and “you get $X” visibility, seller tips, server-side similar listings, empty-state CTAs, response time, duplicate listing, and SMS once approved.
