# Mobile / “App-like” Experience Audit (Web) — Wildlife Exchange

> **Constraints honored**: This document is an **audit + explanation only**. No code changes were made as part of this audit (other than writing this documentation file).  
> **Evidence standard**: Every claim below cites **exact file paths** and (where relevant) specific **components/functions and CSS classes**. Anything that cannot be proven from the repo is explicitly labeled **“Unknown from repo”** with verification steps.

---

## 1) Executive Summary (10 bullets)

1. **Stack**: This is a **Next.js 14** app using the **App Router** (the repo uses `/app` routes and `app/api/*/route.ts` handlers). Evidence: `package.json`, `app/layout.tsx`.
2. **Mobile navigation is partially “app-like”**: several key mobile pages render a **fixed bottom tab bar** (`BottomNav`) and apply safe-area padding utilities so content doesn’t sit under it. Evidence: `components/navigation/BottomNav.tsx`, `app/globals.css`, `app/browse/page.tsx`, `app/listing/[id]/page.tsx`.
3. **Dashboard/Seller areas are not tabbed**: `/dashboard/*` and `/seller/*` routes use a **sidebar + mobile sheet menu** pattern (not bottom tabs). Evidence: `app/dashboard/layout.tsx`, `app/seller/layout.tsx`.
4. **Route transitions are mixed**: the public site uses Next client navigation (`next/link`, `router.push`), but dashboard/seller nav intentionally uses **hard navigation** (`window.location.href`) due to prior RSC payload fetch issues, which reduces “app feel” and state/scroll preservation. Evidence: `app/dashboard/layout.tsx` (`hardNavigate`), `app/seller/layout.tsx` (same).
5. **PWA installability is not present (as a standard PWA)**: there is **no web manifest** and no install UX code. Evidence: absence of `public/manifest*` and no `rel="manifest"` usage; `app/layout.tsx` metadata has icons commented out.
6. **Service worker exists but is push-focused**: there is an FCM service worker served at `/firebase-messaging-sw.js`, but it’s registered only when the user enables push notifications (not as a global offline caching SW). Evidence: `lib/firebase/push.ts`, `app/firebase-messaging-sw.js/route.ts`, `public/firebase-messaging-sw.js`.
7. **Notifications are multi-channel in architecture**: in-app notifications are written server-side; email/push/sms are handled via **jobs** and **scheduled Netlify functions**. Evidence: `firestore.rules`, `lib/notifications/processEvent.ts`, `netlify/functions/processNotificationEvents.ts`, `netlify/functions/dispatchEmailJobs.ts`, `netlify/functions/dispatchPushJobs.ts`, `netlify/functions/dispatchSmsJobs.ts`.
8. **Web push is implemented via Firebase (FCM)**: tokens are stored in Firestore per user. Evidence: `app/api/push/register/route.ts` writes to `users/{uid}/pushTokens/{tokenId}`, rules allow user access, and jobs are dispatched via Firebase Admin. Evidence: `app/api/push/register/route.ts`, `firestore.rules`, `netlify/functions/dispatchPushJobs.ts`.
9. **Mobile scroll/viewport protections exist but are uneven**: the repo adds safe-area padding helpers (`pb-safe`, `pb-bottom-nav-safe`) and some pages use `100dvh`/`min-h-screen` patterns; there are nested scroll containers (messages, sheets) that can still create “scroll traps” if not carefully sized. Evidence: `app/globals.css`, `app/dashboard/messages/page.tsx`, `components/messaging/MessageThread.tsx`, `components/navigation/FilterBottomSheet.tsx`.
10. **Mobile performance risks are identifiable from code**: listing grids are not virtualized, and some lists are animated with `framer-motion`; images are not optimized by Next’s image pipeline. Evidence: `next.config.js` (`images.unoptimized: true`), `app/browse/page.tsx` (grid map + `AnimatePresence`), `components/listings/ListingCard.tsx` (`unoptimized` image + `motion`).

---

## 2) What we have today (mobile web behavior) — detailed walkthrough

### Public site (e.g., `/`, `/browse`, `/listing/[id]`)

