# UX & Performance Audit: eBay-Level Polish

**Scope:** Routing, data fetching, caching, Firestore subscriptions, re-renders, transitions, loading, modals, optimistic UI, lists, bundle/code-split, back/forward, mobile vs desktop, error UX.  
**Goal:** Make the app feel instant, smooth, predictable, confident, and fast even on slow networks so it can compete with top-tier consumer marketplaces.

---

## 1️⃣ Executive Summary

### Top 5 Reasons the App Does Not Yet Feel Best-in-Class

1. **Route changes are blocked on client data, with no route-level code splitting.**  
   Every page is part of the main bundle (no `dynamic()`/`lazy()`). Navigation shows `loading.tsx` (PageLoader), then the page component mounts and often shows **another** loading state (auth/admin/data) before content. There is no shared view transition or skeleton-in-place; the user sees a full-screen spinner, then sometimes a second spinner or a blank layout before content. **Perceived:** “Two loading deals,” then a hard cut to content.

2. **No list virtualization; browse and watchlist render the full list.**  
   Browse and category pages map over `listings`/`sortedListings` with no windowing. Large result sets (e.g. 50+ items) create many DOM nodes and React elements (each card uses `motion.div` + Image + links). On low-end devices or after “Load more,” this causes jank and slower TTI. **Perceived:** Scroll and tap feel sluggish when the list is long.

3. **Heavy Firestore subscription use in layouts; every doc change can re-render.**  
   Dashboard and seller layouts subscribe to multiple unread-count and notification streams (`subscribeToUnreadCount`, `subscribeToUnreadCountByTypes`, etc.). Some admin views also use `onSnapshot` on collections (e.g. pending listings). Subscriptions are correct for real-time badges but cause layout re-renders on any of those doc changes. **Perceived:** Occasional UI “shivers” or delayed paint when many listeners fire.

4. **Skeletons are used only on browse; most pages use full-page spinner.**  
   Main browse uses `SkeletonListingGrid` + `useMinLoading(300)` for initial load (good). Category browse pages use skeletons too. Everywhere else (dashboard, seller, listing detail, orders, messages, etc.) uses PageLoader (spinner). Spinner implies “wait for everything”; skeleton implies “structure is here, data is filling in.” **Perceived:** App feels more “blocking” than “progressive” outside browse.

5. **No shared, numeric motion standard (duration/easing).**  
   Framer-motion uses `duration: 0.4` on cards; Radix dialogs use `duration-200` and tailwindcss-animate. There is no single design token (e.g. `--motion-duration-fast: 150ms`) or shared easing. Button feedback is CSS `transition-colors` only—no scale or opacity on press. **Perceived:** Motion feels slightly inconsistent and not as “premium” as eBay’s crisp, consistent timing.

### What Is Already Done Well

- **Loading UI consistency:** Single PageLoader + Spinner; all route `loading.tsx` and full-page loaders use the same component. No mix of Loader2 vs custom divs.
- **Minimum loading time:** `useMinLoading(300)` on browse avoids skeleton flash; same idea could be reused elsewhere.
- **ChunkLoadError handling:** ChunkLoadRecovery triggers one reload per 30s on stale chunk 404s after deploy.
- **Image pipeline:** next/image with `sizes`, `loading="lazy"`, `quality={85}`; next.config has avif/webp and remote patterns. FeaturedListingCard uses `priority` for first two.
- **Optimistic UI in key flows:** FavoriteButton and MessageThread use optimistic updates; refs used to avoid re-rendering every card when favorites change.
- **Prefetch:** Dashboard/seller nav Links use `prefetch={true}` for visible nav items.
- **Memoization:** ListingCard, ListItem, FavoritesInitializer and others use React.memo; FavoriteButton avoids subscribing to global favorites state.
- **Error boundary:** error.tsx with Try again, Browse, Home and Sentry reporting.

---

## 2️⃣ Critical Fixes (High ROI)

Each item: **why it matters**, **what to change**, **where**, **example or pattern**.

---

### 1. Use route-level code splitting for heavy pages

