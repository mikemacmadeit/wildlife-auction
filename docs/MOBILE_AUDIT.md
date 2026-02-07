# Mobile Mode Audit — Areas for Improvement & Fixes

Full audit of the app in mobile mode. **No code changes** — findings only.

---

## 1. Layout & Navigation

### 1.1 Bottom nav & content padding
- **Inconsistent bottom padding:** Some pages use `pb-20 md:pb-0`, others `pb-bottom-nav-safe md:pb-0` or `pb-bottom-nav-safe md:pb-6`. Root layout uses `pb-20` for main. The utility `pb-bottom-nav-safe` is `5rem + safe-area-inset-bottom`; hardcoded `pb-20` (5rem) ignores safe area on notched devices. Consider standardizing on `pb-bottom-nav-safe` (or a shared constant) for all pages that sit above the mobile bottom nav.
- **Dashboard account page:** Loading/not-auth states use `pb-bottom-nav-safe`; authenticated content uses `pb-20 md:pb-6`. Same page mixes two patterns — content could sit under the nav on some devices when authenticated.

### 1.2 Listing detail CTA vs bottom nav
- **StickyCTABar** is fixed at `bottom-0` with `z-50`. **LayoutBottomNav** is `z-[60]`. On public listing pages (`/listing/[id]`) when the user is signed in, the root layout shows **MobileBottomNavWhenSignedIn**. The “Place Bid” / “Buy Now” sticky bar can sit in the same vertical space as the bottom nav; the nav wins (higher z-index), so the CTA can be partially or fully covered. Consider raising the CTA so it sits above the bottom nav (e.g. `bottom: calc(env(safe-area-inset-bottom) + 4.5rem)`) or using a single combined bar on mobile.

### 1.3 Navbar visibility
- **ConditionalNavbar** hides the main Navbar on `/dashboard`, `/seller`, and `/delivery`. On those routes, mobile users only have the layout header (e.g. logo + user menu). No global “Browse” or “How it works” from the navbar — acceptable if the bottom nav + dashboard menu are the primary entry points, but worth confirming with product.

### 1.4 Footer visibility
- **ConditionalFooter** hides the footer on dashboard, seller, and delivery. Mobile users in those areas have no footer links (Privacy, Terms, Contact, etc.). If support/legal links should be reachable from dashboard/seller, consider a minimal footer or a link in the dashboard menu / account.

---

## 2. Touch targets & accessibility

### 2.1 Bottom nav badge
- **LayoutBottomNav** badge is `h-4 w-4` with `text-[10px]`. For double-digit counts (e.g. “12”) the badge is very small and may be hard to read or tap. Consider a minimum size (e.g. `min-h-5 min-w-5`) and slightly larger text when count &gt; 9.

### 2.2 Tab labels
- Bottom nav labels use `text-[10px]`. Legibility on small screens and for users who need larger text is limited. Consider at least `text-xs` (12px) or ensuring the OS “larger text” setting scales this.

### 2.3 Small interactive elements
- Many admin and list views use `h-8 w-8` or `h-7 w-7` icon buttons (e.g. copy, external link). Apple HIG suggests ~44pt minimum; 32px is borderline. Audit admin users page, revenue cards, and similar for sub-44px tap targets and consider `min-h-11 min-w-11` (or equivalent) on mobile for primary actions.

### 2.4 Dialog close button
- **DialogContent** close uses `min-w-[44px] min-h-[44px]` — good. Some custom modals (e.g. **CheckoutStartErrorDialog**, **WireInstructionsDialog**) use their own layout; worth confirming all modal close/primary actions meet the same minimum on mobile.

---

## 3. Tables & data-dense views

### 3.1 Seller listings list view
- **List view** on seller listings: desktop shows a full table; mobile shows **ListingListRow** (compact rows). Table is `hidden md:block`. Mobile behavior is appropriate; no change needed for structure. If list view is default or common on mobile, ensure row density and tap targets (e.g. “View”, “Edit”) are comfortable.