- **Top-level layout**:
  - `app/layout.tsx` renders:
    - `<ConditionalNavbar />` (public navbar only; hidden for dashboard/seller)
    - `<ConditionalFooter />` (public footer only; hidden for dashboard/seller)
    - global toasters (`Toaster`, `SonnerToaster`)
    - `HelpLauncher`
  - Evidence: `app/layout.tsx` (`ConditionalNavbar`, `ConditionalFooter`, `HelpLauncher`).

- **Public navbar behavior**:
  - Public navbar is **sticky** (`sticky top-0`) with backdrop blur and uses `framer-motion` for entrance animation.
  - Evidence: `components/navigation/Navbar.tsx` (`motion.nav`, `className="sticky top-0 ... backdrop-blur-xl"`).

- **Bottom navigation**:
  - Many public pages explicitly render `<BottomNav />` at the end of the page component tree.
  - Evidence:
    - `app/browse/page.tsx` includes `import { BottomNav }` and renders it at the bottom.
    - `app/listing/[id]/page.tsx` renders `<BottomNav />` (comment “Mobile Bottom Navigation”).
    - `components/navigation/BottomNav.tsx` defines it as `fixed bottom-0 ... md:hidden pb-safe`.

- **Safe-area padding to avoid bottom-tab overlap**:
  - Global utility `.pb-bottom-nav-safe` exists and is meant to be applied on pages that render the bottom nav.
  - Evidence: `app/globals.css` defines `.pb-safe` and `.pb-bottom-nav-safe` (uses `env(safe-area-inset-bottom)`).

### Dashboard and seller areas (e.g., `/dashboard/*`, `/seller/*`)

- **Navbar/footer are intentionally hidden**:
  - `components/navigation/ConditionalNavbar.tsx` returns `null` for `/dashboard*` or `/seller*`.
  - `components/navigation/ConditionalFooter.tsx` returns `null` for `/dashboard*` or `/seller*`.

- **Primary navigation pattern is sidebar (desktop) + sheet menu (mobile)**:
  - `app/dashboard/layout.tsx` and `app/seller/layout.tsx` implement:
    - desktop sidebar (`md:fixed md:inset-y-0`)
    - mobile sheet menu via `Sheet` (Radix).
  - Evidence: `app/dashboard/layout.tsx`, `app/seller/layout.tsx` import `Sheet`.

- **Important “app feel” caveat**: dashboard links often trigger hard navigation (full-page load).
  - `app/dashboard/layout.tsx` includes a comment and `hardNavigate()` that sets `window.location.href` because of “Failed to fetch RSC payload” issues.
  - Evidence: `app/dashboard/layout.tsx` (comment near `hardNavigate`, uses `window.location.href`).
  - Same pattern exists in `app/seller/layout.tsx`.

---

## 3) Navigation & Layout findings (with file paths)

### Stack + routing model

- **Next.js + App Router**:
  - `package.json` includes `"next": "^14.2.35"` and no React Router/Vite.
  - `app/layout.tsx` exists and is the Root Layout.
  - Route handlers live under `app/api/**/route.ts` (e.g., `app/api/push/register/route.ts`).

### Layout decision points

- **Root layout**:
  - `app/layout.tsx` uses `<html className="scroll-smooth">` and wraps the app in providers.
  - Evidence: `app/layout.tsx` (`<html ... className="scroll-smooth">`).

- **Public vs dashboard chrome**:
  - Navbar/footer are hidden for dashboard/seller routes via `ConditionalNavbar`/`ConditionalFooter`.
  - Evidence: `components/navigation/ConditionalNavbar.tsx`, `components/navigation/ConditionalFooter.tsx`.

- **Breakpoints and responsive strategy**:
  - Tailwind is configured with default breakpoints (no custom `screens` defined).
  - Evidence: `tailwind.config.ts` has `theme.extend` but does not define `screens`.

### Current mobile navigation patterns