**Why:** Reduces initial JS; navigation can show loading.tsx while the new page chunk loads. Avoids “everything in one bundle” and speeds up first route change.

**What:** Wrap heavy route components in `next/dynamic` with a loading fallback that matches PageLoader (or a small inline spinner).

**Where:**  
- `app/dashboard/listings/new/page.tsx` (large form)  
- `app/dashboard/admin/*` pages (e.g. ops, compliance, revenue)  
- `app/listing/[id]/page.tsx` (listing detail)

**Example:**

```tsx
// app/listing/[id]/page.tsx – keep as default export for metadata, or create wrapper:
// app/listing/[id]/ListingPageClient.tsx
import dynamic from 'next/dynamic';
import { PageLoader } from '@/components/ui/page-loader';

const ListingDetailContent = dynamic(
  () => import('./ListingDetailContent').then((m) => m.ListingDetailContent),
  {
    loading: () => <PageLoader title="Loading listing…" subtitle="Getting details ready." minHeight="screen" />,
    ssr: true, // keep if you need SEO
  }
);
```

Use the same pattern for create-listing and selected admin pages so their chunks load on demand.

---

### 2. Add a single “content skeleton” for dashboard and seller shells

**Why:** When navigating within dashboard/seller, the shell (nav, sidebar) is already there. Showing a full-page PageLoader hides that and feels like a full reload. A skeleton in the content area keeps layout stable and signals “this page is loading.”

**What:** Create a `DashboardContentSkeleton` (and optionally `SellerContentSkeleton`) that matches the approximate layout (title bar + 1–2 card placeholders or table rows). Use it in route `loading.tsx` under `app/dashboard/` and `app/seller/` (or in a shared layout loading slot).

**Where:**  
- New: `components/skeletons/DashboardContentSkeleton.tsx`  
- `app/dashboard/loading.tsx` (if you add one at dashboard level) or per-route loading that renders skeleton instead of full-page spinner where appropriate.

**Example:**

```tsx
// components/skeletons/DashboardContentSkeleton.tsx
export function DashboardContentSkeleton() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6 animate-in fade-in-0 duration-150">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-24" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
```

Use this (or a variant) in `app/dashboard/loading.tsx` so dashboard route transitions show skeleton-in-shell instead of full-screen spinner.

---

### 3. Virtualize browse and watchlist lists

**Why:** Large lists (50+ items) cause many DOM nodes and React updates. Virtualization keeps only visible (and a small buffer) items in the DOM, improving scroll performance and TTI.

**What:** Introduce a virtualized list for browse grid/list and watchlist. Use `@tanstack/react-virtual` or `react-virtuoso` (grid support). Render `ListingCard`/`ListItem` only for visible indices.

**Where:**  
- `app/browse/page.tsx` (replace the grid that maps `sortedListings`)  
- `app/dashboard/watchlist/page.tsx` (list/grid of watched items)

**Example (conceptual):**

```tsx
// Browse: wrap grid in a virtualizer
import { useVirtualizer } from '@tanstack/react-virtual';

const parentRef = useRef<HTMLDivElement>(null);
const rowVirtualizer = useVirtualizer({
  count: Math.ceil(sortedListings.length / columns),
  getScrollElement: () => parentRef.current,
  estimateSize: () => 320,
  overscan: 4,
});

// In render: only render rowVirtualizer.getVirtualItems() rows;
// each row maps to 4 (or 3) ListingCards.
```

Implement similarly for watchlist; keep “Load more” or cursor-based fetch, and virtualize the current window of items.

---

### 4. Standardize motion tokens and use them everywhere

**Why:** Consistent duration and easing make transitions feel intentional and premium. Right now values are scattered (0.4 in framer-motion, 200 in Radix, etc.).

**What:** Define CSS variables (or a small constants module) for duration and easing. Use them in Tailwind, framer-motion, and Radix overrides.

**Where:**  
- `app/globals.css` (add variables)  
- `tailwind.config.ts` (extend theme with motion tokens)  
- Components that use `motion` or `transition`

**Example:**

