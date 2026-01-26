# Wildlife Exchange: Current UX & Workflow Analysis

**Date:** January 25, 2026  
**Purpose:** Deep understanding of current platform behavior across all roles to inform future redesign  
**Scope:** Buyer, Seller, and Admin workflows from order creation to completion

---

## 1. Order Lifecycle Map

### Transaction Status Values (Canonical)

| Status | Terminal? | Actor Responsible | Triggering Action | UI Location |
|--------|-----------|-------------------|-------------------|-------------|
| `PENDING_PAYMENT` | No | System | Checkout session created | Buyer: Orders list |
| `PAID` | No | System | Payment confirmed (webhook) | All roles: Order detail |
| `FULFILLMENT_REQUIRED` | No | System | Payment confirmed → seller must act | Seller: Sales page |
| `DELIVERY_SCHEDULED` | No | Seller | Seller schedules delivery (SELLER_TRANSPORT) | Seller: Order detail |
| `OUT_FOR_DELIVERY` | No | Seller | Seller marks "out for delivery" | Seller: Order detail |
| `DELIVERED_PENDING_CONFIRMATION` | No | Seller | Seller marks delivered | Buyer: Order detail |
| `READY_FOR_PICKUP` | No | Seller | Seller sets pickup info (BUYER_TRANSPORT) | Buyer: Order detail |
| `PICKUP_SCHEDULED` | No | Buyer | Buyer selects pickup window | Buyer: Order detail |
| `PICKED_UP` | No | Buyer | Buyer confirms pickup with code | Buyer: Order detail |
| `COMPLETED` | Yes | Buyer/System | Buyer confirms receipt OR pickup confirmed | All roles: All pages |
| `DISPUTE_OPENED` | No | Buyer/Seller | User opens dispute | All roles: Order detail |
| `REFUNDED` | Yes | Admin | Admin processes refund | All roles: Order detail |
| `CANCELLED` | Yes | System/Admin | Order cancelled | All roles: Order detail |

### Transport-Aware Workflows

**SELLER_TRANSPORT (Delivery):**
```
PENDING_PAYMENT → FULFILLMENT_REQUIRED → DELIVERY_SCHEDULED → 
OUT_FOR_DELIVERY → DELIVERED_PENDING_CONFIRMATION → COMPLETED
```

**BUYER_TRANSPORT (Pickup):**
```
PENDING_PAYMENT → FULFILLMENT_REQUIRED → READY_FOR_PICKUP → 
PICKUP_SCHEDULED → PICKED_UP → COMPLETED
```

### SLA & Timing

- **Fulfillment SLA:** 7 days (configurable via `FULFILLMENT_SLA_DAYS`, default 7)
- **SLA Start:** When payment is confirmed (`fulfillmentSlaStartedAt`)
- **SLA Deadline:** `fulfillmentSlaDeadlineAt = paidAt + 7 days`
- **Dispute Window:** 72 hours (configurable via `DISPUTE_WINDOW_HOURS`)
- **Dispute Deadline:** `disputeDeadlineAt = paidAt + 72 hours`

### Payment Model

- **Seller Payment:** Immediate via Stripe Connect destination charges (no payout hold)
- **Platform Fee:** 10% (displayed consistently)
- **No Escrow:** Sellers receive funds immediately upon successful payment

---

## 2. Buyer UX Journey

### Stage 1: Purchase & Payment Confirmation

**Location:** `/dashboard/orders` (list) + `/dashboard/orders/[orderId]` (detail)

**What Buyer Sees:**
- Order appears in list with status badge (e.g., "Fulfillment in progress")
- Tooltip on "held" status: "Seller was paid immediately upon successful payment. Waiting on fulfillment (delivery/pickup) to complete."
- Order detail shows `TransactionTimeline` component with steps
- Status: "Payment received" or "Fulfillment required"

**Actions Available:**
- View order details
- View listing
- View seller profile
- No buyer action required at this stage

**Feedback:**
- Toast notification: "Payment confirmed. Your order will appear below shortly."
- Email notification: `Order.Confirmed` event
- In-app notification badge (if subscribed)

