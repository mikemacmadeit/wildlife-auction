# Seller Overview Calendar — Plan (No Code Yet)

**Goal:** Add a calendar to the seller overview that surfaces key platform dates so sellers can see deadlines, end dates, and action reminders in one place. Plan only; implementation later.

---

## 1. What events go on the calendar?

### Seller-side (their listings / sales)

| Event type | Description | Data source | Link / action |
|------------|-------------|-------------|----------------|
| **Auction ends** | Their auction listing ends (bidding closes) | `listings` where `type === 'auction'`, `status === 'active'`, `endsAt` | → Listing page |
| **Fixed-price listing** | Optional: “Listed on” or “Expires” if you add listing expiry | `listings`, `publishedAt` or future `expiresAt` | → Listing page |
| **Fulfillment SLA deadline** | Seller must complete delivery/update by this date (configurable, e.g. 7 days after payment) | Orders: `fulfillmentSlaDeadlineAt` (set at payment in webhook; `FULFILLMENT_SLA_DAYS` env) | → Order / Sales page |
| **Delivery scheduled / ETA** | When delivery is scheduled (seller set ETA or buyer agreed to window) | Orders: `order.delivery.eta` or `order.delivery.agreedWindow.start` | → Order page |
| **Docs due** | Reminder to upload missing compliance docs by a date | Orders with missing compliance docs; could derive “due by” from policy | → Order page |
| **Needs action (generic)** | Sales needing action (delivery update, docs, or issue) — show as a reminder on “today” or a target date | Same as Today card: orders needing delivery update, docs, or with issues | → Sales / Order page |
| **Offer expires** | Their received offer expires (buyer’s offer) | `offers` where `status === 'open'` or `'countered'`, `expiresAt` | → Offer detail / Bids & Offers |
| **Buyer must pay by (offer accepted)** | When buyer’s payment is due after seller accepted offer (e.g. 24h window) | Orders from offer: `acceptedUntil` / `offerReservedUntil` (seller view: “Buyer pays by X”) | → Order / Bids & Offers |
| **Dispute window closes** | Last date buyer can open a dispute (e.g. 72h after delivery) | Orders: `disputeDeadlineAt` (set at payment/delivery) | → Order / Sales (seller: “Buyer can dispute until X”) |
| **Protection window ends** | When funds release if no dispute (seller: “Payout releases on X”) | Orders: `protectionEndsAt` (set when delivery confirmed) | → Order / Payouts |
| **Payout expected** | Next Stripe payout date (money hits bank) | Stripe balance API: `nextPayoutArrivalDate` | → Payouts page |
| **Breeder permit expires** | Seller’s TPWD breeder permit expiration (whitetail sellers) | `publicSellerTrust` or breeder permit doc: `expiresAt` | → Account / Trust / Permit settings |

### Buyer-side (their watchlist / purchases)

| Event type | Description | Data source | Link / action |
|------------|-------------|-------------|----------------|
| **Watchlist / saved listing ends** | Auction they’re watching ends | Watchlist + listing `endsAt` (or “saved” listings with `endsAt`) | → Listing page |
| **Purchase delivery expected** | When they expect delivery (seller set ETA or buyer agreed to window) | Buyer orders: `order.delivery.eta` or `order.delivery.agreedWindow.start` | → Order / Purchases page |
| **Pay by (offer accepted)** | Buyer: deadline to complete payment after offer accepted | Order/offer: `acceptedUntil` (e.g. 24h; `OFFER_ACCEPTED_PAYMENT_WINDOW_HOURS`) | → Checkout / Order |

### Optional / future

- **Listing review decision** — If admin review has an SLA, “Review decision by X.”
- **Dispute response due** — If disputes have a response deadline.
- **Custom reminders** — User-added “Remind me to ship by Friday.”

---

## 2. How the calendar fits on the overview

- **Placement:** New card/section on seller overview, e.g. **“Key dates”** or **“Calendar”**, placed after Quick status / Financial summary (or in a tab: “Overview” vs “Calendar”).
- **Mobile-first:** On small screens, default to a **list view** (upcoming dates, next 7–14 days) rather than a full month grid. Tapping “Month” could open a sheet or full-screen month view.
- **Desktop:** Optional month grid + list sidebar, or month grid with dots/indicators for days that have events.

---

## 3. UX variants to decide

### A. List-first (recommended for mobile)