```css
/* globals.css */
:root {
  --motion-duration-fast: 150ms;
  --motion-duration-normal: 250ms;
  --motion-duration-slow: 350ms;
  --motion-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --motion-ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
```

```ts
// lib/motion.ts
export const MOTION = {
  durationFast: 0.15,
  durationNormal: 0.25,
  durationSlow: 0.35,
  easeOut: [0.16, 1, 0.3, 1] as const,
};
```

Use `MOTION.durationNormal` in framer-motion `transition`, and `var(--motion-duration-normal)` in Tailwind/Radix where possible.

---

### 5. Add active/press feedback to buttons

**Why:** Buttons today only have hover (and focus). On mobile there is no visible “press” state, so taps can feel unresponsive.

**What:** Add a short scale or opacity change on `:active` (and optionally a tiny delay so it’s visible). Prefer CSS so it works without JS.

**Where:**  
- `components/ui/button.tsx`

**Example:**

```tsx
// In buttonVariants, add to the base class:
'active:scale-[0.98] active:opacity-90 transition-transform duration-75'
```

Use a short duration (75–100ms) so it feels instant but visible.

---

### 6. Reduce layout subscription re-renders

**Why:** Dashboard/seller layouts subscribe to several unread/notification streams. Every Firestore update in those collections triggers callback → setState → layout re-render. That can cause brief “shivers” or extra work during navigation.

**What:** (a) Batch state: use a single state object (e.g. `unread: { messages, notifications, offers, ... }`) and one `setUnread` so one Firestore update doesn’t cause multiple setState calls. (b) Or move badge counts into a small context + memoized consumer so only the badge area re-renders, not the whole layout.

**Where:**  
- `app/dashboard/layout.tsx` (all `subscribeToUnread*` and `onSnapshot` for pending count)  
- `app/seller/layout.tsx` (same idea)

**Example:**

```tsx
// Single state object
const [badges, setBadges] = useState({
  messages: 0,
  notifications: 0,
  offers: 0,
  admin: 0,
  support: 0,
});
// In each subscriber callback:
setBadges((prev) => ({ ...prev, messages: count ?? 0 }));
```

Combine with one `useEffect` that sets up all subscriptions and returns one cleanup.

---

### 7. Skeleton for listing detail and order detail

**Why:** Listing and order pages currently show PageLoader until the doc is in. A skeleton that matches the final layout (hero image strip, title, price, seller block, etc.) makes the wait feel shorter and the app more “premium.”

**What:** Add `ListingDetailSkeleton` and `OrderDetailSkeleton` components. Use them in `app/listing/[id]/loading.tsx` and `app/dashboard/orders/[orderId]/loading.tsx` (and seller order detail) instead of or in addition to PageLoader.

**Where:**  
- New: `components/skeletons/ListingDetailSkeleton.tsx`, `components/skeletons/OrderDetailSkeleton.tsx`  
- `app/listing/[id]/loading.tsx`, `app/dashboard/orders/[orderId]/loading.tsx`, `app/seller/orders/[orderId]/loading.tsx`

**Example:**  
Skeleton mirrors the main content: image area (Skeleton), title line, price line, seller row, CTA area. Use existing `Skeleton` component and same spacing as real page.

---

### 8. Prefetch and preload critical next-hop routes

**Why:** Next.js prefetches Link targets in viewport by default; you already use `prefetch={true}` in nav. Making the “next likely” route (e.g. first listing card or “Browse” from home) load its chunk earlier improves perceived speed.

**What:** Keep `prefetch={true}` on primary nav and key CTAs. Optionally use `router.prefetch('/browse')` in a short timeout after home mount so the first click to browse is faster.

**Where:**  
- `app/page.tsx` (signed-in home): `useEffect` that calls `router.prefetch('/browse')` after 1–2s.  
- Ensure all primary nav `Link`s use default or explicit `prefetch`.

---

### 9. Stale-while-revalidate for browse

**Why:** Browse currently fetches on mount (and on filter change). If the user returns to browse (back/forward or menu), they see loading again. Caching the last result and showing it immediately while revalidating makes back/forward feel instant.