**What Happens If Buyer Does Nothing:**
- Order remains in "Fulfillment in progress" state
- Buyer sees "Waiting on seller to schedule delivery" (SELLER_TRANSPORT) or "Waiting on seller to set pickup information" (BUYER_TRANSPORT)
- No escalation or reminder system

### Stage 2: Fulfillment In Progress (SELLER_TRANSPORT)

**Location:** `/dashboard/orders/[orderId]`

**What Buyer Sees:**
- **If `DELIVERY_SCHEDULED`:** 
  - Badge: "Delivery Scheduled"
  - ETA displayed (if seller provided)
  - Transporter info (name, phone, plate) if provided
  - Message: "Waiting for delivery to arrive."
  
- **If `OUT_FOR_DELIVERY`:**
  - Badge: "Out for Delivery"
  - Same ETA/transporter info
  - Message: "Waiting for delivery to arrive."

**Actions Available:**
- View delivery details
- Report an issue (opens dispute)
- No confirmation action available yet

**Feedback:**
- Email notification: `Order.InTransit` (when seller marks out for delivery)
- In-app notification
- No proactive reminders about delivery status

**What Happens If Buyer Does Nothing:**
- Order stays in transit state
- No automatic escalation
- Buyer must manually check status

### Stage 3: Delivery Arrived (SELLER_TRANSPORT)

**Location:** `/dashboard/orders/[orderId]`

**What Buyer Sees:**
- Status: `DELIVERED_PENDING_CONFIRMATION`
- Badge: "Delivered"
- Prominent "Confirm Receipt" button
- Delivery check-in dialog (if `?checkin=1` in URL)
- Message: "Confirm you received the order to complete the transaction."

**Actions Available:**
- **Confirm Receipt** → Calls `POST /api/orders/{id}/confirm-receipt`
- **Report an Issue** → Opens dispute dialog
- View delivery proof (if seller uploaded)

**Feedback:**
- Toast: "Receipt confirmed. Transaction complete. Seller was paid immediately upon successful payment."
- Order status updates to `COMPLETED`
- Email notification: `Order.DeliveryConfirmed`

**What Happens If Buyer Does Nothing:**
- Order remains in `DELIVERED_PENDING_CONFIRMATION`
- No automatic completion after timeout
- No reminder notifications
- Seller already paid, but transaction not marked complete

### Stage 4: Pickup Flow (BUYER_TRANSPORT)

**Location:** `/dashboard/orders/[orderId]`

**What Buyer Sees:**
- **If `READY_FOR_PICKUP`:**
  - Pickup location displayed
  - Pickup code displayed (prominently)
  - List of available time windows (radio buttons)
  - "Select Pickup Window" action per window
  
- **If `PICKUP_SCHEDULED`:**
  - Selected window displayed
  - Pickup code displayed
  - Input field for 6-digit pickup code
  - "Confirm Pickup" button (disabled until code entered)

**Actions Available:**
- Select pickup window → `POST /api/orders/{id}/fulfillment/select-pickup-window`
- Enter pickup code and confirm → `POST /api/orders/{id}/fulfillment/confirm-pickup`
- Report an issue

**Feedback:**
- Toast: "Pickup window selected." or "Pickup confirmed. Transaction complete."
- Status updates immediately

**What Happens If Buyer Does Nothing:**
- Order stalls at `READY_FOR_PICKUP` or `PICKUP_SCHEDULED`
- No reminders to schedule/confirm pickup
- Seller waiting indefinitely

### Stage 5: Completed

**Location:** All order views

**What Buyer Sees:**
- Badge: "Completed"
- Green confirmation message
- Transaction timeline shows all steps complete
- No further actions needed

**Confusion Points:**
1. **"Fulfillment in progress" badge** - Buyer may not understand this means seller is working on it
2. **No delivery tracking** - If seller doesn't provide transporter info, buyer has no visibility
3. **Silent waiting** - No notifications when seller takes action (e.g., schedules delivery)
4. **Dispute deadline unclear** - 72-hour window not prominently displayed
5. **Pickup code visibility** - Code shown before buyer needs it (could be confusing)

