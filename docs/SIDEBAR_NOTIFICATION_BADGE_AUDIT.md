# Sidebar Notification Badge Audit

Audit of all sidebar notification icons and badges: which pages use them correctly and which have gaps.

## Layouts with Sidebars

| Layout | Routes | File |
|--------|--------|------|
| **Dashboard** | `/dashboard/*` | `app/dashboard/layout.tsx` |
| **Seller** | `/seller/*` | `app/seller/layout.tsx` |

Both layouts share the same sidebar nav structure and badge subscriptions. The mobile bottom nav receives badge data from the layout's `mobileBottomNavItems` (Home, Dashboard, Sell, Buy, Alerts).

---

## Sidebar Items with Notification Badges

| Nav Item | Icon | Badge Source | Subscription |
|----------|------|--------------|--------------|
| **Notifications** | Bell | `badges.notifications` | `subscribeToUnreadCount` (all unread) |
| **Messages** | MessageSquare | `badges.messages` | `subscribeToUnreadCountByType('message_received')` |
| **Bids & Offers** | Gavel | `badges.offers` | `subscribeToUnreadCountByTypes([bid_outbid, bid_received, offer_*, ...])` |
| **Sold** | DollarSign | `badges.sales` | `subscribeToUnreadCountByTypes([order_created, order_paid])` *(Seller layout only)* |
| **Approve Listings** | CheckCircle | `badges.pendingApprovals` | Firestore `listings` where `status=='pending'` |
| **Admin Notifications** | Bell | `badges.adminNotifications` | `subscribeToUnreadCountByCategory('admin')` *(super admin only)* |
| **Admin Support** | HelpCircle | `badges.supportTickets` | `subscribeToUnreadCountByTypes(['admin_support_ticket_submitted'])` |
| **Admin Compliance** | Shield | `badges.pendingBreederPermits` | `subscribeToUnreadCountByType('admin_breeder_permit_submitted')` |

---

## Pages That Use the Sidebar

All routes under `/dashboard/*` and `/seller/*` render with the sidebar. Examples:

- `/dashboard/menu`, `/dashboard/notifications`, `/dashboard/messages`, `/dashboard/bids-offers`, `/dashboard/orders`, `/dashboard/watchlist`, etc.
- `/seller/overview`, `/seller/listings`, `/seller/sales`, `/seller/payouts`, etc.
- `/dashboard/admin/*` (when admin)

---

## Pages That Do NOT Use the Sidebar

These routes use the root layout with Navbar only (no sidebar):

- `/` (home)
- `/browse` (filter sidebar only, no nav sidebar)
- `/listing/[id]` (listing detail)
- `/sellers/[id]` (seller profile)
- `/how-it-works/*`, `/field-notes`, `/trust`, etc.

---

## Badge Clearing on Page Visit (Mark-as-Read)

When you visit a page, the corresponding sidebar badge should clear. Status:

| Page | Badge | Clears on Visit? | How |
|------|-------|------------------|-----|
| `/dashboard/messages` | Messages | ✅ | Layout `useEffect`: `markNotificationsAsReadByTypes(..., ['message_received'])` when `pathname.startsWith('/dashboard/messages')` |
| `/dashboard/notifications` | Notifications | ✅ | Notifications page: on first `onSnapshot` callback, marks all unread as read (one-time per visit via `autoMarkedReadRef`) |
| `/dashboard/bids-offers` | Bids & Offers | ⚠️ Partial | Only clears when **switching tabs** (`clearTabNotifs`), not on initial page load |
| `/seller/sales` | Sold | ✅ | Sales page: `useEffect` on mount calls `markNotificationsAsReadByTypes(..., ['order_created','order_paid'])` |
| `/dashboard/admin/support` | Admin Support | ✅ | Layout `useEffect` (Dashboard only): `markNotificationsAsReadByTypes(..., ['admin_support_ticket_submitted'])` |
| `/dashboard/admin/compliance` | Admin Compliance | ✅ | Layout `useEffect`: `markNotificationsAsReadByTypes(..., ['admin_breeder_permit_submitted'])` when viewing compliance |
| `/dashboard/offers` | *(no sidebar badge; separate page)* | ✅ | Marks offer types on mount |
| `/seller/offers` | *(no sidebar badge; separate page)* | ✅ | Marks offer types on mount |

---

## Issues Found (and Fixed)

### 1. Bids & Offers badge does not clear on initial visit — ✅ Fixed

**Location:** `app/dashboard/bids-offers/page.tsx`

**Problem:** `clearTabNotifs` was only called when the user **switches tabs**. When landing on `/dashboard/bids-offers` for the first time, no mark-as-read ran, so the sidebar badge stayed until the user changed tabs.

**Fix:** Added a `useEffect` on mount that calls `clearTabNotifs(tab)` when `user?.uid` is set, so the current tab’s notifications are marked read on initial visit and the sidebar Bids & Offers badge updates.

### 2. Seller layout did not subscribe to Admin Support badge — ✅ Fixed

**Location:** `app/seller/layout.tsx`

**Problem:** Dashboard layout subscribed to `admin_support_ticket_submitted` for the Support badge. Seller layout did **not**. When viewing from `/seller/*`, the Admin section showed "Support" with no badge even when there were unread support ticket notifications.

**Fix:** Added `subscribeToUnreadCountByTypes(user.uid, ['admin_support_ticket_submitted'], ...)` when `showAdminNav && isAdmin`, added `supportTickets` to badge state, and wired the Admin Support nav item to `badges.supportTickets`.

### 3. Seller layout does not mark Admin Support as read on visit

**Location:** `app/seller/layout.tsx`

**Problem:** When navigating to `/dashboard/admin/support` from a seller route, the **Dashboard** layout mounts (because the route is under `/dashboard/`), and Dashboard layout has the mark-as-read effect. So this is **OK** – the mark-as-read runs when you land on the support page. No change needed.

---

## Summary

| Category | Status |
|----------|--------|
| **Correct** | Messages, Notifications, Sold, Admin Support (Dashboard + Seller), Admin Compliance, Bids & Offers (clears on mount and tab switch) |
| **Fixed** | Bids & Offers (now clears on initial visit); Admin Support badge (Seller layout now subscribes) |