- **Bottom tabs (public + some dashboard pages)**:
  - Implemented in `components/navigation/BottomNav.tsx`.
  - Uses: `fixed bottom-0 ... md:hidden` and `min-h-[44px] touch-manipulation` for tap targets.
  - Evidence: `components/navigation/BottomNav.tsx`.
  - It is page-level and must be included manually; examples:
    - `app/browse/page.tsx`
    - `app/listing/[id]/page.tsx`
    - `app/pricing/page.tsx`, `app/how-it-works/page.tsx`, etc. (search usage shows many explicit imports/renders).
    - Evidence: `app/browse/page.tsx`, `app/listing/[id]/page.tsx`, plus repo-wide references.

- **Hamburger / sheet menus**:
  - Public navbar uses a `Sheet` for mobile menus.
  - Evidence: `components/navigation/Navbar.tsx` uses `Sheet`, `SheetContent`.
  - Dashboard/seller layouts use a `Sheet` for mobile nav.
  - Evidence: `app/dashboard/layout.tsx`, `app/seller/layout.tsx`.

### Back behavior + state preservation

- **Unknown from repo (runtime behavior)**:
  - Whether scroll position is preserved on back/forward depends on:
    - Next’s router behavior for App Router in the specific Next version
    - the use of hard navigations vs client navigations
  - Evidence of hard navigations in dashboard/seller suggests **less state preservation** there.
  - Evidence: `app/dashboard/layout.tsx` / `app/seller/layout.tsx` (`hardNavigate` uses `window.location.href`).
  - **How to verify**:
    - On mobile, open `/browse`, scroll far down, tap a listing, then use browser back.
    - Repeat inside `/dashboard/*` by tapping sidebar links and observing full reload vs SPA navigation.

---

## 4) Modals/Sheets findings

### Centered dialogs (desktop-style) — Radix Dialog

- The project’s standard dialog is `@radix-ui/react-dialog` wrapped in `components/ui/dialog.tsx`.
- It explicitly addresses mobile overflow:
  - `w-[calc(100%-2rem)]` on small screens
  - `max-h-[90vh] overflow-y-auto overflow-x-hidden`
- Evidence: `components/ui/dialog.tsx`.

**Implication for app-like feel**:
- On mobile, centered dialogs can still feel “webby” vs native “sheet” behavior, but this repo does have sheet/drawer primitives too (see below).

### Sheets (side / bottom) — Radix Sheet

- Mobile filters for browse use `Sheet` in two styles:
  - Right-side sheet: `components/navigation/MobileBrowseFilterSheet.tsx` (`<SheetContent side="right" className="w-[92vw] ...">`)
  - Bottom sheet: `components/navigation/FilterBottomSheet.tsx` (`<SheetContent side="bottom" className="h-[85vh] overflow-y-auto">`)
- Evidence: `components/navigation/MobileBrowseFilterSheet.tsx`, `components/navigation/FilterBottomSheet.tsx`.

### Drawer (native-ish bottom drawer) — Vaul

- There is a `vaul` drawer wrapper in `components/ui/drawer.tsx` (Vaul is commonly used for mobile-native feeling bottom sheets).
- Evidence: `components/ui/drawer.tsx` imports `Drawer as DrawerPrimitive` from `vaul`.

**Unknown from repo**:
- Whether the product consistently uses `Drawer` (Vaul) for mobile-first modals vs `Dialog` or `Sheet` varies per feature; a full inventory would require enumerating each modal usage site-by-site. The primitives exist in the repo.

---

## 5) Scroll/Viewport findings

### Global viewport + base behavior

- `app/layout.tsx` exports:
  - `viewport.width = 'device-width'`
  - `initialScale = 1`
  - `maximumScale = 5`
- Evidence: `app/layout.tsx` (`export const viewport`).

### Safe-area handling (important on iOS)

- Utilities:
  - `.pb-safe { padding-bottom: env(safe-area-inset-bottom); }`
  - `.pb-bottom-nav-safe { padding-bottom: calc(5rem + env(safe-area-inset-bottom)); }`
- Evidence: `app/globals.css`.

### iOS “zoom on input focus” mitigation