- **Default:** “Upcoming” list: next 7 or 14 days, one row per date, under each date the events (e.g. “Auction ends: [Listing title]”, “Delivery reminder: Order #xyz”, “Offer expires: [Listing]”).
- **Filter/chips:** “All” | “Selling” | “Buying” | “Actions” so they can focus.
- **Tap event** → deep link to listing / order / offer / payouts.

### B. Month grid

- Compact month view (e.g. 7-column week, rows per week).
- Days with events show a dot or count badge (e.g. “3”).
- Tap day → list of events for that day (or slide-up sheet).
- On very small screens, month grid can be a second tab or “View month” button that opens a sheet.

### C. Hybrid

- **Primary:** Upcoming list (next 7–14 days) for quick scan.
- **Secondary:** “View month” → month grid in a sheet or full page, for planning.

---

## 4. Data and permissions

- **Seller overview** already has: `listings`, `orders`, `dashboardData` (offers), `stripeBalance` (next payout).
- **Watchlist / saved listings:** Need endpoint or client fetch for “listings user is watching” with `endsAt` (or reuse existing watchlist API).
- **Fulfillment SLA:** Orders have `fulfillmentSlaDeadlineAt` (set at payment; `FULFILLMENT_SLA_DAYS` env, default 7). Use this as the “delivery due” date for seller.
- **Dispute / protection:** Orders have `disputeDeadlineAt` (buyer can dispute until) and `protectionEndsAt` (when funds release if no dispute). Both are set at payment/delivery confirmation.
- **Offer accepted → pay by:** Orders created from an accepted offer have `acceptedUntil` / `offerReservedUntil` (e.g. 24h; `OFFER_ACCEPTED_PAYMENT_WINDOW_HOURS`). Seller sees “Buyer pays by X”; buyer sees “Pay by X”.
- **Delivery ETA / scheduled:** Orders have `order.delivery.eta` (legacy single ETA) or `order.delivery.agreedWindow.start` (buyer-agreed window). Use for “Delivery scheduled” / “Delivery expected” on that date.
- **Breeder permit:** Seller’s TPWD breeder permit has `expiresAt` (e.g. from `publicSellerTrust` or breeder permit API). Show “Permit expires” for whitetail sellers.
- **Offer expires:** Use `offers[].expiresAt` (already available via dashboard API or client).

**Aggregation:** One `useMemo` (or API) that, given `listings`, `orders`, `offers`, `stripeBalance`, and optionally watchlist, returns an array of events: `{ date: YYYY-MM-DD, type, label, link, optionalEndTime }`. Sort by date (and time if present). Calendar component consumes this list and/or groups by day for the grid.

---

## 5. Mobile-specific design

- **Touch targets:** Every event row or day cell at least 44px height; tap area = full row/cell.
- **Sticky or in-flow:** Calendar card scrolls with the page (no floating calendar that blocks content).
- **Bottom nav:** Keep existing bottom nav; calendar section gets `pb-bottom-nav-safe` so it doesn’t sit under the nav.
- **List density:** On mobile, 1–2 lines per event (e.g. “Auction ends · [Title]” + “View listing”). No tiny text.
- **Month view:** If used, large day cells (e.g. min 36px), swipe to prev/next month, clear “Today” highlight.

---

## 6. Event types → labels and icons (suggested)

| Type | Short label (list) | Icon | Color / treatment |
|------|--------------------|------|-------------------|
| Auction ends (seller) | “Auction ends” | Clock / Gavel | Primary or amber |
| Offer expires | “Offer expires” | MessageSquare / Clock | Violet |
| Delivery due (seller) | “Update delivery” | Truck / FileCheck | Amber |
| Docs due | “Upload docs” | FileCheck | Amber |
| Needs action | “Needs action” | AlertCircle | Amber / destructive |
| Payout expected | “Payout” | DollarSign | Emerald |
| Fulfillment SLA deadline | “SLA: Update delivery by” | Clock / AlertCircle | Amber |
| Delivery scheduled / ETA | “Delivery (scheduled)” | Truck | Blue |
| Buyer must pay by (offer accepted) | “Buyer pays by” (seller) / “Pay by” (buyer) | CreditCard / Clock | Violet |
| Dispute window closes | “Dispute window closes” | ShieldAlert | Muted |
| Protection window ends | “Payout releases (if no dispute)” | DollarSign / Shield | Emerald |
| Breeder permit expires | “Permit expires” | FileCheck | Amber |
| Watchlist / saved ends | “Auction ends (watching)” | Eye / Heart | Muted + link |
| Purchase delivery | “Delivery expected” | Package | Muted + link |

---

## 7. Implementation order (when you build it)

1. **Data layer:** Build the “calendar events” array from existing overview data: listings (`endsAt`), orders (`fulfillmentSlaDeadlineAt`, `disputeDeadlineAt`, `protectionEndsAt`, `delivery.eta` / `agreedWindow`, `acceptedUntil`), offers (`expiresAt`), Stripe `nextPayoutArrivalDate`. No new API yet.
2. **List view:** “Key dates” card with “Upcoming” list (next 7–14 days), one row per event, link to listing/order/offer/payouts.
3. **Mobile polish:** Touch targets, spacing, `pb-bottom-nav-safe`, truncation for long titles.
4. **Optional:** Month grid (new component or library), “View month” entry from the list.
5. **Optional:** Watchlist end dates (once you have watchlist + `endsAt` in one place).
6. **Optional:** Breeder permit `expiresAt` (once seller trust/permit data is available on overview or via API).

---

## 8. What “badass” looks like

- **One place** for “what’s due when” — auctions, offers, delivery, docs, payouts, and (if we add) watchlist.
- **Mobile-first** list that’s fast to scan and tap; optional month view for planning.
- **Clear actions** — every event links to the right screen (listing, order, offer, payouts).
- **No clutter** — only real platform dates and reminders, no fake “tips” on the calendar.
- **Consistent** with the rest of the overview (same card style, spacing, bottom padding).

---

## 9. Gaps & additions (from how the app actually works)

Audit of the codebase showed these **concrete fields and flows** that the plan should use:

| What | Where it lives | Calendar use |
|------|----------------|--------------|
| **Fulfillment SLA** | Order `fulfillmentSlaDeadlineAt`; set in Stripe webhook at payment (`FULFILLMENT_SLA_DAYS`, default 7). Reminders: `Order.SlaApproaching` / `Order.SlaOverdue` in notifications. | “Update delivery by [date]” — primary seller deadline. |
| **Dispute deadline** | Order `disputeDeadlineAt` (e.g. 72h after delivery). Checked in dispute open API; buyer cannot open dispute after. | “Dispute window closes [date]” — seller knows when buyer’s window ends. |
| **Protection window** | Order `protectionEndsAt` (set when delivery confirmed; e.g. 7/14 days). Used for hold reason “protection_window” and release. | “Payout releases (if no dispute) [date]” — seller sees when funds can release. |
| **Offer accepted → pay by** | Order/offer `acceptedUntil` / `offerReservedUntil` (e.g. 24h; `OFFER_ACCEPTED_PAYMENT_WINDOW_HOURS`). Expire-offers job uses this. | Seller: “Buyer pays by [date]”. Buyer: “Pay by [date]”. |
| **Delivery ETA / agreed window** | Order `delivery.eta` (single ETA) or `delivery.agreedWindow.start` (buyer agreed to one of seller’s windows). Set in schedule-delivery and agree-delivery APIs. | “Delivery scheduled [date]” (seller) / “Delivery expected [date]” (buyer). |
| **Breeder permit expires** | Breeder permit doc has `expiresAt` (e.g. seller breeder permit API / `publicSellerTrust`). | “Permit expires [date]” for whitetail sellers. |
| **Pending listing** | Listing `status === 'pending'` (admin/compliance review). No SLA “review by” date in app. | Optional: “Listing in review” as a today/ongoing reminder; or omit. |

**Not in plan before:** SLA deadline (we had “delivery due” but not the exact field), dispute window closes, protection window ends, “buyer pays by” / “pay by”, delivery ETA/agreed date, breeder permit expires. All of these are now in §1 and §4.

---

**Summary:** Add a “Key dates” / “Calendar” section that shows upcoming platform events: auction end, offer expiry, **fulfillment SLA deadline**, **delivery scheduled/ETA**, **buyer pay-by (offer accepted)**, **dispute window closes**, **protection window ends**, payout date, **breeder permit expires**, and optionally watchlist end dates. Default to an **upcoming list** on mobile; optionally add a **month grid**. Reuse existing overview data (listings, orders, offers, Stripe balance; add watchlist/permit when available). Keep the whole overview (including the new section) super mobile friendly with safe area, 44px targets, and no horizontal overflow.
