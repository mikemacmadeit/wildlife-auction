# Notification & Action System Gameplan

**Goal:** Best-in-class notification and action system so buyers and sellers clearly see what needs to be done, where to do it, and items stay visible until the action is completed (or explicitly dismissed).

**Scope:** Tab colors, action clarity (what/where/CTA), persistence rules (when things clear), and buyer/seller flows. No code changes in this doc—plan only.

---

## 1. Color combos for notification tabs

### 1.1 Bids & Offers page (`/dashboard/bids-offers`)

Today all tabs use the same primary color. Differentiate by intent:

| Tab           | Intent              | Suggested color treatment |
|---------------|---------------------|---------------------------|
| **Needs action** | Urgent, must act     | **Red/destructive** — border and active state (e.g. `border-destructive`, `bg-destructive` when active, badge destructive). Makes “something needs your attention” obvious at a glance. |
| **Bids**       | Auctions, time-sensitive | **Amber/warning** — border and active state (e.g. `border-amber-500`, amber active). Aligns with existing “Outbid” amber and auction urgency. |
| **Offers**     | Negotiation, best offer | **Fuchsia/sky or primary** — keep distinct from “urgent”; current primary or a dedicated offer color (e.g. fuchsia to match existing offer chips). |
| **History**    | Informational, past  | **Muted/neutral** — border-muted, no urgency. Badge only if there are new “history” items (e.g. declined/expired) that haven’t been seen. |

Design system: Prefer semantic tokens (e.g. `destructive`, `warning` if added) so light/dark and future themes stay consistent.

### 1.2 Notifications page (`/dashboard/notifications`)

Today: All, Important, Buying, Selling, Recommended, Account — all tabs use default/outline with no semantic color.

| Tab          | Intent                | Suggested color treatment |
|--------------|------------------------|----------------------------|
| **Important** | Things that need attention / action | **Red/destructive** (same as “Needs action”) when there are unread action-worthy items. |
| **Buying**   | Buyer-side (bids, wins, orders) | **Amber** for urgency where relevant; or primary. |
| **Selling**  | Seller-side (sales, payouts)   | **Green/success** or primary. |
| **All / Recommended / Account** | Browse vs low urgency | **Neutral/muted** or primary for “All”. |

Optional: Add a dedicated **“Needs action”** tab (or rename “Important” to “Needs action”) and give it the same red/destructive treatment as Bids & Offers so the mental model is consistent across the app.

### 1.3 Badges on tabs

- **Needs action (and Important if used):** Red/destructive badge (number) so the count reads as “urgent.”
- **Other tabs:** Neutral or secondary badge so they don’t compete with urgent.
- Consider a small “action required” icon (e.g. AlertCircle) next to the “Needs action” tab label when count &gt; 0.

---

## 2. Action clarity: what to do, where, and CTA

### 2.1 Principles

- Every item that “needs action” should answer:
  - **What:** One-line summary (e.g. “Seller accepted your offer”, “You were outbid”, “Set your delivery address”).
  - **Where:** The exact place to act (order page, listing, offer thread, checkout).
  - **Primary CTA:** One clear button/link (e.g. “Pay now”, “Set address”, “Respond to offer”, “Place bid again”).
- Avoid generic “View” when a specific action is possible; prefer “Pay now”, “Set address”, “Respond”, etc.

### 2.2 Bids & Offers — Needs action tab

- **Outbid:** CTA = “Place bid again” or “View listing” → listing page (and optionally scroll to bid box).
- **Offer countered:** CTA = “Respond to offer” → offer detail or modal with accept/counter/decline.
- **Offer accepted (buyer):** CTA = “Pay now” or “Complete purchase” → checkout or order page with payment step.
- **New offer (seller):** CTA = “Respond to offer” → offer detail with accept/counter/decline.
- **Buyer countered (seller):** CTA = “Respond to offer” → same.

Each row can show a short “Next step” line (e.g. “Pay by …” or “Offer expires in …”) and the primary CTA button.