**What:** Cache the last browse result (e.g. in a ref or a small context/store) keyed by route + filters. On mount, if cache exists for current key, render it immediately and trigger a background refetch; otherwise show skeleton and fetch.

**Where:**  
- `app/browse/page.tsx`  
- Optional: a small `useBrowseCache()` hook that returns `{ data, isLoading, revalidate }` and stores last result in memory (or sessionStorage for refresh).

**Example (conceptual):**

```tsx
const cacheKey = `${pathname}-${JSON.stringify(filters)}`;
const cached = browseCacheRef.current?.get(cacheKey);
const [listings, setListings] = useState(cached?.listings ?? []);
const [loading, setLoading] = useState(!cached);

useEffect(() => {
  if (cached) {
    // Background revalidate
    queryListingsForBrowse(...).then((next) => {
      setListings(next.listings);
      browseCacheRef.current?.set(cacheKey, { listings: next.listings });
    });
  } else {
    // Normal load
    setLoading(true);
    queryListingsForBrowse(...).then((res) => {
      setListings(res.listings);
      setLoading(false);
      browseCacheRef.current?.set(cacheKey, { listings: res.listings });
    });
  }
}, [cacheKey, ...]);
```

---

### 10. Optimistic UI for bids and key actions

**Why:** Message and favorites already feel instant. Bids and “Confirm receipt” (and similar) often show a spinner until the server responds. Optimistic UI (show success state immediately, roll back on error) makes the app feel faster and more confident.

**What:** For place-bid and confirm-receipt (and similar): (a) Update local state / UI immediately (e.g. “You’re the high bidder,” “Order confirmed”). (b) Send the request. (c) On failure, revert and toast error.

**Where:**  
- Bids: `app/listing/[id]/page.tsx` or the component that calls place-bid API; bid history / current bid display.  
- Orders: `app/dashboard/orders/[orderId]/page.tsx` (confirm receipt, dispute, etc.).

**Example (conceptual):**

```tsx
const handleBid = async (amount: number) => {
  const prevBid = listing.currentBid;
  const prevBidderId = listing.currentBidderId;
  setListing((l) => ({ ...l, currentBid: amount, currentBidderId: user.uid }));
  try {
    await placeBidServer(listing.id, amount);
  } catch (e) {
    setListing((l) => ({ ...l, currentBid: prevBid, currentBidderId: prevBidderId }));
    toast({ title: 'Bid failed', variant: 'destructive' });
  }
};
```

---

### 11. Remove FeaturedListingCard `unoptimized`

**Why:** You use next/image with optimization in ListingCard; FeaturedListingCard uses `unoptimized`, which skips optimization and can hurt LCP and bandwidth on slow networks.

**What:** Remove `unoptimized` from FeaturedListingCard’s Image. Keep `priority={index < 2}` for above-the-fold items. If you hit domain/remote pattern issues, fix next.config instead.

**Where:**  
- `components/listings/FeaturedListingCard.tsx`

---

### 12. Shorter card entrance animation

**Why:** ListingCard uses `initial={{ opacity: 0, y: 20 }}` and `transition={{ duration: 0.4 }}`. In a long list, 400ms per card can feel slow. eBay-style grids often use a shorter, subtler stagger or no stagger.

**What:** Shorten to ~0.2s and/or reduce y (e.g. 8). Optionally stagger only the first 6–12 items.

**Where:**  
- `components/listings/ListingCard.tsx`  
- `components/listings/FeaturedListingCard.tsx`  
- `components/listings/ListItem.tsx` (if it uses motion)

**Example:**

```tsx
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.2 }}
```

---

### 13. Error state with retry and rollback

**Why:** When a mutation fails (bid, confirm receipt, save profile), the user should see a clear error and be able to retry without losing context. Some flows only toast; the form or state may stay in a “loading” or stale state.

**What:** For critical mutations: (1) On failure, revert optimistic state. (2) Show a toast or inline error with “Try again” that re-runs the same action. (3) Ensure buttons are not left disabled forever.

