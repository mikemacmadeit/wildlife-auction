# Backend Sidebar Pages — Full Audit

**Purpose:** Audit of all backend sidebar-linked pages for UX and functionality issues.  
**Scope:** Dashboard layout (`/dashboard/*`) and Seller layout (`/seller/*`) sidebar nav; mobile menu (`/dashboard/menu`); linked pages only.  
**Date:** February 2026.

---

## 1. Sidebar structure (shared)

Both `app/dashboard/layout.tsx` and `app/seller/layout.tsx` define the same **base** and **admin** nav items. Admin items are only visible when the user is (or was) an admin.

### 1.1 Base nav (User)

| Order | Label      | Href                         | Notes |
|-------|------------|------------------------------|-------|
| 1     | Overview   | `/seller/overview`           | Seller dashboard home |
| 2     | To-Do      | `/seller/todo`               | Key dates, action items; badge = todo count |
| 3     | Browse     | `/browse`                    | Leaves backend; browse listings |
| 4     | My Listings| `/seller/listings`           | |
| 5     | Watchlist  | `/dashboard/watchlist`       | |
| 6     | Saved Searches | `/dashboard/saved-searches` | |
| 7     | Notifications | `/dashboard/notifications` | Badge = unread count |
| 8     | Bids & Offers | `/dashboard/bids-offers`  | Badge = offers/bids needing action |
| 9     | Purchases  | `/dashboard/orders`          | |
| 10    | Sold       | `/seller/sales`              | Badge (seller layout only; see §3) |
| 11    | Messages   | `/dashboard/messages`        | Badge = unread messages |
| 12    | Payouts    | `/seller/payouts`             | |
| 13    | Reputation | `/seller/reputation`         | |
| 14    | Support    | `/dashboard/support`         | |
| 15    | Settings   | `/dashboard/account`         | Profile, security, notifications, help |

### 1.2 Admin nav

| Order | Label            | Href                              |
|-------|------------------|-----------------------------------|
| 1     | Users            | `/dashboard/admin/users`          |
| 2     | Approve Listings | `/dashboard/admin/listings`       |
| 3     | Flagged Messages | `/dashboard/admin/messages`       |
| 4     | System Health    | `/dashboard/admin/health`         |
| 5     | Admin Ops        | `/dashboard/admin/ops`            |
| 6     | Compliance       | `/dashboard/admin/compliance`     |
| 7     | Reconciliation   | `/dashboard/admin/reconciliation` |
| 8     | Revenue          | `/dashboard/admin/revenue`        |
| 9     | Support          | `/dashboard/admin/support`        |
| 10    | Email Templates  | `/dashboard/admin/email-templates`|
| 11    | Notifications    | `/dashboard/admin/notifications`  |

**Issue (fixed):** Seller layout previously had a different admin nav order (e.g. System Health before Approve Listings). Order is now aligned with dashboard layout so admins see the same sequence from either route.

---

## 2. Pages not in sidebar (but backend)

| Route | Purpose | Discoverability |
|-------|---------|-----------------|
| `/dashboard` | Redirects to `/seller/overview` | Entry from nav; no direct link needed |
| `/dashboard/menu` | Mobile: grouped links (Buying, Selling, Account, Admin) | Bottom nav "Dashboard" |
| `/dashboard/listings/new` | Create listing | Sidebar has "My Listings"; mobile "Sell"; Account quick action |
| `/dashboard/orders` | Purchases (buyer) | Sidebar "Purchases" |
| `/dashboard/recently-viewed` | Recently viewed listings | Home page rail "Recently viewed"; not in sidebar |
| `/dashboard/uploads` | Photo library (reuse across listings) | Linked from Account → Profile (“Photo library” card); see §4 |
| `/dashboard/settings/notifications` | Notification prefs (standalone) | Deep link (e.g. email unsubscribe); same UI in Account → Notifications |
| `/dashboard/offers`, `/dashboard/offers/[offerId]` | Offer detail | Reached from Bids & Offers |
| `/seller/logistics` | Seller logistics (if used) | Not in base nav; check seller layout |
| `/dashboard/admin/compliance-holds` | Admin compliance holds | Sub/tab of Admin Ops or Compliance |
| `/dashboard/admin/protected-transactions` | Admin protected tx | Sub of Admin Ops |
| `/dashboard/admin/knowledge-base` | Admin KB | Sub of admin |
| `/dashboard/admin/payouts` | Admin payouts | Sub of Admin Ops / Revenue |

---

## 3. UX & functionality findings

### 3.1 Consistency

- **Admin nav order:** Dashboard and Seller layouts now use the same admin item order (see fix below).
- **Sold badge:** **Fixed.** Dashboard layout now subscribes to `order_created` / `order_paid` and maps `badges.sales` to the "Sold" nav item, so the Sold badge appears consistently from either layout.

### 3.2 Discoverability

- **Uploads (`/dashboard/uploads`):** **Fixed:** Link in Account → Profile (“Photo library” card) and sidebar “Photo library” below “My Listings.”

### 3.3 Menu page vs sidebar

- **Dashboard menu (`/dashboard/menu`):** Groups links into Buying, Selling, Account, Admin. Does not include “Browse” as a row; “Buy” in mobile bottom nav goes to `/browse`, so behavior is consistent.
- **Menu “Needs action” callout:** Shows when `badges.offers + badges.notifications > 0` and links to Bids & Offers and Notifications — good.

