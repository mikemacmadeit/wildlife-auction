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

## Issues Found

### 1. Bids & Offers badge does not clear on initial visit

**Location:** `app/dashboard/bids-offers/page.tsx`

**Problem:** `clearTabNotifs` is only called when the user **switches tabs**. When landing on `/dashboard/bids-offers` for the first time, no mark-as-read runs, so the sidebar badge stays until the user changes tabs.

**Fix:** Call `clearTabNotifs` (or equivalent mark-as-read for all offer/bid types) in a `useEffect` on mount, using the current/default tab.

### 2. Seller layout does not subscribe to Admin Support badge

**Location:** `app/seller/layout.tsx`

**Problem:** Dashboard layout subscribes to `admin_support_ticket_submitted` for the Support badge. Seller layout does **not**. When viewing from `/seller/*` (e.g. `/seller/listings`), the Admin section shows "Support" with no badge, even if there are unread support ticket notifications.

**Fix:** Add the same `subscribeToUnreadCountByTypes(user.uid, ['admin_support_ticket_submitted'], ...)` in the Seller layout when `showAdminNav && isAdmin`.

### 3. Seller layout does not mark Admin Support as read on visit

**Location:** `app/seller/layout.tsx`

**Problem:** When navigating to `/dashboard/admin/support` from a seller route, the **Dashboard** layout mounts (because the route is under `/dashboard/`), and Dashboard layout has the mark-as-read effect. So this is **OK** – the mark-as-read runs when you land on the support page. No change needed.

---

## Summary

| Category | Status |
|----------|--------|
| **Correct** | Messages, Notifications, Sold, Admin Support (Dashboard), Admin Compliance |
| **Partial** | Bids & Offers (clears only on tab switch) |
| **Missing subscription** | Admin Support badge when viewing from Seller layout |

---

## Recommended Fixes

1. **Bids & Offers:** Add a `useEffect` on mount to mark bid/offer notification types as read when the user lands on `/dashboard/bids-offers` (e.g. mark the current tab's types, or all offer-related types).
2. **Seller layout:** Add `subscribeToUnreadCountByTypes` for `admin_support_ticket_submitted` and the `markNotificationsAsReadByTypes` effect when `pathname.startsWith('/dashboard/admin/support')`. Note: visiting `/dashboard/admin/support` uses Dashboard layout, so mark-as-read is already handled. The missing piece is the **subscription** so the badge shows correctly when on Seller routes.