- Global CSS forces `font-size: 16px` for `input, textarea, select` to prevent iOS Safari zoom.
- Evidence: `app/globals.css` (the “Form inputs - mobile optimized” block).

### Viewport height patterns (potential “mobile killers”)

#### `min-h-screen` usage

- Root layout wrapper uses `min-h-screen`.
- Many pages use `min-h-screen`, e.g.:
  - `app/layout.tsx`: `<div className="min-h-screen flex flex-col ...">`
  - Many pages are listed by grep; this is a common pattern across the app.

**Risk**:
- `100vh`/`min-h-screen` can behave inconsistently on iOS Safari due to the address bar changing viewport height.  
  **Unknown from repo**: whether this currently causes visible issues depends on device/browser; must be validated on real iOS devices.

#### `100dvh` usage (newer, generally better)

- The Messages page uses `100dvh` in its pane heights:
  - `h-[calc(100dvh-220px)] ...`
- Evidence: `app/dashboard/messages/page.tsx`.

### Nested scroll containers (scroll traps risk)

- **Messages thread UI**:
  - The messages UI is a nested scroll area pattern: the page uses a scroll area for the inbox list, and `MessageThreadComponent` itself manages its own internal scroll behavior.
  - Evidence:
    - `app/dashboard/messages/page.tsx` uses Radix `ScrollArea` for inbox.
    - `components/messaging/MessageThread.tsx` uses a scroll container (`scrollRef`, `messagesEndRef`) and programmatic scroll (`scrollIntoView`).

- **Bottom filter sheet**:
  - `components/navigation/FilterBottomSheet.tsx` uses a bottom sheet with `h-[85vh] overflow-y-auto` and a sticky footer inside.
  - Evidence: `components/navigation/FilterBottomSheet.tsx`.

**Risk**:
- Nested scroll areas + fixed headers/footers can produce “trapped scroll” feelings on mobile (especially iOS). The repo already has mitigations in some places (e.g., safe padding, careful heights), but it’s not globally uniform.

---

## 6) Performance findings (LCP/CLS/INP risk list)

> No runtime benchmarks were run; this is inferred from code structure and known browser behavior. Where a risk is identified, this section cites the exact file(s) causing the risk.

### P0 mobile performance risks (highest likelihood/impact)

#### Risk A — Images are not optimized by Next.js

- `next.config.js` sets `images.unoptimized: true`.
- Evidence: `next.config.js`.
- Many components also explicitly pass `unoptimized` to `<Image />`:
  - Example: `components/listings/ListingCard.tsx` passes `unoptimized` and uses `fill`.
- Evidence: `components/listings/ListingCard.tsx`.

**Why this matters for mobile**:
- Without Next’s image optimization, the client likely downloads the original asset sizes (or relies on the source hosting’s resizing). This increases LCP risk on cellular networks.
- **Unknown from repo**: whether Firebase Storage URLs are sized/optimized server-side (would need to inspect upload pipeline and actual stored image variants).

#### Risk B — Large lists are rendered without virtualization (and sometimes animated)

- `app/browse/page.tsx` renders listings by mapping the entire `sortedListings` array into card components and wraps the list in `AnimatePresence`.
  - Evidence: `app/browse/page.tsx` (grid/list mapping and `<AnimatePresence>`).
- Pagination uses “Load More” but still grows the in-memory list; no virtualization is visible here.
  - Evidence: `app/browse/page.tsx` (`setListings((prev) => [...prev, ...result.items])`).

**Why this matters**:
- As lists grow, rendering cost and layout recalculation costs rise, affecting INP (interaction latency) and scroll smoothness.

#### Risk C — Heavy client-side pages (more JS on mobile)

- Many major pages are client components (`'use client'`) including:
  - `app/browse/page.tsx`
  - `app/listing/[id]/page.tsx`
  - `app/page.tsx` (home)
- Evidence: the first line of each is `'use client'`.

**Why this matters**:
- Client components ship more JS; on low-end mobile devices that increases parse/execute cost.

### P1 medium risks (situational)

#### Risk D — Framer Motion used across key pages and card components