### 2.3 Notifications page

- Notifications that imply an action should use **linkLabel** (and deep link) that describe the action: “Pay now”, “Set address”, “Respond to offer”, “Place bid”, “View order”, etc.
- In the list, show the action-oriented label on the button/link, not only “Open” or “View,” so users know what they’ll do when they click.

### 2.4 Orders / My Purchases

- Order cards or list can show a single “Next step” (e.g. “Set delivery address”, “Pay remaining balance”, “Confirm receipt”) with a direct CTA to the right screen (e.g. order detail with address step or payment step in focus).
- Same idea for seller: “Propose delivery”, “Mark shipped”, etc.

### 2.5 Deep links

- Ensure `deepLinkUrl` (and any in-app routing) goes to the **exact** screen or step where the action is done (e.g. order page with `?setAddress=1` or `#payment`), not just the general order or listing page, so “where” is unambiguous.

---

## 3. Persistence: still shows until action is done (or dismissed)

### 3.1 Current behavior (problems)

- **Notifications page:** On first load, all unread notifications are marked read. So if the user only opens the page and doesn’t complete an action, the item disappears from “unread” and the urgency is lost.
- **Bids & Offers:** When the user switches to a tab (e.g. “Needs action”), all notifications for that tab are marked read. So viewing “Needs action” clears the badge even if the user didn’t pay, respond, or set address.

Result: Users can “clear” urgency by just visiting the page or tab, which doesn’t match “still show until the action is done.”

### 3.2 Desired behavior

- **Action-required items** stay in “Needs action” (and keep badge count) until:
  - The user **completes the action** (e.g. paid, set address, responded to offer, placed bid again), or
  - The user **explicitly dismisses** (e.g. “I’ll do this later” or “Dismiss”), or
  - The opportunity is **no longer valid** (e.g. offer expired, auction ended).
- **Viewing** the tab or the notifications page should **not** by itself mark action-required items as read.

### 3.3 Implementation approach (conceptual)

- **Option A — Don’t mark by visit:** For “Needs action” (and optionally “Important”), do **not** auto-mark as read when the user opens the page or switches to that tab. Mark as read only when:
  - Backend or client detects action completion (e.g. order paid, address set, offer responded), or
  - User clicks “Dismiss” / “Mark as done later” on that item.
- **Option B — Action-completion drives read state:** Introduce a clear notion of “action completed” (e.g. order paid, address set, offer accepted/declined/countered). When that happens, mark the related notification(s) as read and remove from “Needs action.” Tab/view mark-as-read is removed or limited to non–action-required tabs.
- **Option C — Two states:** “Viewed” (user saw the list) vs “Read” (user opened the notification or completed the action). Badge and “Needs action” could be based on “action not yet completed” rather than “unread,” so even “viewed” items stay in the count until the action is done. This may require a small schema or convention (e.g. `actionCompletedAt` or linking notifications to order/offer state).

Recommendation: Start with **Option A** (no mark-as-read on tab/view for action-required) and add explicit “Dismiss” and action-completion hooks; evolve to Option C if you want “viewed but still pending” to be first-class.

### 3.4 Where to clear “action required”

- **Order:** When buyer sets delivery address, when payment is completed, when buyer confirms receipt; when seller proposes delivery, marks shipped, etc.
- **Offer:** When buyer or seller accepts, counters, or declines (so the “respond” action is done).
- **Bid:** When user places a new bid (outbid “action” is done) or auction ends (win/lose).
- **Message:** Optional to keep message notifications as “mark read on view” since the action is “read the message,” which viewing satisfies.

---

## 4. Buyer vs seller: flows and surfaces

### 4.1 Buyers

- **Needs action:** Outbid → bid again; Offer accepted → pay; Offer countered → respond; Order → set address, then pay if needed, then confirm receipt.
- **Surfaces:** Bids & Offers (Needs action, Bids, Offers), Notifications (Important / optional Needs action), My Purchases / Orders (next step + CTA per order).
- **Clarity:** Every row or card should have one primary CTA and, where useful, a short “Next step” or “Due by” line.