**Where:**  
- Any component that does optimistic update (bids, order actions, profile save).  
- Reuse the pattern from FavoriteButton (revert + toast) and MessageThread.

---

### 14. Dialog open/close duration and easing

**Why:** Radix Dialog uses Tailwind’s default animate; ensuring it uses your motion tokens and a consistent 200–250ms with ease-out makes modals feel snappy and consistent.

**What:** In dialog.tsx, set explicit transition duration and use your ease-out curve (e.g. `duration-200` and a custom easing class if needed). Ensure overlay and content use the same timing.

**Where:**  
- `components/ui/dialog.tsx`

**Example:**

```tsx
// Already has duration-200; add explicit easing if you introduce motion tokens:
'data-[state=open]:animate-in data-[state=closed]:animate-out ... duration-200 ease-out'
```

(And in globals/tailwind, define `ease-out` to match `--motion-ease-out`.)

---

### 15. One loading.tsx per layout segment that shows skeleton

**Why:** You already have many route-level loading.tsx files. For dashboard and seller, a single loading.tsx at the layout level (dashboard/loading.tsx, seller/loading.tsx) can show the new skeleton-in-shell so every nested route transition is consistent without duplicating skeleton UI.

**What:** Add `app/dashboard/loading.tsx` and `app/seller/loading.tsx` that render `DashboardContentSkeleton` and `SellerContentSkeleton` respectively. Keep existing nested loading.tsx where you still want a full PageLoader (e.g. first load of a heavy admin page), or replace those with the same skeleton for consistency.

**Where:**  
- New: `app/dashboard/loading.tsx`, `app/seller/loading.tsx`  
- Optionally adjust nested loading files to use skeleton instead of PageLoader where it fits.

---

## 3️⃣ Ideal Reference Architecture

How navigation, data, cache, animation, and state could look to mirror eBay-level polish.

### Navigation

- **App Router** with layout shells (dashboard, seller) that stay mounted; only the content segment changes.
- **Route-level code splitting** for heavy pages (listing detail, create listing, admin tools) so the shell and shared chunks load first, then the page chunk.
- **loading.tsx at every segment** that can load: show skeleton that matches the segment (content area skeleton inside shell), not a full-screen spinner, so layout is stable.
- **Prefetch** for visible nav and likely next hop (e.g. Browse from home) so the next route is already loading.

### Data fetching

- **Server components** where possible for SEO and first paint (e.g. listing metadata, static content).  
- **Client:** One of:
  - **React Query or SWR** for list/detail with cache key per route+params, stale-while-revalidate, and deduplication; or  
  - **Current Firestore pattern** but with a thin “cache layer”: in-memory (or sessionStorage) cache for browse/listing/order by id, show cache first then revalidate with getDoc/onSnapshot.
- **Subscriptions** only where real-time is required (messages, unread counts, live bid/order). Prefer **getDoc** for one-off reads (e.g. listing detail on open) and **onSnapshot** only when the user stays on a screen that must live-update.

### Caching

- **In-memory (or sessionStorage) cache** for:
  - Browse results keyed by path + filters;
  - Listing by id, order by id (with short TTL e.g. 60s if you refetch on focus).
- **No long-lived HTML cache** for document (you already use `max-age=0, must-revalidate`); keep immutable for `_next/static`.

### Animations

- **Single motion system:**  
  - Fast: 150ms (micro feedback, button press).  
  - Normal: 250ms (card hover, modal open).  
  - Slow: 350ms (page-level transitions if you add them).  
  - Easing: ease-out for “enter,” ease-in-out for “move.”
- **GPU-friendly:** Prefer `transform` and `opacity`; avoid animating `width`/`height`/`top`/`left` where possible.
- **Reduced motion:** Respect `prefers-reduced-motion` (shorten or disable animations).

### State management

- **Server state:** Prefer a cache layer (React Query/SWR or your own ref-based cache) so that “same key” doesn’t refetch on every mount.
- **UI state:** Local state or small context (e.g. sidebar open, modal open). Avoid putting server data in global context; use cache + hooks per route.
- **Optimistic updates:** For bids, favorites, messages, order actions—update UI immediately, revert on error, show toast.