- Browse and Home pages import `framer-motion` and use `motion` + `AnimatePresence`.
- Listing cards also use `motion.div` transitions and hover/tap effects.
- Evidence:
  - `app/browse/page.tsx` imports `{ motion, AnimatePresence }`
  - `components/listings/ListingCard.tsx` uses `motion.div`

**Why this matters**:
- Animations can increase main-thread work on scroll and list updates, depending on how they’re used (especially if animating many nodes).

#### Risk E — Firestore client querying + subscriptions

- Many experiences use Firestore client-side queries and `onSnapshot` subscriptions:
  - Notifications bell: `components/navigation/NotificationsBell.tsx` uses `onSnapshot`.
  - Messages thread: `components/messaging/MessageThread.tsx` subscribes to messages.
- Evidence: those files include `onSnapshot` usage.

**Why this matters**:
- Real-time listeners can cause frequent re-renders if not carefully scoped, affecting battery/network and UI responsiveness.

### CLS (layout shift) risks

- **Hero images**: home page uses a `fill` image with a section that has a defined min-height and overlay.
  - Evidence: `app/page.tsx` uses `min-h-[50vh] md:min-h-[60vh]` for the hero section and `<Image fill ... priority>`.
- This is generally good for CLS, but other images depend on their container’s fixed aspect ratio:
  - Listing cards use `aspect-[4/3]`, which is CLS-friendly.
  - Evidence: `components/listings/ListingCard.tsx` uses `aspect-[4/3]`.

**Unknown from repo**:
- Whether fonts cause CLS depends on how the fonts load at runtime. `app/layout.tsx` uses `next/font` with `display: 'swap'` for the local font, which generally reduces FOIT but can still shift if fallback metrics differ.
  - Evidence: `app/layout.tsx` (`localFont` `display: 'swap'`).

---

## 7) PWA findings (present/missing + where)

### Installability (Manifest + icons)

- **Missing from repo**:
  - No `public/manifest.json` / `manifest.webmanifest` was found.
  - No `app/manifest.ts` was found.
  - No `rel="manifest"` usage was found.
- Evidence:
  - Repo file scan: `public/` contains `favicon.svg` and images, but no manifest (see `public/` directory listing).
  - `app/layout.tsx` metadata has icon config commented out (“Icons can be added…”).

**Result**: Standard PWA install prompts and install metadata are **not implemented** from what is visible in the repo.

### Service worker presence

- **Present**: A service worker script exists for **Firebase Cloud Messaging**.
  - Served dynamically: `app/firebase-messaging-sw.js/route.ts` returns JS for `/firebase-messaging-sw.js`.
  - Also present as a static file: `public/firebase-messaging-sw.js` (another implementation that fetches config from `/api/push/config` and/or imports `/firebase-messaging-sw-runtime.js`).
  - Runtime script exists: `app/firebase-messaging-sw-runtime.js/route.ts`.
  - Evidence: those files.

**Important limitation**:
- This service worker is used for **push notifications** and click handling; it is not an offline caching strategy.
- Evidence: `lib/firebase/push.ts` registers the SW only when enabling push (`navigator.serviceWorker.register('/firebase-messaging-sw.js')`).

### Offline / caching strategy

- **Unknown / likely missing**:
  - No explicit offline caching logic (e.g., Workbox/next-pwa) is present in dependencies or code.
  - Evidence: `package.json` does not include a PWA caching library and there is no global SW registration aside from push enablement.

**How to verify**:
- In Chrome DevTools > Application > Service Workers:
  - Confirm whether a SW is registered by default on page load (likely no), versus only after enabling push.
- Test offline mode for `/browse` and `/listing/[id]` and see whether content loads from cache (likely not unless the browser caches opportunistically).

---

## 8) Notifications findings (exact current channels)

### In-app notifications (bell + notification center)

- Notifications are stored under Firestore:
  - `users/{uid}/notifications/{notificationId}`
- Security rules:
  - Users can **read** and **update** (mark read/clicked), but cannot create or delete.
  - Evidence: `firestore.rules` (`match /users/{userId}/notifications/{notificationId}`).