---

## 3. Seller UX Journey

### Stage 1: Sale Notification

**Location:** `/seller/sales` (list)

**What Seller Sees:**
- New order appears in "Needs action" tab
- Badge: "Fulfillment required" or "Paid"
- Transport option badge (Seller Transport / Buyer Transport)
- Net proceeds amount displayed
- "View order details" button

**Actions Available:**
- View order details → Navigate to `/seller/orders/[orderId]`
- Expand payment details (collapsible)
- Expand order details (collapsible)

**Feedback:**
- Email notification: `Order.Received` (when order created)
- Email notification: `Order.Paid` (when payment confirmed)
- In-app notification badge
- Unread count badge on "Needs action" tab

**What Happens If Seller Does Nothing:**
- Order stays in "Needs action" tab
- No automatic reminders
- SLA countdown not visible in list view
- Order becomes overdue (past SLA deadline) but no visible warning until admin views it

### Stage 2: Fulfillment Setup (SELLER_TRANSPORT)

**Location:** `/seller/orders/[orderId]`

**What Seller Sees:**
- **Fulfillment Panel:**
  - Status badge: "FULFILLMENT REQUIRED"
  - "Schedule Delivery" button
  - Dialog form: ETA (date/time), Transporter name, phone, license plate/tracking

**Actions Available:**
- **Schedule Delivery** → Opens dialog → `POST /api/orders/{id}/fulfillment/schedule-delivery`
- View order timeline
- View buyer info

**Feedback:**
- Toast: "Delivery scheduled."
- Status updates to `DELIVERY_SCHEDULED`
- Buyer receives notification (if system working)

**What Happens If Seller Does Nothing:**
- Order remains `FULFILLMENT_REQUIRED`
- SLA deadline approaches (7 days)
- No visible countdown or warning in seller UI
- Order appears in admin "Overdue" lane after deadline passes
- No automatic escalation to seller

### Stage 3: Delivery In Progress (SELLER_TRANSPORT)

**Location:** `/seller/orders/[orderId]`

**What Seller Sees:**
- **If `DELIVERY_SCHEDULED`:**
  - Scheduled ETA displayed
  - Transporter info displayed
  - "Mark Out for Delivery" button
  
- **If `OUT_FOR_DELIVERY`:**
  - Same info displayed
  - "Mark Delivered" button (also available from `DELIVERY_SCHEDULED`)

**Actions Available:**
- **Mark Out for Delivery** → `POST /api/orders/{id}/fulfillment/mark-out-for-delivery`
- **Mark Delivered** → `POST /api/orders/{id}/mark-delivered`
- Upload delivery proof (optional, if system supports)

**Feedback:**
- Toast: "Marked out for delivery." or "Marked delivered."
- Status updates
- Buyer receives `Order.InTransit` notification

**What Happens If Seller Does Nothing:**
- Order can stay in `DELIVERY_SCHEDULED` indefinitely
- No reminder to mark out for delivery
- Buyer sees "Delivery scheduled" but doesn't know if it's actually on the way

### Stage 4: Waiting for Buyer Confirmation (SELLER_TRANSPORT)

**Location:** `/seller/orders/[orderId]`

**What Seller Sees:**
- Status: `DELIVERED_PENDING_CONFIRMATION`
- Message: "Waiting on buyer confirmation"
- "Buyer will confirm receipt to complete the transaction."
- No actions available

**Actions Available:**
- None (seller must wait)
- Can view dispute section if buyer opens one

**Feedback:**
- No notification when buyer confirms
- Seller must manually check order status

**What Happens If Buyer Does Nothing:**
- Order remains `DELIVERED_PENDING_CONFIRMATION` indefinitely
- Seller already paid, but transaction not complete
- No automatic completion after timeout
- No reminder to buyer

### Stage 5: Pickup Flow (BUYER_TRANSPORT)