### 3.2 Admin revenue page
- **Admin Revenue** has a mobile card list (`md:hidden`) and desktop table (`hidden md:block`). Mobile experience is present and consistent.

### 3.3 Admin users page
- **Admin Users** has a mobile card list and desktop table. Mobile cards are dense (avatar, badges, buttons). “View dossier” and “Copy” are small; consider larger tap targets or spacing on mobile.

### 3.4 Admin health / other admin tables
- **Admin Health** and similar pages use tables with `overflow-x-auto`. On very narrow screens, horizontal scroll is required; ensure the scroll region is obvious (e.g. shadow or “scroll” hint) and that the first column (most important info) stays readable when scrolled.

### 3.5 Dashboard orders (My Purchases)
- Orders page uses a scrollable row of filter chips on mobile and card list. No table on mobile — good. Confirm that “Needs action” and other filters are easy to tap and that card actions (e.g. “Pay now”, “View”) have adequate hit area.

---

## 4. Forms & inputs

### 4.1 Browse search
- Browse mobile search uses `min-h-[44px]` — good. Save-search (heart) button is `h-8 w-8`; slightly small but acceptable.

### 4.2 Seller listings filters
- Filter chips and Location select on mobile are in a single horizontal scroll row. Chips use `px-3 py-1.5`; height may be under 44px. Consider `min-h-11` for filter chips on mobile for consistency with touch guidelines.

### 4.3 Stepper / long forms
- **NewListingClient**, **seller listing edit**, and other long forms rely on steppers or long pages. On mobile, keyboard and small viewport can make multi-step flows tedious. Consider: sticky “Next” / “Save” bar, progress indicator always visible, and reducing required fields per step where possible.

### 4.4 Address picker / payment modals
- **AddressPickerModal** and **PaymentMethodDialog** use `max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]` — good. Confirm all bottom sheets and full-screen modals respect safe area on notched devices.

---

## 5. Browse & listing discovery

### 5.1 Browse header
- Browse uses a fixed header below the global navbar (`top-20`) with a measured height and `--browse-header-h` for content offset. ResizeObserver updates the variable. On devices with dynamic toolbar (e.g. Safari mobile), the “sticky” effect can be wrong if the navbar height changes. Test with scroll and orientation change.

### 5.2 Category / filter chips
- Browse and seller listings use horizontal scroll for chips. `we-scrollbar-hover` is used; on touch devices scrollbars are often hidden, so users may not realize content scrolls. Consider a fade or “more” indicator at the end of the chip row.

### 5.3 Listing cards (home, browse, watchlist)
- Card layout and image aspect ratios vary by view. Ensure images don’t layout shift (e.g. fixed aspect-ratio) and that “Favorite” and “View” are easy to tap (e.g. not too close together).

---

## 6. Messages & notifications

### 6.1 Messages page
- Messages use a two-pane layout; on mobile, panes switch (inbox vs thread) with `max-md:h-[calc(100dvh-8rem)]`. Back button clears thread on mobile. Confirm that “Back” is always visible and that the thread list and composer have enough space on short screens.

### 6.2 Notifications page
- Filter row uses `overflow-x-auto` and `min-h-[44px]`. Behavior is consistent with other filter rows; ensure “Mark all read” and primary actions are not cramped.

### 6.3 Bids & offers
- Tabs (Needs action, Bids, Offers, History) use horizontal scroll on mobile. Same scroll-discoverability note as other chip rows.

---

## 7. Modals, sheets & dialogs

### 7.1 Dialog width
- **DialogContent** uses `w-[calc(100%-2rem)]` on small screens — good. Some dialogs (e.g. **SavedAddressesPanel**, **CheckoutStartErrorDialog**) override with `max-sm:w-[calc(100%-1.5rem)]` or fixed bottom sheet. Ensure no dialog is full-bleed with no padding on the smallest phones.