### 4.2 Sellers

- **Needs action:** New offer → respond; Offer countered → respond; Order paid → propose delivery or mark shipped; Dispute → respond; Payout/account issues → fix.
- **Surfaces:** Bids & Offers (for offers), Notifications, Seller Sales / Orders (next step + CTA), possibly Seller dashboard summary.
- **Clarity:** Same as buyers: one primary CTA per item, “Next step” or due-by when relevant.

### 4.3 Shared

- **Messages:** Can stay in Alerts/Notifications with “View conversation” or “Reply” as CTA; mark-as-read on view is acceptable.
- **Account/Compliance:** e.g. listing rejected, breeder permit needed — clear “Fix” or “View” CTA and don’t clear until the user has taken the fix path or dismissed.

---

## 5. Summary checklist (no code)

- [ ] **Bids & Offers tabs:** Needs action = red/destructive; Bids = amber; Offers = fuchsia or primary; History = muted. Badge styles match.
- [ ] **Notifications tabs:** Important (or new “Needs action”) = red/destructive when actionable; Buying/Selling/Others = distinct semantic or neutral colors; badges consistent.
- [ ] **Action clarity:** Every action-required item has what/where/CTA; deep links go to the exact step; labels are action phrases (“Pay now”, “Set address”, “Respond to offer”), not generic “View.”
- [ ] **Persistence:** Action-required items are not marked read just by opening the page or tab; they clear when action is completed, explicitly dismissed, or no longer valid.
- [ ] **Completion signals:** Order, offer, and bid flows emit clear “action completed” so the right notifications can be marked read and removed from Needs action.
- [ ] **Buyer and seller:** Same patterns (Needs action, CTAs, next steps) applied on Bids & Offers, Notifications, and Orders/Sales so the system feels consistent and “best in class.”

---

## 6. Files and areas to touch (reference only)

When implementing, these are the main places to change (for reference; no code in this doc):

- **Tab colors / variants:** `app/dashboard/bids-offers/page.tsx` (TabsTrigger for needs_action, bids, offers, history); `app/dashboard/notifications/page.tsx` (filter buttons / tabs).
- **Mark-as-read behavior:** `app/dashboard/notifications/page.tsx` (auto-mark on load); `app/dashboard/bids-offers/page.tsx` (clearTabNotifs on tab change and on mount); `lib/firebase/notifications.ts` (markNotificationsAsReadByTypes usage).
- **CTAs and labels:** Notification payloads and `linkLabel` / `deepLinkUrl` in `lib/notifications/` (e.g. processEvent, inApp); Bids & Offers row actions and buttons; order summary “next step” and CTAs in `app/dashboard/orders/`.
- **Design system:** Semantic colors for “action required” (e.g. destructive), “warning” (amber), “success” (green) in `DESIGN_SYSTEM.md` and any shared Tab/Badge variants.

---

## 7. Smart notification system: 100/100 — fewer clicks, zero friction

Goal: **Every path to an action uses the minimum number of clicks and the least cognitive load.** Users should never think "where do I go?" or "what do I do next?" — the system surfaces the next action and gets them there in one tap when possible.

---

### 7.1 Click budget: what "less clicks" means

| Scenario | Today (typical) | 100/100 target |
|----------|------------------|----------------|
| User gets "Offer accepted — pay now" | Click Alerts → maybe Notifications or Bids & Offers → find item → click item → land on listing → find checkout | **1 click:** From bell dropdown or dashboard: "Pay now" → checkout (or order page with payment step). |
| User gets "Set delivery address" | Click Alerts / Orders → find order → open order → find address section | **1 click:** "Set address" in dropdown or on order card → order page with address step in focus. |
| Seller gets "New offer" | Click Alerts → find offer → open offer page → respond | **1 click:** "Respond" in dropdown or list → offer modal or offer page with respond UI. |
| User was outbid | Click Alerts → Bids & Offers → Needs action → find listing → Place bid | **1–2 clicks:** "Place bid again" → listing with bid box in view (or inline bid on B&O if safe). |