**Location:** `/seller/orders/[orderId]`

**What Seller Sees:**
- **If `FULFILLMENT_REQUIRED`:**
  - "Set Pickup Info" button
  - Dialog form: Location, time windows (start/end pairs), pickup code auto-generated
  
- **If `READY_FOR_PICKUP`:**
  - Pickup location displayed
  - Pickup code displayed prominently
  - Available windows listed
  - Message: "Waiting for buyer to schedule pickup"
  
- **If `PICKUP_SCHEDULED`:**
  - Selected window displayed
  - Pickup code displayed
  - Message: "Waiting for pickup confirmation"
  
- **If `PICKED_UP` or `COMPLETED`:**
  - Green completion message

**Actions Available:**
- **Set Pickup Info** → `POST /api/orders/{id}/fulfillment/set-pickup-info`
- No other actions (seller waits for buyer)

**Feedback:**
- Toast: "Pickup info set."
- Status updates to `READY_FOR_PICKUP`
- Buyer receives notification (if system working)

**What Happens If Seller Does Nothing:**
- Order stays `FULFILLMENT_REQUIRED`
- Buyer sees "Waiting on seller to set pickup information"
- No reminders to seller

### Confusion Points:

1. **Payment visibility** - Seller sees "Seller was paid immediately" but may not understand when/how
2. **SLA urgency unclear** - No countdown timer or warning in seller UI
3. **Transport option confusion** - Seller may not remember which option was selected
4. **Pickup code timing** - Code generated before buyer needs it (could be forgotten)
5. **No delivery tracking** - Seller must manually update status; no integration with shipping services
6. **Silent waiting** - No notification when buyer takes action (e.g., confirms receipt)

---

## 4. Admin UX Journey

### Lane Organization

**Location:** `/dashboard/admin/ops`

**Lanes:**
1. **Overdue** - Orders past SLA deadline, not completed
2. **Needs Action** - Active fulfillment statuses requiring action
3. **Disputes** - Orders with `DISPUTE_OPENED` status
4. **Completed** - Orders with `COMPLETED` status

### Lane Controls

- **Search:** By order ID, listing ID, buyer/seller email, payment intent ID
- **Overdue Only Toggle:** Filter "Needs Action" to show only overdue items
- **Sort by SLA:** Sort "Needs Action" by SLA deadline (soonest first)

### Order Card View

**What Admin Sees:**
- Order ID (last 8 chars)
- Transaction status badge (from `getEffectiveTransactionStatus`)
- Listing title
- Buyer and seller info (name, email)
- Amount and seller amount
- Created date
- "✓ Seller paid immediately via destination charge" message
- **Fulfillment Status Block:**
  - Transaction status badge
  - Transport option badge
  - SLA countdown (hours/minutes remaining, or "No SLA")
  - Milestone checklist (transport-aware):
    - SELLER_TRANSPORT: Delivery scheduled → Out for delivery → Delivered (pending) → Completed
    - BUYER_TRANSPORT: Pickup info set → Window selected → Pickup confirmed → Completed

**Actions Available:**
- **View** → Opens detail modal
- **Refund** → Opens refund dialog
- **Mark Paid (Stripe)** → For bank/wire orders awaiting confirmation

### Order Detail Modal

**What Admin Sees:**
- Full order information
- Transaction timeline
- Fulfillment status block (same as card)
- AI dispute summary (if dispute exists)
- AI admin summary (if available)

**Actions Available:**
- **Freeze Seller** → `POST /api/admin/sellers/{sellerId}/freeze`
- **Export Dispute Packet** → `GET /api/orders/{orderId}/dispute-packet`
- **Refund** → Process full or partial refund
- **Resolve Dispute** → Close dispute with resolution type

### Stats Dashboard

**What Admin Sees:**
- Total orders
- Overdue count
- Needs Action count
- Disputes count
- Completed count
- Total revenue
- Total fees
- Total payouts (deprecated - sellers paid immediately)

### Detection & Intervention

