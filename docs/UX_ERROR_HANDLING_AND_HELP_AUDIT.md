# UX Review: Error Handling, User Help & Feedback

**Purpose:** Audit of everything UX-related — error handling, helping users, loading states, empty states, and consistency. Complements `UX_VISUAL_POLISH_AUDIT.md`.

**Status:** Best-in-class checklist implemented; ongoing maintenance below.

---

## Best-in-Class 100/100 Checklist ✅

| Area | Item | Status |
|------|------|--------|
| **Error handling** | All user-visible errors use `formatUserFacingError` (toasts, inline, dialogs) | ✅ Done (sellers, account, orders, edit listing, pricing, notifications, reputation) |
| **Error handling** | Error boundary shows friendly message + “Refresh Page” + “Contact support” link | ✅ Done |
| **Error handling** | Global `app/error.tsx` shows friendly copy + “Contact support” link; dev-only details | ✅ Done |
| **Error handling** | 404 page has clear copy + Browse / Home / Go Back | ✅ Done |
| **Error handling** | Checkout error dialog receives friendly message (formatUserFacingError at source) | ✅ Done |
| **Payment trust** | Payment method dialog: Lock icon, “Secure checkout”, “Secured by Stripe” | ✅ Done |
| **Payment trust** | HelpTooltip next to “Choose payment method” with short explanation | ✅ Done |
| **Payment trust** | Copy: “Your payment is encrypted and processed securely by Stripe” | ✅ Done |
| **Empty states** | One clear CTA per list: watchlist → “Browse and add items”; orders → “Browse listings” | ✅ Done |
| **Empty states** | Messages → “Browse listings”; browse (no results) → “Clear filters” or “Browse all categories” | ✅ Done |
| **Empty states** | Bids & offers: Bids tab → “Browse auctions”; Offers tab → “Browse listings”; History → “Browse listings” | ✅ Done |
| **Empty states** | Dashboard offers page → EmptyState with “Browse listings” | ✅ Done |
| **Empty states** | Seller listings → “Create Listing” CTA | ✅ Done |
| **Loading** | Minimum skeleton display (e.g. 300 ms) to avoid flash — `useMinLoading` on browse | ✅ Done |
| **Loading** | `useMinimumLoading` hook available for other pages (`hooks/use-minimum-loading.ts`) | ✅ Done |
| **Accessibility** | “You’re the highest bidder” and key status use `aria-live="polite"` | ✅ Done (listing detail) |
| **Help** | Help at checkout (HelpTooltip in PaymentMethodDialog) | ✅ Done |
| **Help** | HelpLauncher, path-based content, tours, empty states with one CTA | ✅ Done |

---

## 1) Error Handling

### ✅ What’s in place

- **`formatUserFacingError`** (`lib/format-user-facing-error.ts`)
  - Maps technical errors to friendly copy (auth, network, Stripe, Firestore, HTTP).
  - Hides stack traces, Firebase codes, and long technical messages via `isTechnicalMessage()`.
  - Used in sellers, account, seller orders, edit listing, pricing, notifications, reputation, bids-offers, and other app pages for toasts and inline errors.

- **Error boundaries**
  - **`ProductionErrorBoundary`** wraps seller and dashboard layouts.
  - User sees: “Something went wrong” + “This section couldn’t load properly. Try refreshing the page.” + “Contact support” link + “Refresh Page” button.
  - Sends to Sentry (if present) and dispatches `app:error` for custom handlers.

- **Next.js `app/error.tsx`**
  - “Something went wrong” + “Try again” / “Browse Listings” / “Home” + “Contact support” link.
  - Error details and “Copy error details” only in development.
  - Reports to `reportError()`.

- **404** (`app/not-found.tsx`)
  - “Page Not Found” + “Browse Listings” / “Home” / “Go Back”.

- **Checkout / bid errors**
  - Listing detail sets `checkoutError.message` via `formatUserFacingError` before opening CheckoutStartErrorDialog.

### Maintenance

- **Standard:** In every new `catch` that shows an error to the user (toast, inline, dialog), use `formatUserFacingError(e, 'Context-specific fallback.')`.
- **Fallbacks:** Use specific fallbacks (e.g. “Failed to load seller profile”, “Couldn’t send message”) so the user knows what failed.

---

## 2) User Help & Guidance

### ✅ What’s in place