### 7.2 Sheet from bottom
- **MobileBrowseFilterSheet** and similar use `SheetContent` from bottom with `pb-[max(env(safe-area-inset-bottom),0.5rem)]`. Confirm all bottom sheets account for home indicator.

### 7.3 Payment / checkout dialogs
- **CheckoutStartErrorDialog** and **WireInstructionsDialog** use `max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0` etc. for a bottom-sheet style. They sit above the bottom nav when open; ensure focus trap and “Close” are obvious and that content scrolls if long.

---

## 8. Typography & density

### 8.1 Very small type
- Several admin and dashboard views use `text-[10px]` or `text-[11px]` (e.g. admin revenue, seller listing location). On mobile this can be hard to read. Prefer at least `text-xs` (12px) for body/secondary text, and reserve 10px only for non-essential labels if needed.

### 8.2 Seller listing gallery cards
- Cards use `text-xs` for title on mobile and compact spacing. If users complain about “too small,” consider one step up (e.g. `text-sm` for title) or slightly more padding.

---

## 9. Performance & loading

### 9.1 Skeleton consistency
- **SellerListingsSkeleton**, **DashboardContentSkeleton**, etc. use `pb-20 md:pb-6`. Layouts use `pb-20` or `pb-bottom-nav-safe`. Skeletons should match the final page’s bottom padding so layout doesn’t jump when content loads.

### 9.2 Image sizes
- Listing gallery (seller listings) uses `sizes="(max-width: 640px) 50vw, ..."` for 2-column mobile. Confirm Next/Image is not loading oversized images on mobile (e.g. 50vw is correct for the actual column width).

---

## 10. Safe area & notched devices

### 10.1 Root main
- Root layout uses `pb-20` and does not add `env(safe-area-inset-bottom)`. On iPhones with home indicator, the bottom nav already uses `pb-[max(env(safe-area-inset-bottom),0.25rem)]`; the main content padding does not. So content above the nav can end exactly at 5rem and the nav sits in the safe area — usually fine, but if any page has its own fixed bottom bar (e.g. CTA), it could overlap the safe area.

### 10.2 Fixed elements
- **LayoutBottomNav**: Uses safe area for its own padding — good. **StickyCTABar**: Fixed to `bottom-0` with no safe-area inset; on notched devices the CTA bar could overlap the home indicator if it were to extend that low (currently it has padding; verify on device).

---

## 11. Z-index & stacking

### 11.1 Sticky CTA vs nav
- Listing detail: **StickyCTABar** `z-50`, **LayoutBottomNav** (when present) `z-[60]`. Nav correctly covers the CTA; from a UX perspective the CTA is partially hidden when both show. See §1.2.

### 11.2 Modals vs nav
- Dialogs use `z-50`; bottom nav is `z-[60]`. So the nav can sit above overlay/content in some edge cases. Typically modals are portaled and full-screen, so this may not be visible; if any modal is bottom-aligned and not full-screen, verify it appears above the nav (e.g. modal overlay/content at `z-[70]` or higher).

---

## 12. Dashboard menu & entry points

### 12.1 Dashboard menu badges
- Dashboard menu page shows badges (Bids & Offers, Notifications, Messages, Admin items) via **DashboardBadgesContext**. Behavior matches sidebar — good. Confirm badge position (right of label, before chevron) doesn’t overlap on very narrow screens or long labels.

### 12.2 Dashboard menu sections
- Sections (Buying, Selling, Account, Admin) use `min-h-[56px]` for rows — good. Links are full-row; no tiny tap targets.

---

## 13. Seller-specific

### 13.1 Seller layout bottom nav
- Seller layout uses the same 5-item bottom nav (Home, Dashboard, Sell, Buy, Alerts) and now shows the combined Alerts total — consistent with dashboard.