**How Admins Detect Stalled Orders:**
- **Overdue Lane:** Shows orders past SLA deadline
- **SLA Countdown:** Visible in order cards and detail modal
- **Milestone Checklist:** Shows which steps are incomplete
- **Sort by SLA:** Helps prioritize soon-to-be-overdue orders

**What Admins CAN Do:**
- Freeze seller accounts
- Process refunds (full or partial)
- Resolve disputes
- Mark orders as paid (for bank/wire)
- Export dispute packets
- View full order timeline

**What Admins CANNOT Do:**
- Force seller to schedule delivery
- Force buyer to confirm receipt
- Automatically complete transactions
- Send reminders to users
- Escalate orders automatically

### Confusion Points:

1. **SLA visibility** - Countdown shown but not prominently highlighted
2. **No bulk actions** - Must handle orders one-by-one
3. **No reminder system** - Admin must manually contact users
4. **Overdue definition** - Only shows if SLA deadline passed; doesn't warn about approaching deadlines
5. **Transport option clarity** - Must read fulfillment block to understand workflow
6. **No automated escalation** - System doesn't automatically notify users of overdue orders

---

## 5. Communication & Notification Gaps

### Notification Events (What Exists)

**Order Lifecycle:**
- `Order.Confirmed` - Buyer payment confirmed (email + in-app)
- `Order.Received` - Seller receives order (email + in-app)
- `Order.Preparing` - Seller marks preparing (email + in-app)
- `Order.InTransit` - Seller marks in transit (email + in-app)
- `Order.Delivered` - Seller marks delivered (email + in-app)
- `Order.DeliveryConfirmed` - Buyer confirms receipt (email + in-app)
- `Order.DeliveryCheckIn` - Scheduled reminder to buyer (email, scheduled)

**Missing Notifications:**
- ❌ Seller scheduled delivery (`DELIVERY_SCHEDULED`) - No notification to buyer
- ❌ Seller set pickup info (`READY_FOR_PICKUP`) - No notification to buyer
- ❌ Buyer selected pickup window (`PICKUP_SCHEDULED`) - No notification to seller
- ❌ Buyer confirmed pickup (`PICKED_UP`) - No notification to seller
- ❌ SLA deadline approaching (e.g., 24 hours remaining) - No reminder
- ❌ Order overdue - No escalation notification
- ❌ Buyer hasn't confirmed receipt after X days - No reminder
- ❌ Seller hasn't scheduled delivery after X days - No reminder

### Notification Timing

**Immediate Dispatch:**
- `Order.Confirmed` ✅
- `Order.Received` ✅
- `Order.InTransit` ✅
- `Order.Delivered` ✅
- `Order.DeliveryConfirmed` ✅

**Scheduled Dispatch:**
- `Order.DeliveryCheckIn` - Scheduled reminder (email only)

**Missing Scheduled Reminders:**
- ❌ SLA deadline approaching (24h, 12h, 1h before)
- ❌ Order overdue (daily until action taken)
- ❌ Buyer hasn't confirmed receipt (daily after delivery)
- ❌ Seller hasn't started fulfillment (daily after payment)

### Email vs In-App

**Email Notifications:**
- Most order events send email
- `Order.DeliveryCheckIn` is email-only (scheduled)

**In-App Notifications:**
- Most order events create in-app notifications
- Users must be logged in to see them
- No push notifications (web app only)

**Gaps:**
- No SMS notifications
- No browser push notifications
- In-app notifications only visible when user is on site
- No persistent reminders for overdue actions

### Who Gets Notified

**Buyer Notifications:**
- ✅ Payment confirmed
- ✅ Order in transit
- ✅ Order delivered
- ❌ Delivery scheduled (missing)
- ❌ Pickup info set (missing)

**Seller Notifications:**
- ✅ Order received
- ✅ Order paid
- ❌ Buyer selected pickup window (missing)
- ❌ Buyer confirmed pickup (missing)
- ❌ Buyer confirmed receipt (missing)

**Admin Notifications:**
- ✅ Dispute opened
- ❌ Order overdue (missing)
- ❌ SLA deadline approaching (missing)