- **HelpTooltip** (`components/help/HelpTooltip.tsx`)
  - Info icon + tooltip; used in NewListingClient, account, listing detail, **PaymentMethodDialog**, trust badges, etc.
  - Accessible (button, focus, aria-label “Help”).

- **HelpLauncher** (help button, panel, tours)
  - Path-based help content and tours (`HELP_CONTENT`, `TOURS`, `getHelpKeyForPathname`).
  - First-time tour banner and tour overlay; profile-completion gate integration.
  - Help panel and chat (AI) entry points.

- **Empty states**
  - Reusable **`EmptyState`** component (icon, title, description, optional action button).
  - Watchlist (“Browse and add items”), orders (“Browse listings”), messages (“Browse listings”), browse (Clear filters / Browse all categories), bids-offers (Bids / Offers / History), dashboard offers (“Browse listings”), seller listings (“Create Listing”).

- **Seller tips**
  - Rule-based tips (e.g. “Add a photo”, “Longer title”, “Consider lowering price”) on seller overview from `getSellerInsights`.

- **Quick Setup Tour**
  - New-user flow: profile → email verify → Stripe Connect → first listing.

### Maintenance

- **New lists:** When adding a new list view, add one primary CTA in the empty state (EmptyState component).
- **Forms:** Use a shared pattern: validate, show inline error with friendly message, and optionally toast on submit error using `formatUserFacingError`.

---

## 3) Loading States & Skeletons

### ✅ What’s in place

- **Skeletons:** DashboardContentSkeleton, ListingDetailSkeleton, BrowseSkeleton, SellerSalesSkeleton, SellerListingsSkeleton, SellerOverviewSkeleton, OrderDetailSkeleton, SkeletonCard, SkeletonTable.
- **Spinners:** Loader2 used for buttons and inline loading (e.g. “Publishing…”, “Loading…”).
- **Minimum loading:** Browse page uses `useMinLoading(!loading, 300)` so skeleton shows at least 300 ms. Alternative hook `useMinimumLoading(loading, 300)` in `hooks/use-minimum-loading.ts` for pages that prefer “loading” as the input.

### Maintenance

- Use the same skeleton component per page type (e.g. always DashboardContentSkeleton for dashboard) so layout doesn’t shift between pages.
- For new key pages, consider `useMinLoading` or `useMinimumLoading` to avoid skeleton flash.

---

## 4) Accessibility & Consistency

### ✅ What’s in place

- **Aria and roles:** Many interactive elements use `aria-label`, `aria-hidden`, or `role` (e.g. listing detail, dashboard, seller sales, messages).
- **Focus:** HelpTooltip and other controls use visible focus styles (`focus-visible:ring-2`).
- **Live regions:** “You’re the highest bidder” and similar status in ListingDetailClient use `aria-live="polite"`.
- **Semantic structure:** Cards, headings, and buttons are used in a structured way.

### Maintenance

- Run an accessibility pass (axe-core or browser DevTools) on critical flows when making large changes.
- Ensure every new icon-only button has an `aria-label` (or equivalent).
- For new dynamic status messages, add `aria-live="polite"` where appropriate.

---

## 5) File Reference

- **Error formatting:** `lib/format-user-facing-error.ts`
- **Error boundary:** `components/error-boundary/ProductionErrorBoundary.tsx`
- **Global error UI:** `app/error.tsx`
- **404:** `app/not-found.tsx`
- **Help:** `components/help/HelpTooltip.tsx`, `components/help/HelpLauncher.tsx`, `help/helpContent.ts`, `help/tours.ts`
- **Empty state:** `components/ui/empty-state.tsx`
- **Min loading:** `hooks/use-min-loading.ts`, `hooks/use-minimum-loading.ts`
- **Reporting:** `lib/monitoring/reportError.ts` (used by error.tsx)
- **Payment dialog:** `components/payments/PaymentMethodDialog.tsx` (trust copy, HelpTooltip, Lock, Secured by Stripe)

---

## 6) Summary

- **Implemented:** User-facing errors use `formatUserFacingError`; error boundary and global error page include “Contact support”; payment dialog has Lock, “Secured by Stripe”, and HelpTooltip; empty states have one clear CTA per list (watchlist, orders, messages, browse, bids-offers, dashboard offers, seller listings); minimum loading on browse; aria-live on key status.
- **Ongoing:** Use `formatUserFacingError` for any new user-visible errors; add one primary CTA for new empty lists; keep accessibility and loading patterns consistent.