Rule of thumb: **From "I see something needs my attention" to "I'm doing the action" = 1 click when possible, 2 max.** No hunting across tabs or pages.

---

### 7.2 One entry point: Alerts that put "Needs action" first

- **Alerts (bell / bottom nav)** = the single place users look when they see a badge. Use it as the **action hub**, not just a list of notifications.
- **Order the dropdown/list by action priority:**
  1. **Needs action** (pay, set address, respond to offer, place bid again) — each item shows **primary CTA as the main button** (e.g. "Pay now", "Set address", "Respond").
  2. **New messages** — "Reply" or "View conversation."
  3. **Informational** (order shipped, listing approved, etc.) — "View" is fine.
- **Clicking the CTA** goes straight to the screen/step where the action happens (deep link). No "open notification → then click again to go to order."
- Result: User opens Alerts once and can do the urgent thing in **one more click**.

---

### 7.3 Primary CTA on every surface

- **Bell dropdown:** Each row = title + short context + **one primary button** (Pay now, Set address, Respond, Place bid again). Secondary "View" only if needed.
- **Bids & Offers (Needs action tab):** Each row = listing/offer summary + **primary CTA on the row** (no "open row then click button"). Optional: inline quick actions (e.g. Accept / Counter / Decline on the row for offers).
- **Notifications page:** Same — action label is the main link/button, not a generic "Open."
- **Dashboard / Menu:** If the user has 1–3 pending actions, show a **"Next for you"** or **"Needs your action"** card with the top 1–3 items and primary CTAs. One click from dashboard to doing the thing.
- **Order list / My Purchases:** Each order card shows **one next step + one CTA** (e.g. "Set delivery address" + "Set address"). Same for seller (e.g. "Propose delivery" + "Propose").

Principle: **The next action is always visible and one click away** from wherever the user already is (Alerts, Dashboard, Bids & Offers, Orders).

---

### 7.4 Inline and quick actions (fewer navigations)

Where the action is simple and safe, let users act **without leaving the list**:

- **Offers (Needs action):** On the row: "Accept" / "Counter" / "Decline" (or "Respond" that opens a small modal). Avoid "Open offer page → then choose."
- **Bids (Outbid):** "Place bid again" can open a **slide-over or modal** with current price + bid input + Place bid, and deep link to listing only if they need more context.
- **Messages:** In dropdown, "Reply" could open a compact reply composer (or deep link to thread with focus on reply box).

Not every action has to be inline (e.g. "Pay now" goes to checkout), but **every action should be one click from the first place the user sees it** (dropdown or list). No "click to open, then click again to act."

---

### 7.5 Deep links: one tap to the exact step

- Every notification and every "Needs action" row should link to the **exact URL + hash/query** where the action happens:
  - Order + set address → `/dashboard/orders/[id]?setAddress=1` (or step=address).
  - Order + pay → `/dashboard/orders/[id]` with payment step focused or checkout URL.
  - Offer respond → `/dashboard/bids-offers` with offer modal open, or `/dashboard/offers/[id]` with respond UI.
  - Outbid → `/listing/[id]#bid` or `?focus=bid`.
- **No "land on page then scroll/find"** — the first paint should show the relevant form or button above the fold when possible.

---

### 7.6 Smart ordering and grouping

- **Needs action:** Sort by (1) urgency (e.g. offer expires in 2 hours), (2) type (checkout-ready first, then respond, then bid again), (3) time. So the most time-sensitive and highest-impact item is always at the top.
- **Grouping (optional):** If there are many items, group by type — e.g. "3 offers need response", "1 order — set address", "2 outbid". One tap on the group can expand or go to filtered view (e.g. Needs action tab filtered to offers). Reduces "scanning a long list."
- **Limit noise:** In Alerts dropdown, cap at 5–10 items and show "X more in Notifications" or "X more in Bids & Offers" with a link. Keeps the dropdown scannable; power users can go to the full page.