---

## 6. Fulfillment Bottlenecks & Failure Points

### Where Orders Can Stall Indefinitely

1. **`FULFILLMENT_REQUIRED` → Seller Never Acts**
   - **Location:** Seller sales page
   - **Why:** Seller may not check email/notifications, forgets about order, doesn't understand next step
   - **Current Behavior:** Order stays in "Needs action" tab, no reminders
   - **SLA:** 7 days, but seller doesn't see countdown
   - **Admin View:** Appears in "Overdue" lane after deadline, but no automatic escalation

2. **`DELIVERY_SCHEDULED` → Seller Never Marks Out for Delivery**
   - **Location:** Seller order detail
   - **Why:** Seller may forget to update status, thinks it's optional
   - **Current Behavior:** Order stays scheduled, buyer sees "Delivery scheduled" but doesn't know if it's actually shipped
   - **No SLA:** No deadline for this step
   - **Admin View:** Appears in "Needs Action" but no urgency indicator

3. **`DELIVERED_PENDING_CONFIRMATION` → Buyer Never Confirms**
   - **Location:** Buyer order detail
   - **Why:** Buyer may not check email, forgets, doesn't understand importance
   - **Current Behavior:** Order stays pending, seller already paid but transaction incomplete
   - **No Timeout:** No automatic completion after X days
   - **No Reminders:** No daily/weekly reminders to confirm
   - **Admin View:** Appears in "Needs Action" but no escalation

4. **`READY_FOR_PICKUP` → Buyer Never Selects Window**
   - **Location:** Buyer order detail
   - **Why:** Buyer may not see notification, forgets, doesn't understand urgency
   - **Current Behavior:** Order stays ready, seller waiting
   - **No Reminders:** No notifications to buyer
   - **Admin View:** Appears in "Needs Action" but no escalation

5. **`PICKUP_SCHEDULED` → Buyer Never Confirms Pickup**
   - **Location:** Buyer order detail
   - **Why:** Buyer may forget code, doesn't understand need to confirm
   - **Current Behavior:** Order stays scheduled, seller waiting
   - **No Reminders:** No notifications
   - **Admin View:** Appears in "Needs Action" but no escalation

### Where Users May Misinterpret Status

1. **"Fulfillment in progress" Badge (Buyer)**
   - **Confusion:** Buyer may think order is actively being fulfilled, but seller may not have started
   - **Reality:** Means payment received, waiting on seller to start fulfillment
   - **Impact:** Buyer may wait indefinitely thinking seller is working on it

2. **"Delivery Scheduled" Status (Buyer)**
   - **Confusion:** Buyer may think delivery is actually on the way
   - **Reality:** Seller scheduled a delivery window, but may not have shipped yet
   - **Impact:** Buyer expects delivery but it may not arrive

3. **"Waiting on buyer confirmation" (Seller)**
   - **Confusion:** Seller may not understand why buyer needs to confirm
   - **Reality:** Buyer must confirm receipt to complete transaction
   - **Impact:** Seller may think transaction is complete when it's not

4. **SLA Countdown (Admin Only)**
   - **Confusion:** Sellers and buyers don't see SLA deadlines
   - **Reality:** 7-day deadline exists but only visible to admins
   - **Impact:** Users don't understand urgency

### Where Two Parties May Think Other Is Responsible

1. **Delivery Status (SELLER_TRANSPORT)**
   - **Seller thinks:** "I marked it delivered, buyer should confirm"
   - **Buyer thinks:** "I haven't received it yet, seller should update status"
   - **Reality:** Seller marks delivered, buyer must confirm receipt
   - **Gap:** No communication between parties about actual delivery status

2. **Pickup Scheduling (BUYER_TRANSPORT)**
   - **Seller thinks:** "I set pickup info, buyer should schedule"
   - **Buyer thinks:** "Seller should tell me when to come"
   - **Reality:** Seller sets windows, buyer must select one
   - **Gap:** No notification when seller sets info, buyer may not know it's ready