---

## 4️⃣ UX Polish Layer

Concrete numbers and patterns.

### Animation timing

| Context            | Duration | Easing        | Notes                          |
|--------------------|----------|---------------|---------------------------------|
| Button press       | 75–100ms | linear        | scale 1 → 0.98 or opacity 1 → 0.9 |
| Card hover         | 200ms    | ease-out      | translateY, shadow              |
| Modal open/close   | 200–250ms| ease-out      | overlay + content               |
| List item enter    | 150–200ms| ease-out      | opacity + small y               |
| Page/section enter | 250ms    | ease-out      | opacity                         |

### Motion rules

- **Enter:** `opacity 0→1`; optional `y: 8→0` or `scale 0.98→1`; duration 150–250ms; ease-out.
- **Exit:** Same duration; ease-in or ease-in-out; avoid layout jump (use position absolute or transform).
- **Stagger:** Only first N items (e.g. 6–12); delay `index * 30ms` max 150ms.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` → duration 0 or 50ms.

### Skeleton patterns

- **List/grid:** Same column count and approximate card height as final content; use SkeletonCard or SkeletonListingGrid; min 300ms (useMinLoading).
- **Detail (listing/order):** One block for image, one for title, one for price, one for seller/CTA; match spacing of real page.
- **Dashboard/seller content:** Title bar + 2–3 card-shaped placeholders; no full-screen spinner.

### Interaction feedback

- **Buttons:** `:active` scale 0.98 or opacity 0.9, 75ms.
- **Links:** Underline or color change on hover; no delay.
- **Form submit:** Button shows spinner and disabled; on success, toast + close or redirect; on error, toast + re-enable and optionally revert.

### Error handling

- **Mutation failure:** Revert optimistic state; toast with “Something went wrong. Try again.” and optional “Try again” button that retries once.
- **Load failure:** Inline error in the content area with “Retry” that refetches; do not leave full-page spinner forever.
- **Global error boundary:** Already have error.tsx with Try again, Browse, Home; keep and ensure reset() is called so user can retry the same route.

---

## 5️⃣ Step-by-Step Upgrade Plan

### Phase 1: Immediate wins (1–2 days)

1. **Motion tokens** – Add `--motion-duration-*` and `--motion-ease-*` in globals.css; use in one dialog and one card; then roll out.
2. **Button active state** – Add `active:scale-[0.98]` (and duration) to Button.
3. **Card animation** – Shorten ListingCard/FeaturedListingCard entrance to 0.2s and y: 8.
4. **FeaturedListingCard images** – Remove `unoptimized`.
5. **Dashboard/seller loading.tsx** – Add `app/dashboard/loading.tsx` and `app/seller/loading.tsx` with DashboardContentSkeleton and SellerContentSkeleton.
6. **Dialog duration** – Ensure 200ms and same easing as motion tokens.

### Phase 2: Structural improvements (roughly 1–2 weeks)

7. **Code splitting** – Dynamic import for listing detail, create listing, and 2–3 heaviest admin pages; loading fallback = PageLoader or skeleton.
8. **Browse cache** – In-memory (or sessionStorage) cache for last browse result; show cache immediately on return, revalidate in background.
9. **Layout subscription batching** – Single `badges` state and one setState per subscription callback in dashboard/seller layout.
10. **Listing and order skeletons** – Add ListingDetailSkeleton and OrderDetailSkeleton; use in listing and order loading.tsx.
11. **Prefetch** – `router.prefetch('/browse')` after home mount (setTimeout 1–2s).

### Phase 3: Premium polish (ongoing)

12. **Virtualize browse** – Integrate @tanstack/react-virtual (or react-virtuoso) for browse grid and watchlist.
13. **Optimistic bids and order actions** – Implement optimistic update + revert for place-bid and confirm-receipt (and similar).
14. **Error retry** – Standardize “Try again” and revert on mutation failure everywhere.
15. **Reduced motion** – Add `prefers-reduced-motion` media query and shorten/disable animations when set.

---

## Definition of Done

**“If a user used this app and then opened eBay, would they feel a downgrade?”**

**Today: Yes.** Reasons:

1. **Two loading experiences** when switching pages (spinner → sometimes another spinner or blank) vs eBay’s skeleton-in-place and fast client-side transitions.
2. **Long lists** feel heavier (no virtualization; many cards with motion).
3. **Mutations** (bid, confirm) often block with a spinner instead of instant feedback like eBay.
4. **Back/forward** to browse or listing often re-fetches and shows loading instead of instant cached result.
5. **Motion** is slightly inconsistent (different durations/easing) and buttons lack a clear press state.

**After the fixes above: No (or much closer).** What would make it feel equal or better:

- **One loading language:** Skeleton in shell for dashboard/seller; skeleton for list/detail where possible; PageLoader only for true full-page loads. No “second” spinner after route load.
- **Instant feedback:** Optimistic UI for bids, order actions, and favorites; button press state; consistent 150–250ms motion.
- **Fast navigation:** Code-split heavy routes; prefetch likely next hop; cache last browse and key details so back/forward shows cache immediately and revalidates in background.
- **Smooth lists:** Virtualized browse and watchlist so scroll stays smooth with 50+ items.
- **Clear errors:** Revert on failure, toast + “Try again,” no stuck loading states.

Implementing Phases 1 and 2 and the high-ROI items from Phase 3 would bring the app to a level where a user might not feel a clear downgrade versus eBay; Phase 3 and ongoing polish would make it feel confident and premium in line with top-tier marketplaces.

---

## Phase 1 + 1B Implementation Complete (Checklist)

**Implemented:** Safe UI polish and skeleton-in-shell loading. No behavior changes to APIs, Firestore, or auth.

### Phase 1 — Safe UI Polish

| Step | Status | Files |
|------|--------|-------|
| 1. Motion tokens | Done | `app/globals.css` (CSS vars), `lib/motion.ts` (MOTION export) |
| 2. Button press feedback | Done | `components/ui/button.tsx` (active:scale-[0.98] active:opacity-90 transition-transform duration-75) |
| 3. Dialog open/close timing | Done | `components/ui/dialog.tsx` (duration-200 ease-out on overlay + content) |
| 4. Listing card entrance | Done | `ListingCard.tsx`, `FeaturedListingCard.tsx` (MOTION.durationNormal, y:8, stagger capped at 12) |
| 5. Remove unoptimized from FeaturedListingCard | Done | `FeaturedListingCard.tsx` (unoptimized removed; next.config already has Firebase domains) |

### Phase 1B — Skeleton-in-Shell

| Step | Status | Files |
|------|--------|-------|
| 6. Dashboard/Seller content skeletons | Done | `components/skeletons/DashboardContentSkeleton.tsx`, `SellerContentSkeleton.tsx` |
| 7. Layout-level loading.tsx | Done | `app/dashboard/loading.tsx`, `app/seller/loading.tsx` (skeleton-in-shell) |
| 8. Listing + Order detail skeletons | Done | `ListingDetailSkeleton.tsx`, `OrderDetailSkeleton.tsx`; `app/listing/[id]/loading.tsx`, `app/dashboard/orders/[orderId]/loading.tsx`, `app/seller/orders/[orderId]/loading.tsx` |

### Phase 2 Scaffolding (flags only, not enabled)

| Step | Status | Files |
|------|--------|-------|
| 9. Feature flag helper | Done | `lib/featureFlags.ts` (FLAGS.virtualizeLists, browseCache, optimisticBids; all false by default) |

### Enabling feature flags later

Set in `.env.local`:

- `NEXT_PUBLIC_VIRTUALIZE_LISTS=true` — virtualize browse/watchlist (Phase 2/3)
- `NEXT_PUBLIC_BROWSE_CACHE=true` — cache-first browse
- `NEXT_PUBLIC_OPTIMISTIC_BIDS=true` — optimistic bid/order actions

### Risks / TODOs

- **FeaturedListingCard:** `unoptimized` removed; images use next/image with existing `domains`/`remotePatterns`. If any image host is missing, add it to `next.config.js` and revert `unoptimized` only if needed.
- **Reduced motion:** Not implemented in Phase 1; add `prefers-reduced-motion` media query in a later phase if desired.
- **Nested loading.tsx:** Existing nested route `loading.tsx` files (e.g. `dashboard/orders/loading.tsx`, `dashboard/orders/[orderId]/loading.tsx`) are unchanged; layout-level `dashboard/loading.tsx` and `seller/loading.tsx` show skeleton when entering dashboard/seller segment; nested routes still use their own loading UI where defined.

---

## Phase 2C — Route-Level Code Splitting (Complete)

**Goal:** Keep initial JS smaller; load heavy page code only when the user navigates there.

### Pages split (4)

| Route | Why heavy | Client component | Loading fallback | ssr |
|-------|-----------|------------------|------------------|-----|
| `app/dashboard/listings/new` | ~3.6k-line create-listing form (StepperForm, CategoryAttributeForm, ImageGallery, PayoutReadinessCard, many UI imports) | `NewListingClient.tsx` | PageLoader (title/subtitle/minHeight screen) | false (form is interactive only) |
| `app/listing/[id]` | ~2.5k-line listing detail (framer-motion, accordion, BidHistory, AutoBidPanel, OfferPanel, payment dialogs, many components) | `ListingDetailClient.tsx` | ListingDetailSkeleton | true (SEO for listing pages) |
| `app/dashboard/admin/ops` | ~2k-line admin ops (tables, dialogs, fulfillment lanes) | `OpsClient.tsx` | DashboardContentSkeleton | false (admin tools) |
| `app/dashboard/admin/compliance` | ~2k-line compliance hub (tabs, tables, Firestore, framer-motion) | `ComplianceClient.tsx` | DashboardContentSkeleton | false (admin tools) |

### Files added/changed

- **Added:** `app/dashboard/listings/new/NewListingClient.tsx` (full form content moved from page).
- **Changed:** `app/dashboard/listings/new/page.tsx` → thin wrapper with `dynamic(import('./NewListingClient'), { loading: PageLoader, ssr: false })`.
- **Added:** `app/listing/[id]/ListingDetailClient.tsx` (full detail content moved from page).
- **Changed:** `app/listing/[id]/page.tsx` → thin wrapper with `dynamic(import('./ListingDetailClient'), { loading: ListingDetailSkeleton, ssr: true })`.
- **Added:** `app/dashboard/admin/ops/OpsClient.tsx`, **Changed:** `app/dashboard/admin/ops/page.tsx` → wrapper, DashboardContentSkeleton, ssr: false.
- **Added:** `app/dashboard/admin/compliance/ComplianceClient.tsx`, **Changed:** `app/dashboard/admin/compliance/page.tsx` → wrapper, DashboardContentSkeleton, ssr: false.

### Layouts

- `app/dashboard/layout.tsx` and `app/seller/layout.tsx` do **not** import any of the heavy admin or form modules; no change needed.

### Build

- `npm run build` passes. Route chunks for the split pages are now ~2 kB (wrapper) with heavy content in separate lazy chunks (e.g. listing detail, create listing, ops, compliance load on first visit to those routes).

### Manual test checklist

1. **Create listing:** Dashboard → Listings → New → brief PageLoader → form works as before.
2. **Listing detail:** Browse → click listing → brief ListingDetailSkeleton (or existing loading.tsx) → detail works; direct URL load still works (SSR).
3. **Admin Ops:** Dashboard → Admin → Ops → brief DashboardContentSkeleton → ops console works.
4. **Admin Compliance:** Dashboard → Admin → Compliance → brief DashboardContentSkeleton → compliance hub works.
5. **ChunkLoadRecovery:** Unchanged; no new chunk-error loops.
6. **Metadata:** Listing and create-listing pages do not use `generateMetadata`; no metadata behavior to verify.
