# Admin Panel Launch Readiness — Implementation Checklist

**Completed:** 2026-02-02

---

## 1) Checklist of Code Changes Completed

### Health Tab Upgrades
- [x] **A) Recent Audit Activity section**
  - New `GET /api/admin/audit-logs` route (limit 20, orderBy createdAt desc)
  - Health page: Collapsible "Recent Audit Activity" card with table (actor, actionType, target, createdAt)
  - Links: order → Ops (`?orderId=`), user → dossier, listing → Approve Listings
- [x] **B) Stripe Webhook Events section**
  - New `GET /api/admin/stripe-events` route (limit 50)
  - Webhook extended: writes `status: 'processed'`, `processedAt` on success; `status: 'failed'`, `errorMessage` on handler throw
  - Health page: Collapsible "Stripe Webhook Events" card with table (eventId, type, status, createdAt, errorMessage truncated)
- [x] **C) Critical Cron Jobs section**
  - Added opsHealth writes to: `finalizeAuctions`, `expireListings`, `expireOffers`, `checkFulfillmentReminders`, `clearExpiredPurchaseReservations`
  - Health API: reads new opsHealth docs and adds checks for each (lastRunAt, status, staleness)
  - Health page: New cron checks appear under existing "Checks" → jobs category

### Ops Order Detail Upgrades
- [x] **A) Audit Trail section**
  - New `GET /api/admin/orders/[orderId]/audit` route
  - Uses `getAuditLogsForOrder` (existing helper)
  - Ops order detail: "Audit Trail" section with timeline list (actor, actionType, createdAt, collapsible before/after JSON)
- [x] **B) Delivery Proof section**
  - Ops order detail: "Delivery Proof" section when `order.delivery.signatureUrl` or `order.delivery.deliveryPhotoUrl` or `order.deliveryProofUrls` exist
  - Reuses `DeliveryProofTimelineBlock` component

---

## 2) Files Changed / Created

### New Files
| File | Purpose |
|------|---------|
| `app/api/admin/audit-logs/route.ts` | GET audit logs (latest 20) |
| `app/api/admin/stripe-events/route.ts` | GET stripe webhook events (latest 50) |
| `app/api/admin/orders/[orderId]/audit/route.ts` | GET audit logs for an order |

### Modified Files
| File | Change |
|------|--------|
| `app/api/stripe/webhook/route.ts` | Writes `status`, `processedAt` on success; `status: 'failed'`, `errorMessage` on handler throw |
| `app/api/admin/health/route.ts` | Reads opsHealth docs for 5 new cron jobs; adds checks for each |
| `app/dashboard/admin/health/page.tsx` | Adds Recent Audit Activity + Stripe Webhook Events collapsible sections; fetches from new APIs |
| `app/dashboard/admin/ops/OpsClient.tsx` | Adds Audit Trail + Delivery Proof sections in order detail dialog; fetches order audit on open |
| `netlify/functions/finalizeAuctions.ts` | Writes opsHealth/finalizeAuctions on run (success/error) |
| `netlify/functions/expireListings.ts` | Writes opsHealth/expireListings on run |
| `netlify/functions/expireOffers.ts` | Writes opsHealth/expireOffers on run |
| `netlify/functions/checkFulfillmentReminders.ts` | Writes opsHealth/checkFulfillmentReminders on run |
| `netlify/functions/clearExpiredPurchaseReservations.ts` | Writes opsHealth/clearExpiredPurchaseReservations on run |

---

## 3) Smoke Test Steps for Launch

### Pre-deploy (local or staging)

1. **Health → Recent Audit Activity**
   - Log in as admin.
   - Go to Dashboard → Admin → System Health.
   - Expand "Recent Audit Activity".
   - Confirm table loads (or "No audit logs yet" if empty).
   - Trigger an admin action (e.g. hold an order). Refresh Health. Confirm new entry appears.

2. **Health → Stripe Webhook Events**
   - Expand "Stripe Webhook Events".
   - Confirm table loads (or "No Stripe events yet" if empty).
   - In Stripe Dashboard (test mode), send a test event to webhook. Refresh Health. Confirm event appears with status "processed".

3. **Health → Critical Cron Jobs**
   - Scroll to "Checks" → "Scheduled jobs".
   - Confirm checks for: finalizeAuctions, expireListings, expireOffers, checkFulfillmentReminders, clearExpiredPurchaseReservations.
   - After Netlify cron runs (or manual trigger), confirm lastRunAt and status update.

4. **Ops → Order Detail → Audit Trail**
   - Go to Admin Ops.
   - Open any order detail.
   - Confirm "Audit Trail" section shows (or "No admin/system audit entries yet").
   - If order has admin actions (hold, refund, etc.), confirm entries appear.

5. **Ops → Order Detail → Delivery Proof**
   - Open an order that has delivery proof (signature/photo from QR flow).
   - Confirm "Delivery Proof" section shows signature and/or photo links.
   - Open an order without delivery proof. Confirm section is hidden.

### Post-deploy verification

- Repeat above in production with admin account.
- Confirm Firestore `opsHealth` docs are written by crons.
- Confirm `stripeEvents` docs have `status` and `processedAt` for new events.

---

## 4) Follow-up Items Intentionally Deferred

| Item | Reason |
|------|--------|
| **Audit log filters** (actionType, date range) | MVP uses latest 20 only. Filters would need new Firestore indexes. |
| **Stripe webhook retry button** | Requires fetching event from Stripe API and re-running handler; higher complexity. |
| **orderId in stripeEvents** | Webhook handler would need to return orderId from handler; current flow doesn't easily pass it. |
| **Firestore index for auditLogs `createdAt` desc** | Single-field orderBy may work without explicit index. Add only if Firestore returns failed-precondition. |
| **Collapsible chevron rotation** | Health page Collapsible chevron doesn't rotate on expand/collapse; cosmetic only. |
| — | Ops supports `?orderId=X`: when order is in loaded set, auto-opens detail dialog. |