3. **Pickup Confirmation (BUYER_TRANSPORT)**
   - **Seller thinks:** "Buyer should confirm after pickup"
   - **Buyer thinks:** "I picked it up, transaction should be complete"
   - **Reality:** Buyer must enter code to confirm
   - **Gap:** Buyer may not understand need to confirm with code

### Where Lack of Action Has No Visible Consequence

1. **Seller Doesn't Schedule Delivery**
   - **Consequence:** Order becomes overdue (admin sees it)
   - **User Impact:** Seller doesn't see countdown or warning
   - **Buyer Impact:** Buyer sees "Waiting on seller" but no urgency

2. **Buyer Doesn't Confirm Receipt**
   - **Consequence:** Transaction incomplete, seller already paid
   - **User Impact:** No reminders, no timeout, no consequence visible to buyer
   - **Seller Impact:** Seller sees "Waiting on buyer" but no way to escalate

3. **Buyer Doesn't Select Pickup Window**
   - **Consequence:** Order stalls, seller waiting
   - **User Impact:** No reminders, no escalation
   - **Seller Impact:** Seller sees "Waiting for buyer" but no way to contact

---

## 7. UX Principles Currently Being Violated

### Clarity

**Violations:**
1. **Status labels ambiguous** - "Fulfillment in progress" doesn't clearly indicate seller hasn't started
2. **Transport option not prominent** - Users may not remember which workflow applies
3. **SLA deadlines hidden** - Only admins see countdown, users don't know urgency
4. **Action ownership unclear** - "Waiting on seller" vs "Waiting on buyer" not always obvious
5. **Payment status confusing** - "Seller paid immediately" message may confuse users about transaction state

### Feedback

**Violations:**
1. **No confirmation when seller schedules delivery** - Buyer doesn't know delivery is scheduled
2. **No confirmation when buyer selects pickup window** - Seller doesn't know buyer scheduled
3. **No notification when buyer confirms receipt** - Seller must manually check
4. **No notification when buyer confirms pickup** - Seller must manually check
5. **Silent status changes** - Many status transitions happen without user notification

### Urgency

**Violations:**
1. **No countdown timers** - Users don't see approaching deadlines
2. **No warning indicators** - No visual cues for overdue or approaching deadlines
3. **No escalation** - System doesn't increase urgency as deadlines approach
4. **No consequences visible** - Users don't see what happens if they don't act

### Ownership

**Violations:**
1. **Action responsibility unclear** - "Waiting on seller" vs "Waiting on buyer" not always prominent
2. **No clear next step** - Users may not know what to do next
3. **No progress indicators** - Users don't see how far along the order is
4. **No milestone visibility** - Users don't see which steps are complete vs pending

### Persistence

**Violations:**
1. **No reminders** - System doesn't remind users of pending actions
2. **No escalation** - System doesn't increase frequency of reminders
3. **No timeout handling** - Orders can stall indefinitely
4. **No automatic completion** - Even obvious completions require manual action

### Communication

**Violations:**
1. **Missing notifications** - Many status changes don't trigger notifications
2. **No cross-party visibility** - Buyers don't see seller actions, sellers don't see buyer actions
3. **No status explanations** - Users may not understand what each status means
4. **No help text** - Limited contextual help for complex workflows

---

## 8. Key Insights to Carry Into Redesign

### Insight 1: Status Visibility Gap

**Observation:** Users don't see the same status information that admins see. SLA deadlines, countdown timers, and urgency indicators are admin-only.

**Implication:** Users operate without understanding urgency or consequences. Orders stall because users don't know they need to act.

**Carry Forward:** All roles should see relevant urgency indicators. Sellers should see SLA countdown. Buyers should see when seller actions are overdue.

### Insight 2: Notification Gaps

**Observation:** Many status transitions don't trigger notifications. Buyers don't know when sellers schedule delivery. Sellers don't know when buyers take action.

**Implication:** Users must manually check order status. No proactive communication keeps parties informed.

**Carry Forward:** Every status change that affects another party should trigger a notification. Cross-party visibility is essential.

