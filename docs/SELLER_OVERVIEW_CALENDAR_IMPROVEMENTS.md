# Seller Overview Calendar — Improvement Ideas

Improvements to the Key dates calendar (already implemented: month grid, event pills, status colors, day modal, single-event modal, legend).

---

## 1. More event types (from the plan)

| Improvement | Description | Effort |
|-------------|-------------|--------|
| **Buyer must pay by** | Show “Buyer pays by [date]” when seller accepted an offer and order has `acceptedUntil` / `offerReservedUntil`. | Low — add to keyDateEvents when order/offer data has it. |
| **Breeder permit expires** | “Permit expires [date]” for whitetail sellers using permit `expiresAt` (e.g. from seller trust/permit API). | Low — once permit data is available on overview. |
| **Watchlist end dates** | “Auction ends (watching)” for auctions on the user’s watchlist (buyer context). | Medium — need watchlist + listing `endsAt` in one place. |
| **Docs due** | “Upload docs by [date]” for orders with missing compliance docs and a policy-based due date. | Low — derive from `paidAt` + policy. |

---

## 2. Time of day

| Improvement | Description | Effort |
|-------------|-------------|--------|
| **Show time where it matters** | Auction end and offer expiry often have a specific time; show e.g. “Feb 4, 2:00 PM” in the event modal and in pills (tooltip or second line). | Low — add `timeLabel` or `dateTime` to events when available. |
| **Sort by time within a day** | In the day modal and in cell pills, order events by time when multiple fall on the same day. | Low — sort by `sortMs` (already have it). |

---

## 3. Navigation and “today”

| Improvement | Description | Effort |
|-------------|-------------|--------|
| **Jump to today** | A “Today” button next to prev/next month that sets `calendarMonth` to the current month and optionally scrolls to today’s cell. | Low |
| **Week view** | Optional 7-day strip (e.g. “This week” / “Next week”) for a quick scan without the full month. | Medium |
| **Swipe to change month** | On mobile, swipe left/right on the calendar to go to prev/next month. | Low — add touch handlers or a lightweight lib. |

---

## 4. List view (upcoming)

| Improvement | Description | Effort |
|-------------|-------------|--------|
| **Upcoming list toggle** | Bring back an “Upcoming” view: next 7–14 days as a simple list (one row per event). Useful for “what’s due soon” without opening the grid. | Low — re-add list mode and a “List” / “Calendar” toggle. |
| **Default view preference** | Remember user’s choice (list vs calendar) in localStorage. | Low |

---

## 5. Real-time and freshness

| Improvement | Description | Effort |
|-------------|-------------|--------|
| **Refetch on focus** | Already refetch on tab focus; ensure calendar event list is derived after that so status (done/overdue) updates. | Done / verify |
| **Live listeners** | Optional: Firestore listeners on orders/listings/offers for the current user so the calendar updates without refresh when they complete an action elsewhere. | Medium |
| **“Updated just now”** | Optional: show a short “Updated” timestamp or subtle pulse when data has just been refetched. | Low |

---

## 6. Event modal and actions

| Improvement | Description | Effort |
|-------------|-------------|--------|
| **Secondary actions** | In the single-event modal, add type-specific actions where useful (e.g. “Mark delivered”, “Respond to offer”, “View listing”). | Low — add 1–2 buttons per type. |
| **Countdown for urgent** | For “Offer expires” or “Auction ends” in the next 24h, show “Expires in 5h” or “Ends in 2h” in the modal. | Low |
| **Dismiss / “Done” for completed** | Optional: let user dismiss a completed event from the calendar so it no longer appears (stored in localStorage or user prefs). | Medium |

---

## 7. Mobile and layout

| Improvement | Description | Effort |
|-------------|-------------|--------|
| **Full-screen month on mobile** | “View full calendar” that opens the month grid in a sheet or full-screen for easier tapping. | Low |
| **Collapsible legend** | On small screens, show legend in a “What do colors mean?” expandable section or open in a small popover to save space. | Low |
| **Larger “today”** | Make the today cell slightly larger or more prominent on small screens. | Low |

---

## 8. Accessibility

| Improvement | Description | Effort |
|-------------|-------------|--------|
| **Day cell labels** | `aria-label` on each day button (e.g. “February 4, 2026, 3 events”). | Low |
| **Event pill labels** | Ensure each event pill has an accessible name (event type + subtitle/date). | Low |
| **Keyboard nav** | Arrow keys to move between days, Enter to open day or event; focus trap in modals. | Medium |
| **Live region** | When opening the event modal, announce “Event details opened” for screen readers. | Low |

---

## 9. Export and sharing

| Improvement | Description | Effort |
|-------------|-------------|--------|
| **Export to iCal / Google** | “Add to calendar” or “Export” that generates an `.ics` or link for Google Calendar so key dates show in the user’s main calendar. | Medium — build ICS or use Google Calendar API. |
| **Sync Stripe payouts** | If Stripe exposes payout schedule, show “Payout (expected)” on those dates. | Low if API available. |

---

## 10. Empty and edge states

| Improvement | Description | Effort |
|-------------|-------------|--------|
| **Empty month message** | When the selected month has no events, show “No key dates this month” and a short tip (e.g. “List an item or complete a sale to see dates here”). | Low |
| **Too many events in a cell** | Already have “+N more”; consider “View all” that opens the day modal with full list when N is large. | Done / optional |
| **Past month default** | When opening the calendar, default to current month (already do); keep “Today” button so returning to current month is one tap. | Low — add “Today” as in §3. |

---

## Priority order (suggested)

1. **Jump to today** — quick win, better navigation.
2. **Time of day** for auction/offer end — more accurate and less confusion.
3. **Upcoming list** toggle — fast scan without opening the grid.
4. **More event types** — Buyer pays by, Breeder permit, Docs due (as data allows).
5. **Secondary actions in event modal** — e.g. “Mark delivered”, “Respond to offer”.
6. **Accessibility** — aria-labels and keyboard nav.
7. **Export to calendar** — if users ask for it.
8. **Live listeners** — if you want true real-time without refetch.

---

**Summary:** The calendar is already strong (month grid, status colors, day + event modals, legend). The highest-impact next steps are: **Jump to today**, **show time** for auctions/offers, **re-add an Upcoming list** option, **add missing event types** (buyer pay-by, permit, docs due), and **improve event modal actions** and **accessibility**.