### 3.4 Page-level UX (per page)

- **Overview (`/seller/overview`):** Response Time shows “Target: < 2 hours”; Reputation/performance metrics present. **Fixed:** Dashboard API load failure now shows toast (“Overview data unavailable”) instead of silent fallback.
- **To-Do (`/seller/todo`):** Key dates, calendar, action items; deep links work. **Fixed:** Load failure (listings/orders/dashboard API) now shows error state + toast (previously silent).
- **Watchlist (`/dashboard/watchlist`):** Tabs (Active, Ended, Sold), filters, bulk actions, empty state. Load error surfaced via `setError` + `formatUserFacingError`. Solid.
- **Saved Searches (`/dashboard/saved-searches`):** Thin wrapper around `SavedSearchesPanel`; panel has subscription, empty state, create/delete, toast on save/delete errors. OK.
- **Notifications (`/dashboard/notifications`):** Filters (all, important, buying, selling, etc.), mark-as-read on visit. **Fixed:** Firestore `onSnapshot` error callback now sets `loadError` + toast + Alert (previously empty list with no message).
- **Bids & Offers (`/dashboard/bids-offers`):** Tabs (Bids, Offers, Needs action), filters. Badge clears on initial visit (see `SIDEBAR_NOTIFICATION_BADGE_AUDIT.md`). Good.
- **Purchases (`/dashboard/orders`):** Status filters, search, checkout return handling, dispute flow, congrats modal. Loading and error states present.
- **Sold (`/seller/sales`):** Seller sales list; fulfillment and status handling. Good.
- **Messages (`/dashboard/messages`):** Thread list and thread view; badge clears on visit. Good.
- **Payouts (`/seller/payouts`):** Stripe Connect, balance, history. Good.
- **Reputation (`/seller/reputation`):** Tier, stats, reviews; loading/error handled. Good.
- **Support (`/dashboard/support`):** FAQ, create ticket, my tickets. Good.
- **Settings (`/dashboard/account`):** Tabs: Profile, Security, Notifications, Preferences, Help. Notification prefs embedded; Photo library link in Profile tab (see §3.2).
- **Admin pages:** Health, Ops, Compliance, Users, Listings, etc. — all present; Ops/Compliance are heavy but structured. Sub-routes (e.g. compliance-holds) reached from within those pages.

### 3.5 Mobile

- **Bottom nav:** Home, Dashboard (menu), Sell, Buy, Alerts (notifications). Badge on Alerts. Works.
- **Menu page:** Same sections as sidebar (Buying, Selling, Account, Admin) with badges. Good.

### 3.6 Accessibility & errors

- Layouts use `RequireAuth`, `ProfileCompletionGate`, `ProductionErrorBoundary`. Pages use `DashboardContentSkeleton` or equivalent loading states.
- Support, Orders, Bids & Offers, etc. use toast for errors and `formatUserFacingError`. Good.

---

## 4. Recommended fixes (implemented or to do)

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Align admin nav order in Seller layout with Dashboard layout | P1 | **Fixed** (seller layout reordered to match dashboard) |
| 2 | Add “Photo library” / “Uploads” link from Account (e.g. Profile or new “Listings & media” block) to `/dashboard/uploads` | P1 | **Fixed** (link added in Account page) |
| 3 | Show “Sold” badge in Dashboard layout when `badges.sales > 0` (same as Seller layout) | P2 | **Fixed** (sales subscription + badge in dashboard layout) |
| 4 | (Optional) Add “Uploads” or “Photo library” to sidebar below “My Listings” if product wants it always visible | P3 | **Fixed** (both layouts) |
| 5 | To-Do: surface load failure (listings/orders/dashboard API) to user | P1 | **Fixed** (error state + toast + Alert) |
| 6 | Notifications: surface Firestore onSnapshot error to user | P1 | **Fixed** (loadError + toast + Alert) |

---

## 5. Deep review note

A **per-page, per-feature** pass was done on sidebar-linked pages. Checks included: loading states, error handling (setError/toast on load and actions), empty states, and null/undefined guards. **Not** done: full E2E click-through of every flow, or runtime testing of every API. Findings:

- **Overview:** setError + toast on main load. **Fixed:** Dashboard API load failure (fetch /api/seller/dashboard) now shows toast “Overview data unavailable” instead of silent fallback.
- **My Listings:** setError on load; toast on publish/unpublish/delete/duplicate/reconcile. Good.
- **To-Do:** Load failure was silent; **fixed** with loadError state, toast, and Alert.
- **Watchlist:** setError + formatUserFacingError in catch. Good.
- **Saved Searches:** Subscription + toast on save/delete. Good.
- **Notifications:** onSnapshot error previously showed empty list with no message; **fixed** with loadError, toast, Alert.
- **Bids & Offers, Orders, Sold, Messages, Payouts, Reputation, Support, Account:** Error handling present (toast/setError) on main flows. Admin pages (Health, Ops, Compliance, etc.): toast/setError used where checked.

All listed issues fixed: Sold badge in Dashboard layout; Overview dashboard API error surfaced; Photo library in sidebar.

---

## 6. References

- Sidebar nav: `app/dashboard/layout.tsx`, `app/seller/layout.tsx`
- Mobile menu: `app/dashboard/menu/page.tsx`
- Badge behavior: `docs/SIDEBAR_NOTIFICATION_BADGE_AUDIT.md`
- Bottom nav: `components/navigation/LayoutBottomNav.tsx`