- Client reads:
  - `components/navigation/NotificationsBell.tsx` uses `onSnapshot` for recent items and uses `subscribeToUnreadCount` for the badge.
  - `lib/firebase/notifications.ts` provides subscription and mark-read utilities; it explicitly states creation is server-only.
  - Evidence: `components/navigation/NotificationsBell.tsx`, `lib/firebase/notifications.ts`.

### Email notifications

- Email delivery is job-based and server-driven:
  - Notification events produce `emailJobs` docs; a Netlify cron sends them.
  - Evidence:
    - Job creation: `lib/notifications/processEvent.ts` writes to `db.collection('emailJobs')...` when email channel enabled.
    - Dispatch: `netlify/functions/dispatchEmailJobs.ts` reads `emailJobs` and sends via `lib/email/sender`.
    - Event processing: `netlify/functions/processNotificationEvents.ts` processes `events` and calls `processEventDoc`.

### Web push notifications (FCM)

- Client enabling flow:
  - `components/settings/NotificationPreferencesPanel.tsx` calls `enablePushForCurrentDevice`.
  - Evidence: `components/settings/NotificationPreferencesPanel.tsx`.
- Service worker registration:
  - `lib/firebase/push.ts` registers `/firebase-messaging-sw.js` and calls Firebase `getToken()` with `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
  - Evidence: `lib/firebase/push.ts`.
- Token storage:
  - `app/api/push/register/route.ts` stores tokens under `users/{uid}/pushTokens/{tokenId}`.
  - Evidence: `app/api/push/register/route.ts`.
  - Firestore rules allow users to read/create/update/delete their own tokens.
  - Evidence: `firestore.rules` (`match /users/{userId}/pushTokens/{tokenId}`).
- Push dispatch:
  - `lib/notifications/processEvent.ts` creates `pushJobs` for each token when push channel enabled.
  - `netlify/functions/dispatchPushJobs.ts` sends via Firebase Admin Messaging.
  - Evidence: `lib/notifications/processEvent.ts`, `netlify/functions/dispatchPushJobs.ts`.

### SMS notifications (Twilio)

- SMS jobs are created in the same event pipeline when enabled:
  - `lib/notifications/processEvent.ts` writes to `smsJobs`.
  - `netlify/functions/dispatchSmsJobs.ts` sends via `lib/sms/twilio`.
  - Evidence: `lib/notifications/processEvent.ts`, `netlify/functions/dispatchSmsJobs.ts`.

### iOS/Android mobile browser behavior (what users *actually* receive)

- **What we can say from the repo**:
  - The app implements **web push via service worker + FCM**.
  - If push is not enabled, users still get in-app notifications and (depending on preferences and job dispatch) email/sms.
  - Evidence: push enablement code + event rules.

- **Unknown from repo**:
  - Whether push works for **iOS Safari** users depends on:
    - iOS version and Safari’s current Web Push support
    - whether the site is installed to the home screen as a web app (often required)
    - correct APNs/FCM configuration for web push in production
  - **How to verify**:
    - On iOS Safari: open notification settings page, enable push, confirm permission prompt, confirm token is created in Firestore under `users/{uid}/pushTokens/`.
    - Trigger a push-enabled event (e.g., `Auction.Outbid`) and confirm `pushJobs` docs and delivery.

---

## 9) App-like scorecard (0–2)

Scoring:
- **0** = missing
- **1** = partial / present but inconsistent
- **2** = strong / consistent

| Dimension | Score | Evidence |
|---|---:|---|
| Installability (PWA manifest, icons, install UX) | 0 | No manifest found; `app/layout.tsx` icons commented; `public/` has no manifest |
| Offline support (SW caching strategy) | 0 | SW exists for push only; no caching library; SW registered only on push enable (`lib/firebase/push.ts`) |
| Push notification support on iOS (as currently implemented) | 1 | Web push via FCM exists; iOS behavior depends on browser support and install state (unknown from repo) |
| App-like navigation (bottom tabs) | 1 | `BottomNav` exists and is used on many pages (e.g., `app/browse/page.tsx`, `app/listing/[id]/page.tsx`) but dashboard/seller uses sidebar + hard nav |
| App-like modals (sheets) | 2 | Sheets exist (`components/ui/sheet.tsx` usage) + Vaul Drawer exists (`components/ui/drawer.tsx`) |
| Performance readiness (mobile) | 1 | Pagination exists but no virtualization; heavy client pages; unoptimized images (`next.config.js`, `app/browse/page.tsx`) |
| Touch targets & accessibility | 1 | Many buttons use min heights; bottom nav uses `min-h-[44px]`; inputs forced to 16px; but no global audit proving all touch targets |
| Scroll stability (no traps, correct viewport sizing) | 1 | Safe-area utilities exist; some dvh usage; nested scroll areas exist (messages, sheets) |

### What’s blocking an “eBay app” feel (plain English)

- The site has some app-like pieces (bottom tabs, sheets, real-time data), but:
  - **It is not a PWA** today (no manifest/offline/install).
  - **Dashboard navigation sometimes hard reloads**, which feels webby and can reset state.
  - **Images are not optimized**, and list rendering + animations can be heavy on mobile.
  - **Nested scroll containers** exist in key surfaces, which can create scroll traps unless carefully engineered everywhere.

---

## 10) Recommendations (no implementation — just what to do)

### P0: must-do to feel like an app on mobile (web-only)

1. **Make navigation consistent and avoid hard reloads where possible**
   - Evidence of current issue: `app/dashboard/layout.tsx` / `app/seller/layout.tsx` `hardNavigate()` uses `window.location.href`.
   - Goal: reduce full page reloads to preserve “app continuity” (state/scroll, perceived speed).
   - **Unknown from repo**: whether the underlying RSC payload issue still occurs in production; verify with real mobile sessions and logs.

2. **Add true PWA installability**
   - Missing: manifest + icons + theme color + metadata.
   - Evidence: `app/layout.tsx` has icons commented; no manifest in `public/`.

3. **Address mobile LCP risk: enable/ensure image optimization**
   - Evidence: `next.config.js` sets `images.unoptimized: true` and components also use `unoptimized` (e.g., `components/listings/ListingCard.tsx`).
   - Goal: reduce bytes and improve LCP on cellular.

4. **Prevent scroll traps in top 3 flows**
   - Targets: browse list, listing detail, messages.
   - Evidence of nested scroll patterns: `app/dashboard/messages/page.tsx`, `components/messaging/MessageThread.tsx`, filter sheets.

### P1: next improvements

1. **Virtualize large lists (browse, watchlist)**
   - Evidence: `app/browse/page.tsx` maps over the entire array; no virtualization.

2. **Reduce motion overhead on long lists**
   - Evidence: `AnimatePresence` in `app/browse/page.tsx`, `motion.div` in `components/listings/ListingCard.tsx`.

3. **Standardize mobile “sheet” patterns**
   - Use the existing primitives (`Sheet` and `Drawer`) consistently so modals feel native.
   - Evidence: `components/ui/dialog.tsx`, `components/ui/drawer.tsx`, `components/navigation/FilterBottomSheet.tsx`.

### P2: polish

1. **App-like transitions**
   - Public navbar already animates. Consider (later) consistent micro-transitions on navigation elements that don’t hurt performance.
   - Evidence: `components/navigation/Navbar.tsx` uses `framer-motion`.

2. **Better caching of “static-ish” data**
   - Many reads are client-side and could be cached more aggressively (subject to product correctness).
   - **Unknown from repo**: what caching headers are set in production beyond COOP headers (`next.config.js`); verify via deployed response headers.

---

## 11) If we later do Capacitor: delta + prerequisites checklist (no implementation)

> This section is a **delta list** only. It does not propose a PR; it describes typical impacts based on what the repo currently does.

### Current (web) vs Needed (Capacitor wrapper)

- **Routing / navigation**
  - **Current**: Next App Router; dashboard sometimes uses `window.location.href` hard reloads.
    - Evidence: `app/dashboard/layout.tsx`, `app/seller/layout.tsx`.
  - **Needed**: In a wrapped webview, hard reloads can feel slow and break “native” continuity; the navigation model should ideally be SPA-like everywhere.
  - **Unknown from repo**: how often hard navigation happens in practice and whether it’s still required.

- **Auth/session storage**
  - **Current**: Firebase Auth via `firebase/auth` in `lib/firebase/config.ts` and app-level `AuthProvider`.
    - Evidence: `lib/firebase/config.ts`, `components/providers.tsx`.
  - **Needed**: Validate persistence behavior inside a Capacitor WebView and decide whether to use native secure storage plugins for tokens (depends on threat model).
  - **Unknown from repo**: current persistence settings for Firebase Auth (would require inspecting AuthProvider and auth config).

- **Push notifications**
  - **Current**: Web push via service worker + FCM web tokens.
    - Evidence: `lib/firebase/push.ts`, `app/api/push/register/route.ts`, `netlify/functions/dispatchPushJobs.ts`.
  - **Needed**: Native push capture (APNs on iOS, FCM on Android) typically requires native SDK integration; tokens would likely be different from web push tokens.
  - **Prerequisite**: Decide whether the push pipeline will treat native tokens as a new platform type (e.g., `platform: 'ios' | 'android'`) alongside `'web'`.

- **Deep links**
  - **Current**: Push payloads include `deepLinkUrl` and SW click opens `clients.openWindow(url)`.
    - Evidence: `app/firebase-messaging-sw.js/route.ts`, `public/firebase-messaging-sw.js`.
  - **Needed**: Capacitor apps need explicit deep-link handling to route users inside the app; web URLs might need mapping.
  - **Unknown from repo**: whether universal links/app links are configured at the domain level (not visible in repo).

- **Offline**
  - **Current**: No general offline caching strategy (SW is push-only).
  - **Needed**: Decide whether offline is required; in a wrapped app, you can still use web caching strategies, but installability concerns shift.

### Capacitor prerequisites checklist (verification steps, not implementation)

1. **Confirm web app uses absolute URLs consistently** (especially in push payload deep links).
2. **Audit window.open / popup flows**:
   - `next.config.js` includes COOP headers tuned for popup flows; in a WebView these flows behave differently.
   - Evidence: `next.config.js` `headers()` COOP configuration.
3. **Verify CORS and cookie behavior under WebView** (Unknown from repo; requires runtime testing).
4. **Decide on a native push token model** and how it fits existing `users/{uid}/pushTokens` storage.

---

## Appendix: Evidence index (quick pointers)

- **Next.js App Router root**: `app/layout.tsx`
- **Tailwind config / breakpoints**: `tailwind.config.ts`
- **Public navbar**: `components/navigation/Navbar.tsx`, `components/navigation/ConditionalNavbar.tsx`
- **Bottom tabs**: `components/navigation/BottomNav.tsx`, used in `app/browse/page.tsx`, `app/listing/[id]/page.tsx`
- **Safe-area padding utilities**: `app/globals.css` (`.pb-safe`, `.pb-bottom-nav-safe`)
- **Dashboard/seller hard navigation**: `app/dashboard/layout.tsx` and `app/seller/layout.tsx` (`hardNavigate`)
- **Dialogs**: `components/ui/dialog.tsx`
- **Sheets/filters**: `components/navigation/FilterBottomSheet.tsx`, `components/navigation/MobileBrowseFilterSheet.tsx`
- **Drawer primitive**: `components/ui/drawer.tsx`
- **Push enablement**: `lib/firebase/push.ts`, `components/settings/NotificationPreferencesPanel.tsx`
- **Push SW**: `app/firebase-messaging-sw.js/route.ts`, `public/firebase-messaging-sw.js`, `app/firebase-messaging-sw-runtime.js/route.ts`
- **Notification pipeline**: `netlify/functions/processNotificationEvents.ts`, `lib/notifications/processEvent.ts`, `lib/notifications/rules.ts`
- **Job dispatch**: `netlify/functions/dispatchEmailJobs.ts`, `netlify/functions/dispatchPushJobs.ts`, `netlify/functions/dispatchSmsJobs.ts`