### Insight 3: Transport Workflow Divergence

**Observation:** SELLER_TRANSPORT and BUYER_TRANSPORT have completely different workflows, but the UI doesn't always make this clear.

**Implication:** Users may be confused about which workflow applies. Actions may be hidden or shown incorrectly.

**Carry Forward:** Transport option should be prominently displayed. Workflow steps should be clearly transport-aware. UI should adapt completely based on transport type.

### Insight 4: Silent Waiting Periods

**Observation:** Orders can stall at multiple points with no reminders or escalation. System waits indefinitely for user action.

**Implication:** Orders get stuck. Users forget. No automatic recovery.

**Carry Forward:** Implement reminder system. Escalate urgency as deadlines approach. Consider automatic timeouts for obvious completions.

### Insight 5: Payment Model Confusion

**Observation:** "Seller paid immediately" message appears, but users may not understand what this means for the transaction flow.

**Implication:** Users may think transaction is complete when it's not. Confusion about escrow vs immediate payment.

**Carry Forward:** Clarify payment model. Make it clear that payment is separate from fulfillment completion. Emphasize that buyer confirmation is still required.

### Insight 6: Admin Intervention Limitations

**Observation:** Admins can see problems but have limited tools to fix them. Must manually contact users. No automated escalation.

**Implication:** Admin workload is high. Problems persist until manual intervention.

**Carry Forward:** Provide admin tools for automated reminders. Allow admins to send templated messages. Consider automated escalation workflows.

### Insight 7: Milestone Visibility

**Observation:** Admin sees milestone checklist, but buyers and sellers don't. Users don't see progress through fulfillment steps.

**Implication:** Users don't understand where they are in the process. May not know what comes next.

**Carry Forward:** Show milestone progress to all roles. Make it clear which steps are complete and which are pending. Show next action prominently.

### Insight 8: Action Affordances

**Observation:** Required actions are sometimes hidden in detail pages. Users may not know they need to act.

**Implication:** Users miss required actions. Orders stall unnecessarily.

**Carry Forward:** Make required actions prominent. Show them in list views, not just detail pages. Use visual indicators (badges, banners) to draw attention.

### Insight 9: Cross-Party Communication Gap

**Observation:** Buyers and sellers operate in separate views. No direct communication channel visible in order context.

**Implication:** Misunderstandings persist. No way to coordinate without leaving the order page.

**Carry Forward:** Provide in-context communication. Show what the other party sees. Enable quick messages or status updates.

### Insight 10: Completion Ambiguity

**Observation:** Transaction completion requires buyer confirmation, but this isn't always clear. Seller may think marking delivered completes the order.

**Implication:** Sellers may be confused about why transaction isn't complete. Buyers may not understand they need to confirm.

**Carry Forward:** Make completion requirements explicit. Show what's needed to complete. Provide clear completion indicators.

---

## Appendix: Technical Implementation Notes

### Status Derivation

- **Primary:** `order.transactionStatus` (new orders)
- **Fallback:** Derived from `order.status` (legacy orders)
- **Function:** `getEffectiveTransactionStatus(order)` in `lib/orders/status.ts`

### Notification System

- **Events:** Canonical events in `lib/notifications/types.ts`
- **Processing:** `lib/notifications/processEvent.ts` creates in-app + email jobs
- **Dispatch:** `lib/email/dispatchEmailJobNow.ts` for immediate emails
- **Scheduled:** Netlify functions process queued jobs

### SLA Calculation

- **Start:** `fulfillmentSlaStartedAt = paidAt` (when payment confirmed)
- **Deadline:** `fulfillmentSlaDeadlineAt = paidAt + 7 days` (configurable)
- **Calculation:** In `app/api/stripe/webhook/handlers.ts` (line 980-982)

### Transport Option

- **Source:** Inherited from listing at checkout
- **Storage:** `order.transportOption` ('SELLER_TRANSPORT' | 'BUYER_TRANSPORT')
- **Default:** 'SELLER_TRANSPORT' if not set

---

**End of Analysis**
