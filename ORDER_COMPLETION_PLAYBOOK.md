# Order Completion Playbook — Wildlife Exchange

**For:** Support, ops, and anyone who needs to understand how orders get from payment to completion.  
**Read time:** ~5 minutes.

---

## 1. What happens after payment?

When a buyer pays (card or bank), we create an order and the **seller is paid immediately** (Stripe Connect). There is no “holding” or “releasing” funds. The rest of the flow is about **fulfillment** and **confirming that the buyer received the item**.

---

## 2. What buyers should do

1. **Right after checkout**  
   - They land on **Orders** (`/dashboard/orders`).  
   - They may see “Payment confirmed” or “Bank payment processing” while we confirm the order.  
   - The order shows up in the list; they can open it for details.

2. **Before delivery**  
   - If **seller delivers:** Buyer waits. They can see “Waiting on seller,” “Delivery scheduled,” “Out for delivery.”  
   - If **buyer picks up:** Buyer must **select a pickup window** and then **confirm pickup** with the code the seller gave them.

3. **When the item arrives (seller delivery)**  
   - Buyer should **confirm receipt** on the order page (“Confirm Receipt” button).  
   - We may send a “delivery check-in” email with a link; that flow also leads to **confirm receipt** (not “mark delivered” — that’s the seller’s action).  
   - Confirming receipt **completes the order**.

4. **If something is wrong**  
   - They can **message the seller** (from the order or messages).  
   - If they need to escalate: **Report an issue** / **Open a dispute**. Admin reviews and resolves (release to seller, full refund, or partial refund).

**Bottom line for buyers:** Pay → wait for delivery or do pickup steps → **confirm receipt** when you have the item → done. If there’s a problem, message the seller or report an issue.

---

## 3. What sellers should do

1. **When an order is paid**  
   - They see it under **Seller → Orders** (or Sales).  
   - **Seller is already paid.** Their job is to fulfill.

2. **Fulfillment**  
   - **If they deliver:**  
     - **Schedule delivery** (date, transporter, etc.).  
     - When it’s on the way → **Mark out for delivery**.  
     - When it arrives → **Mark delivered**.  
   - **If buyer picks up:**  
     - **Set pickup info** (location, time windows, pickup code).  
     - Buyer picks a window and confirms pickup with the code.

3. **After “Mark delivered” (seller delivery)**  
   - Order moves to “Delivered — pending confirmation.”  
   - **Buyer** must **confirm receipt** to complete.  
   - Seller just waits; we may remind the buyer.

4. **Deadlines**  
   - Sellers have an **SLA** to start fulfillment (e.g. schedule delivery or set pickup info).  
   - We send reminders. If they’re late, the order can show as **overdue** in admin.

**Bottom line for sellers:** Get paid at checkout → **schedule delivery** or **set pickup info** → **mark out for delivery** / **mark delivered** as appropriate → wait for buyer to **confirm receipt**.

---

## 4. When admins step in

Admins use **Admin → Ops** (and **Payouts** for some actions).

**Stuck or at-risk orders**

- **Overdue:** Past SLA; seller hasn’t started or finished fulfillment.  
- **Needs action:** Fulfillment in progress; someone (usually seller or buyer) must do the next step.  
- **At risk:** SLA soon or order stalled for a long time.

**What admins can do**

- **Remind buyer** or **Remind seller** — nudge emails. Use when the next step is clear but the user hasn’t acted.  
- **Confirm delivery** — admin confirms on behalf of the buyer (e.g. we have proof of delivery). Use when the buyer won’t confirm but we’re satisfied. **Lives under Payouts today;** we want it in Ops too.  
- **Refund** — full or partial. Override; use when we’ve decided to refund.  
- **Resolve dispute** — release to seller, full refund, or partial refund. Override.  
- **Hold / Unhold** — block or unblock fulfillment-level actions. Override.  
- **Export dispute packet** — for dispute review.

**Disputes**

- Buyer **reports an issue** / **opens a dispute**.  
- Admin reviews (dispute packet, evidence, messages).  
- Admin **resolves**: release (seller keeps funds), full refund, or partial refund.  
- All of that is logged for audit.

**Bottom line for admins:** Use **Remind** to nudge. Use **Confirm delivery**, **Refund**, **Resolve**, **Hold/Unhold** when you need to **override** or **fix** something. Prefer nudges first when it’s safe.

---

## 5. Quick reference

| Step | Who | Action |
|------|-----|--------|
| Pay | Buyer | Checkout (card/bank). |
| Fulfill | Seller | Schedule delivery **or** set pickup info → mark out for delivery → mark delivered (if seller delivery). |
| Receive | Buyer | Confirm receipt **or** confirm pickup (with code). |
| Complete | System | Order moves to **Completed**. |
| Problem? | Buyer | Message seller **or** report an issue / open dispute. |
| Escalate | Admin | Remind, confirm delivery, refund, resolve dispute, hold/unhold. |

---

## 6. Where to look in the app

- **Buyer:** **Dashboard → Orders** → order detail. CTAs and “Order progress” show what’s next.  
- **Seller:** **Seller → Orders** → order detail. Fulfillment panel shows Schedule delivery / Set pickup info / Mark delivered, etc.  
- **Admin:** **Admin → Ops**. Lanes: **Overdue**, **Needs action**, **Disputes**, **Completed**. Open an order to Remind, Refund, Resolve, etc. **Confirm delivery** is under **Payouts** today.

---

*End of playbook.*