---

### 7.7 Contextual surfacing: "the one thing" on dashboard

- If the user has **exactly one** pending action (e.g. one offer accepted, one address to set), the **dashboard or menu** can show a single prominent card: "You have 1 thing to do — Pay now" (or "Set address", etc.) with one CTA. No need to open Alerts or Bids & Offers.
- If **2–3** pending actions: same card but "3 things need your attention" with the top action + "See all" that goes to Alerts or Needs action.
- This makes the dashboard a **real home base** — users who land there immediately see what to do next and can do it in one click.

---

### 7.8 Zero-friction defaults (where safe)

- **Payment:** If user often pays with card, pre-select "Card" when they click "Pay now" from a notification (or remember last method). One less click at checkout.
- **Address:** If they have one saved address, "Set address" could pre-fill or offer "Use [Home]" one-tap. Still allow change.
- **Offer response:** For "Respond to offer", open with the respond UI (accept/counter/decline) visible immediately; don't make them click "Respond" again on the offer page.

These are "nice-to-haves" that shave one click or one decision for returning users.

---

### 7.9 Mobile: thumb-friendly and fast

- **Primary CTA** on each notification row or card should be **large enough and placed** so it's easy to tap (thumb zone). Avoid tiny "View" links; prefer a full-width or prominent button.
- **Bottom nav "Alerts"** — when they tap, the first screen can be "Needs action" (or a combined view with Needs action at top), not "All" or "Important" with no urgency. Default view = most actionable.
- **Swipe actions (optional):** On notification or B&O row, swipe to reveal "Pay now" or "Respond" for power users. Not required for 100/100 but reduces taps once users learn it.

---

### 7.10 Unification: one mental model

- **Alerts** = "What needs my attention and what do I do?" (Needs action first, then messages, then rest.)
- **Bids & Offers** = "All my bids and offers; the Needs action tab is the same list as 'urgent' in Alerts."
- **Notifications** = "Full history of everything" (and optionally same ordering: Needs action first if we add that tab).
- **Orders** = "All my orders; each card shows the one next step + CTA."

Same language everywhere: **"Needs action"** (or "Needs your action") and **primary CTA by name** (Pay now, Set address, Respond, Place bid again). So users learn once and get the same behavior in the bell, on the dashboard, and on Bids & Offers.

---

### 7.11 100/100 checklist (smart + low-click)

- [ ] **Click budget:** Every action-required path is 1–2 clicks from the first surface (Alerts, dashboard, or list). No 3+ click hunts.
- [ ] **Alerts = action hub:** Bell dropdown (and Alerts page if opened) shows Needs action first, with primary CTA on each row; one click from notification to doing the thing.
- [ ] **Primary CTA everywhere:** Bids & Offers rows, notification rows, order cards, and dashboard "Next for you" all show one clear button (Pay now, Set address, Respond, Place bid again).
- [ ] **Deep links:** Every CTA goes to the exact step (URL + query/hash); no "land then find."
- [ ] **Inline/quick actions where possible:** Respond to offer, place bid again, or reply from list/modal to save a navigation.
- [ ] **Smart order:** Needs action sorted by urgency and type; optional grouping ("3 offers need response"); dropdown capped so it stays scannable.
- [ ] **Dashboard surfacing:** When 1–3 pending actions exist, dashboard shows "Next for you" / "Needs your action" with top item(s) and one-tap CTA.
- [ ] **Zero-friction defaults:** Remember payment method, pre-fill or one-tap address where appropriate; respond UI visible on first open.
- [ ] **Mobile:** Large, thumb-friendly primary CTAs; default Alerts view = most actionable (Needs action first).
- [ ] **One mental model:** Same labels and behavior across Alerts, Bids & Offers, Notifications, and Orders so the system feels simple and predictable.

When all of the above are true, the notification system is **100/100**: minimal clicks, maximum clarity, and actions surface wherever the user already is.