### 13.2 Seller overview / sales / payouts
- These pages use `pb-20 md:pb-6` and card layouts. No tables on mobile; layout is appropriate. Check that key CTAs (e.g. “Create listing”, “View order”) are prominent and at least 44px tall on touch.

### 13.3 Listing edit page
- Long form with many sections. Uses `pb-bottom-nav-safe md:pb-6` — correct. Ensure “Save” / “Publish” are sticky or always visible when editing on small screens so users don’t have to scroll to submit.

---

## 14. Public routes (home, browse, listing detail)

### 14.1 Home page
- Main has `pb-20`; **MobileBottomNavWhenSignedIn** shows when signed in. Home uses horizontal rails and cards; ensure rails don’t cause horizontal overflow and that cards have adequate tap targets.

### 14.2 Listing detail (public)
- **ListingShell** uses `pb-bottom-nav-safe` so content clears the nav. Client component may add **StickyCTABar**; see §1.2 and §10.2 for CTA vs nav and safe area.

### 14.3 Seller profile (public)
- **/sellers/[sellerId]** uses `pb-20 md:pb-6`. When signed in, bottom nav shows; padding is consistent with other public pages.

---

## 15. Admin (mobile usage)

### 15.1 Admin layout
- Admin routes use the same dashboard/seller bottom nav. Admin menu is inside Dashboard menu (Admin section). No separate admin mobile nav — acceptable if admin usage is mostly desktop.

### 15.2 Admin tables
- Several admin pages (users, revenue, health, etc.) provide mobile card/list alternatives to tables. **Admin compliance**, **admin ops**, and others may still use tables with horizontal scroll on mobile; verify critical info is in the first column or provide a card fallback.

### 15.3 Admin support / compliance
- Forms and ticket lists: ensure primary actions and form submit buttons are full-width or large enough on mobile, and that required fields are obvious on small screens.

---

## 16. Miscellaneous

### 16.1 Horizontal scroll discoverability
- Multiple pages use `overflow-x-auto` for chips, tabs, or filters. Consider a shared pattern: fade edge, “scroll” icon, or “Swipe for more” so users know content continues.

### 16.2 Orientation change
- Fixed heights like `max-md:h-[calc(100dvh-8rem)]` on messages depend on viewport. Rotating device can change layout; test messages and any full-viewport panels in both orientations.

### 16.3 Reduced motion
- **LayoutBottomNav** uses Framer Motion (`layoutId` for the sliding pill). Respect `prefers-reduced-motion` by disabling or simplifying the animation so the nav still works and doesn’t cause discomfort.

### 16.4 Focus management
- Modals and sheets should trap focus and return focus on close. Radix primitives generally handle this; verify when opening PaymentMethodDialog, AddressPickerModal, or other critical flows from mobile that focus isn’t lost and that the close path is keyboard/screen-reader friendly.

---

## Summary table

| Area | Severity | Notes |
|------|----------|--------|
| Bottom padding inconsistency (pb-20 vs pb-bottom-nav-safe) | Medium | Standardize for safe area and nav height |
| Sticky CTA vs bottom nav overlap on listing detail | Medium | CTA can be covered by nav when signed in |
| Bottom nav badge size for 2-digit counts | Low | Small read/tap area |
| Touch targets &lt; 44px in admin/dense views | Low–Medium | Audit icon buttons and chip height |
| Very small type (10px/11px) on mobile | Low | Prefer 12px minimum for body |
| Horizontal scroll discoverability | Low | Fade or hint for scrollable chip rows |
| Account page mixed padding (pb-20 vs pb-bottom-nav-safe) | Low | Inconsistent within same page |
| Reduced motion for bottom nav animation | Low | Respect prefers-reduced-motion |
| Modal/dialog z-index vs bottom nav | Low | Verify in edge cases |
| Footer hidden on dashboard/seller | Info | By design; confirm product intent |

---

*Audit date: 2026-02. No code changes were made; this document is a list of findings only.*
