# Admin Panel Gap Audit

**Generated:** 2026-02-02  
**Scope:** Compare Admin UI vs Actual App Behavior (Repo-Wide)  
**Evidence:** Code paths, API routes, Firestore schema, Netlify functions, webhooks

---

## 1. Admin Panel Inventory (What Exists Today)

### 1.1 Routes & Pages

| Route | File | Purpose | Data Touched |
|-------|------|---------|--------------|
| `/dashboard/admin/users` | `app/dashboard/admin/users/page.tsx` | User directory: search, role management, disable/suspend, force logout | users, userSummaries, adminUserNotes |
| `/dashboard/admin/users/[uid]` | `app/dashboard/admin/users/[uid]/page.tsx` | User dossier (profile, notes, audit trail by targetUserId) | users, userSummaries, adminUserNotes, auditLogs |
| `/dashboard/admin/listings` | `app/dashboard/admin/listings/page.tsx` | Approve/reject listings (pending, compliance) | listings |
| `/dashboard/admin/messages` | `app/dashboard/admin/messages/page.tsx` | Flagged messages moderation | messageThreads, messages |
| `/dashboard/admin/health` | `app/dashboard/admin/health/page.tsx` | System health: Firebase, Stripe, Redis, opsHealth, webhook last run | opsHealth (Firestore), config probes |
| `/dashboard/admin/ops` | `app/dashboard/admin/ops/OpsClient.tsx` | Order ops: lanes (overdue, needs_action, disputes, completed), refund, dispute resolve, admin hold, mark paid | orders, listings |
| `/dashboard/admin/compliance` | `app/dashboard/admin/compliance/ComplianceClient.tsx` | Breeder permits, payout holds, compliance approvals | breederPermits, orders, listings |
| `/dashboard/admin/reconciliation` | `app/dashboard/admin/reconciliation/page.tsx` | Stripe ↔ Firestore reconciliation | orders, Stripe API |
| `/dashboard/admin/revenue` | `app/dashboard/admin/revenue/page.tsx` | Revenue aggregates, refunds, chargebacks | aggregateRevenue, orders |
| `/dashboard/admin/support` | `app/dashboard/admin/support/page.tsx` | Support tickets inbox, reply, status, AI draft | supportTickets |
| `/dashboard/admin/email-templates` | `app/dashboard/admin/email-templates/page.tsx` | Email template render preview | — |
| `/dashboard/admin/notifications` | `app/dashboard/admin/notifications/page.tsx` | Notification events, jobs, deadletters, emit | notificationEvents, jobs, deadletters |
| `/dashboard/admin/payouts` | `app/dashboard/admin/payouts/page.tsx` | Payout overview (admin Stripe balance view) | Stripe API |
| `/dashboard/admin/protected-transactions` | `app/dashboard/admin/protected-transactions/page.tsx` | Protected orders list | orders |
| `/dashboard/admin/compliance-holds` | `app/dashboard/admin/compliance-holds/page.tsx` | Compliance hold management | orders |
| `/dashboard/admin/knowledge-base` | `app/dashboard/admin/knowledge-base/page.tsx` | KB management | knowledgeBase |

### 1.2 Route Guards & Permissions

- **Admin check:** `useAdmin()` from `contexts/AdminContext.tsx` — reads Firebase Auth custom claims `role` (`admin` | `super_admin`) or Firestore `users/{uid}.role`, `users/{uid}.superAdmin`
- **API guard:** `requireAdmin()` in `app/api/admin/_util.ts` — verifies Bearer token, checks claims or Firestore
- **Super-admin:** `requireSuperAdmin()` for notifications, some ops
- **Firestore rules:** `isAdmin()` helper checks token claims and user doc role

### 1.3 Admin API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET/POST /api/admin/orders` | List admin orders (filter: escrow, protected, disputes, ready_to_release) |
| `POST /api/orders/[orderId]/admin-hold` | Set/remove admin hold |
| `POST /api/admin/orders/[orderId]/mark-paid` | Mark order paid (fallback) |
| `POST /api/admin/orders/[orderId]/send-reminder` | Send order reminder |
| `POST /api/admin/orders/[orderId]/compliance-transfer/remind` | Remind compliance transfer |
| `POST /api/admin/orders/[orderId]/payout-approval` | Approve payout (compliance) |
| `POST /api/admin/orders/[orderId]/documents/verify` | Verify order document |
| `POST /api/admin/orders/[orderId]/payout-debug` | Payout debug |
| `POST /api/stripe/refunds/process` | Process refund (admin) |
| `POST /api/orders/[orderId]/disputes/resolve` | Resolve dispute (admin) |
| `GET /api/admin/reconcile` | Run reconciliation |
| `GET /api/admin/revenue` | Revenue aggregates |
| `GET /api/admin/health` | Health checks |
| `GET /api/admin/users/directory` | User directory |
| `GET /api/admin/users/lookup` | User lookup |
| `GET /api/admin/users/[userId]/dossier` | User dossier (auth, profile, notes, auditLogs by targetUserId) |
| `POST /api/admin/users/[userId]/set-role` | Set role |
| `POST /api/admin/users/[userId]/set-disabled` | Disable user |
| `POST /api/admin/users/[userId]/set-status` | Set status (suspended, banned, etc.) |
| `POST /api/admin/users/[userId]/set-risk` | Set risk level |
| `POST /api/admin/users/[userId]/set-selling-disabled` | Disable selling |
| `POST /api/admin/users/[userId]/set-messaging-muted` | Mute messaging |
| `POST /api/admin/users/[userId]/force-logout` | Force logout |
| `POST /api/admin/users/[userId]/notes/add` | Add admin note |
| `POST /api/admin/users/[userId]/password-reset-link` | Send password reset |
| `POST /api/admin/users/[userId]/send-verification-email` | Resend verification |
| `POST /api/admin/users/[userId]/plan-override` | Plan override |
| `POST /api/admin/sellers/[sellerId]/freeze` | Freeze seller |
| `POST /api/admin/compliance/listings/[id]/approve` | Compliance approve listing |
| `POST /api/admin/compliance/listings/[id]/reject` | Compliance reject listing |
| `POST /api/admin/listings/[id]/approve` | Approve listing |
| `POST /api/admin/listings/[id]/reject` | Reject listing |
| `POST /api/admin/listings/[id]/documents/verify` | Verify listing document |
| `GET /api/admin/breeder-permits` | Breeder permits |
| `POST /api/admin/breeder-permits/[sellerId]/review` | Review breeder permit |
| `GET /api/admin/support/tickets` | List support tickets |
| `GET /api/admin/support/tickets/[ticketId]` | Ticket detail |
| `POST /api/admin/support/tickets/[ticketId]/reply` | Reply to ticket |
| `POST /api/admin/support/tickets/[ticketId]/status` | Update status |
| `GET /api/admin/notifications/events` | Notification events |
| `GET /api/admin/notifications/jobs` | Jobs |
| `GET /api/admin/notifications/deadletters` | Dead letters |
| `POST /api/admin/notifications/emit` | Emit test event |
| `POST /api/admin/notifications/run` | Run notification processor |
| `POST /api/admin/reminders/run` | Run reminders |
| `POST /api/admin/orders/cancel-abandoned-checkouts` | Cancel abandoned checkouts |

---

## 2. System Behavior Map (What the App Does)

### 2.1 User Flows

| Flow | Trigger | Data Written | Admin Visibility |
|------|---------|--------------|------------------|
| Onboarding/auth | Sign up, sign in, verify email | users, Firebase Auth | Users page, dossier |
| Listing create/edit | Seller UI | listings | Approve Listings |
| Listing publish | Seller UI → pending | listings.status=pending | Approve Listings |
| Compliance review | Admin approve/reject | listings.status, complianceStatus | Compliance, Approve Listings |
| Auction bid | Buyer UI | bids, listings (currentBid) | — |
| Offer create/counter/accept | Buyer/seller UI | offers | — |
| Checkout | Stripe Checkout | orders (stub) → webhook | Ops, Reconciliation |

### 2.2 Financial Flows

| Flow | Trigger | Data Written | Admin Visibility |
|------|---------|--------------|------------------|
| Payment | Stripe webhook `checkout.session.completed` | orders (paid, stripeChargeId, etc.) | Ops, Revenue, Reconciliation |
| TX-only refund | Webhook (TX violation) | orders.status=refunded, auditLogs | Ops, Revenue |
| Admin refund | `/api/stripe/refunds/process` | orders, Stripe refund, auditLogs | Ops, Revenue |
| Dispute resolve | Admin resolve | orders, Stripe refund, auditLogs | Ops |
| Chargeback | Stripe webhook `charge.dispute.created` | orders.adminHold=true | Ops (admin hold) |
| Payout | Stripe Connect destination charges (automatic) | — | Payouts page, Revenue |

**Note:** Sellers are paid immediately via Stripe Connect destination charges. No manual payout release.

### 2.3 Delivery & Fulfillment

| Flow | Trigger | Data Written | Admin Visibility |
|------|---------|--------------|------------------|
| Set delivery address | Buyer UI | orders.deliveryAddress | Ops (order detail) |
| Schedule delivery | Seller UI | orders.fulfillment | Ops |
| Mark out for delivery | Seller/driver | orders.status=in_transit | Ops |
| Complete delivery | Driver (PIN, photo, signature) | orders.status=delivered/ready_to_release | Ops |
| Confirm receipt | Buyer | orders.status=buyer_confirmed | Ops |
| Delivery tokens | `create-session`, `verify-token`, `verify-pin` | — | **NONE** (no admin view) |

### 2.4 Disputes & Claims

| Flow | Trigger | Data Written | Admin Visibility |
|------|---------|--------------|------------------|
| Open dispute | Buyer UI | orders.disputeStatus=open | Ops (Disputes lane) |
| Submit evidence | Buyer/seller | orders subcollection or metadata | Ops |
| Resolve dispute | Admin | orders, Stripe refund, auditLogs | Ops |

### 2.5 Automation (Netlify Scheduled Functions)

| Function | File | Purpose | Admin Visibility |
|----------|------|---------|------------------|
| `finalizeAuctions` | `netlify/functions/finalizeAuctions.ts` | Close ended auctions, set listing expired | Health (opsHealth) — **PARTIAL** |
| `expireListings` | `netlify/functions/expireListings.ts` | Expire listings | **NONE** |
| `expireOffers` | `netlify/functions/expireOffers.ts` | Expire offers | **NONE** |
| `expireUnpaidAuctions` | — | Expire unpaid won auctions | **NONE** |
| `emitAuctionOutcomeEvents` | — | Auction outcome events | **NONE** |
| `checkFulfillmentReminders` | `netlify/functions/checkFulfillmentReminders.ts` | Fulfillment SLA reminders | **NONE** |
| `checkFulfillmentSla` | — | Fulfillment SLA checks | **NONE** |
| `processNotificationEvents` | — | Process notification queue | Notifications page |
| `dispatchEmailJobs` | — | Dispatch email jobs | Notifications |
| `dispatchPushJobs` | — | Dispatch push jobs | Notifications |
| `savedSearchInstant` | — | Saved search alerts | **NONE** |
| `savedSearchWeeklyDigest` | — | Weekly digest | **NONE** |
| `aggregateRevenue` | — | Revenue aggregation | Health (opsHealth) |
| `orderDeliveryCheckIn` | — | Delivery check-in | **NONE** |
| `clearExpiredPurchaseReservations` | — | Clear reservations | **NONE** |

### 2.6 Integrations

| Integration | Usage | Admin Visibility |
|-------------|-------|------------------|
| Stripe | Checkout, webhooks, refunds, Connect | Health, Revenue, Reconciliation, Payouts |
| Stripe Webhooks | `checkout.session.completed`, `charge.dispute.*`, etc. | Health (lastWebhookAt) — **NO log viewer** |
| Email (Brevo/Resend) | Order emails, verification | Email Templates, Notifications (jobs) |
| Firebase Auth | Auth, custom claims | Users |
| Firestore | Primary data store | Various |
| Delivery tokens | Session-based delivery flow | **NONE** |
| Storage | Listing images, documents | — |

---

## 3. Admin Needs Matrix

| Need Category | Exists | Missing |
|---------------|--------|---------|
| **Users & Access** | User directory, dossier, role/status/risk, force logout, notes, plan override | Session/device history, ban reason codes, KYC status |
| **Listings** | Approve, reject, document verify | Edit/disable listing, flag content, bulk actions, listing audit timeline |
| **Orders/Transactions** | Ops lanes, refund, dispute resolve, admin hold, mark paid | Full order audit timeline in UI, retry failed ops, cancel order |
| **Delivery & Proof** | Order detail shows fulfillment | Map/tracking status, delivery proof viewer (signature/photo), resend driver links, revoke tokens |
| **Disputes** | Resolve (release/refund/partial), evidence | Evidence review UI, internal notes, export evidence |
| **Payments & Risk** | Revenue, reconciliation, refunds | Webhook event log viewer, chargebacks feed, failed payout handling, ledger view |
| **Communications** | Email templates, notification events/jobs/deadletters, emit | Email/SMS logs by user, resend specific email, rate limit viewer |
| **System Health** | Health page, opsHealth (webhook, aggregateRevenue) | Cron run history per function, retries, dead-letter viewer for non-notification jobs, audit log viewer |

---

## 4. Gap List (Prioritized)

### P0 — Must Have for Production

| Gap | Severity | Evidence | Risk | Proposed Admin UI | Backend |
|-----|----------|----------|------|-------------------|---------|
| **Audit Log Viewer** | P0 | `auditLogs` exists, used in dossier by targetUserId only | No global view of who did what; compliance/incident response blind | New page: Admin → Audit Logs. Table: actor, actionType, orderId/listingId/targetUserId, createdAt. Filters. Link to order/listing/user | Use existing `auditLogs`; add index `createdAt` desc; optional `actorUid` |
| **Stripe Webhook Event Log** | P0 | `app/api/stripe/webhook`; Health shows lastWebhookAt only | Cannot debug payment/refund failures; no idempotency visibility | New page: Admin → Webhooks. Table: eventId, type, orderId, status, createdAt. Filters. Retry action (with guardrails) | Persist webhook events to `stripeEvents` (or new collection); already referenced in firestore.rules |
| **Order Audit Trail (admin actions) in Ops** | P0 | `getAuditLogsForOrder` exists; Ops shows TransactionTimeline (order.timeline) but not auditLogs | Admins cannot see admin/system actions (refunds, holds, dispute resolutions) on order | Ops order detail: add "Audit trail" section showing `auditLogs` by orderId | Existing `getAuditLogsForOrder`; add `/api/admin/orders/[orderId]/audit` or reuse dossier pattern |

### P1 — High Priority

| Gap | Severity | Evidence | Risk | Proposed Admin UI | Backend |
|-----|----------|----------|------|-------------------|---------|
| **Cron Run History** | P1 | Netlify functions run on schedule; no persistence | Cannot verify cron executed; no retry visibility | Health page: expand to show last run per function (scanned, errors). Link to run log if stored | Write `systemRuns` or `cronRuns` on each function start/end |
| **Delivery Proof Viewer** | P1 | `complete-delivery`, `submit-signature` write proof | Cannot review delivery evidence in disputes | Ops order detail: "Delivery proof" section with signature image, photos | Read from order subcollection or storage; add API |
| **Chargebacks Feed** | P1 | Webhook sets adminHold; no list | Hard to triage chargebacks | New section in Ops or Revenue: "Chargebacks" — orders with adminHold due to dispute | Query orders where adminHold=true, adminHoldReason contains dispute |
| **Resend Order Email** | P1 | Emails sent via tryDispatchEmailJobNow | Support cannot resend receipts/confirmation | Ops order detail: "Resend email" dropdown (order_confirmation, receipt, etc.) | New API: `POST /api/admin/orders/[orderId]/resend-email` |
| **Listing Edit/Disable** | P1 | Listings have status | Cannot disable problematic listing without reject | Approve Listings or new Listings admin: "Disable" action | `PATCH /api/admin/listings/[id]` — set status=removed or disabled |

### P2 — Nice to Have

| Gap | Severity | Evidence | Risk | Proposed Admin UI | Backend |
|-----|----------|----------|------|-------------------|---------|
| **Impersonate View** | P2 | — | Support cannot see buyer/seller view | User dossier: "View as user" (read-only or limited session) | Requires careful implementation; optional |
| **Bulk Listing Actions** | P2 | Approve Listings is one-by-one | Slow for large batches | Approve Listings: checkbox multi-select, "Approve selected", "Reject selected" | Batch API |
| **Email Log by User** | P2 | Jobs in Notifications | Cannot see what emails a user received | User dossier or new "Communications" tab | Query notification jobs by userId |
| **Delivery Token Revoke** | P2 | Tokens in create-session | Cannot revoke compromised link | Ops order: "Revoke delivery link" | Invalidate token in DB or short TTL |

---

## 5. Recommended Admin IA (Navigation Structure)

```
Admin (collapsible section)
├── Operations
│   ├── Ops (order fulfillment)
│   ├── Approve Listings
│   ├── Compliance
│   └── Reconciliation
├── Users & Support
│   ├── Users
│   ├── Support
│   └── Flagged Messages
├── Payments & Revenue
│   ├── Revenue
│   ├── Payouts
│   ├── Protected Transactions
│   └── Reconciliation
├── System
│   ├── Health
│   ├── Audit Logs (NEW)
│   ├── Webhooks (NEW)
│   └── Notifications
└── Config
    ├── Email Templates
    └── Knowledge Base
```

---

## 6. Security & Permissions

### 6.1 Current Roles

- **user** — Default
- **admin** — Full admin access
- **super_admin** — Extra capabilities (e.g., admin notifications)

### 6.2 Recommendations

| Role | Scope | Notes |
|------|-------|-------|
| **Owner** | All | Same as super_admin; for business owner |
| **Admin** | Full ops, users, support, revenue | Current admin |
| **Support** | Users (read + notes), Support, Ops (read + send reminder, resend email) | Restricted: no refund, no role change, no approve listings |
| **Read-only** | All pages view-only | For auditors/analysts |

### 6.3 Least Privilege

- Implement `requireSupport` vs `requireAdmin` for support-only endpoints
- Add role checks in Firestore rules for `auditLogs` read (admin only)
- Ensure refund/dispute resolution require admin, not support

---

## 7. Logging & Audit

### 7.1 Existing `auditLogs` Schema

```
auditLogs/{auditId}
  auditId: string
  actorUid: string | 'system' | 'webhook'
  actorRole: AuditActorRole
  actionType: AuditActionType
  targetUserId?: string
  orderId?: string
  listingId?: string
  beforeState?: object
  afterState?: object
  metadata?: object
  source: AuditSource
  createdAt: Timestamp
```

**Indexes:** `orderId`+`createdAt`, `listingId`+`createdAt`, `actorUid`+`createdAt`, `targetUserId`+`createdAt`

### 7.2 createAuditLog Coverage

**Logged today:** order_created, order_status_changed, refund_full/partial, dispute_opened/resolved/cancelled, admin_hold_placed/removed, chargeback_*, delivery_confirmed, order_marked_paid_admin, admin_user_*, admin_listing_*, admin_support_reply, offer_*, bid_placed, compliance actions, breeder permit, etc.

**Gaps:** Some webhook paths may not log; cron runs not in auditLogs (by design — use systemRuns).

### 7.3 Proposed `systemRuns` Schema (Cron/Webhook)

```
systemRuns/{runId}
  runId: string
  type: 'cron' | 'webhook'
  name: string              // e.g. 'finalizeAuctions', 'stripe_webhook'
  startedAt: Timestamp
  finishedAt?: Timestamp
  status: 'running' | 'success' | 'partial' | 'error'
  scanned?: number
  processed?: number
  errors?: number
  errorMessage?: string
  metadata?: object         // e.g. eventId for webhook
  createdAt: Timestamp
```

### 7.4 Order Timeline vs Audit Logs

- **Order timeline** (`orders/{id}.timeline`): User-facing events (payment, delivery, confirmation). Written by `appendOrderTimelineEvent` in `lib/orders/timeline.ts`. Displayed in `TransactionTimeline` component.
- **Audit logs** (`auditLogs`): Admin/system actions (refunds, holds, dispute resolutions, role changes). Used for compliance and incident response. Not currently shown in Ops order detail.

### 7.5 Proposed `stripeWebhookEvents` (or extend stripeEvents)

```
stripeWebhookEvents/{eventId}   // or stripeEvents
  eventId: string
  type: string
  orderId?: string
  status: 'processed' | 'failed' | 'skipped'
  createdAt: Timestamp
  processedAt?: Timestamp
  errorMessage?: string
  metadata?: object
```

---

## 8. Minimum Viable Admin Panel for Production Launch

**Must have before launch:**
1. Audit Log Viewer (global)
2. Stripe Webhook Event Log
3. Order audit timeline in Ops detail
4. Cron run history (at least last run per function)

**Post-MVP:**
- Delivery proof viewer
- Chargebacks feed
- Resend order email
- Support role (restricted)
- Bulk listing actions

---

## 9. Acceptance Criteria (Gap Implementation)

### Audit Log Viewer
- [ ] Page at `/dashboard/admin/audit-logs`
- [ ] Table: actor, actionType, target (orderId/listingId/targetUserId), createdAt
- [ ] Filters: actionType, actorUid, date range
- [ ] Links to order, listing, user dossier
- [ ] Pagination

### Webhook Event Log
- [ ] Persist each Stripe webhook event to Firestore (or existing stripeEvents)
- [ ] Page at `/dashboard/admin/webhooks`
- [ ] Table: eventId, type, orderId, status, createdAt
- [ ] Filter by type, status
- [ ] Retry button (with confirmation) for failed events

### Order Audit in Ops
- [ ] Ops order detail: "Audit" section
- [ ] Fetch auditLogs where orderId=order.id
- [ ] Display timeline with actor, action, before/after

### Cron Run History
- [ ] Each Netlify function writes to `systemRuns` on start and completion
- [ ] Health page: "Cron Runs" section with last run per function
- [ ] Optional: dedicated Cron Runs page with history

---

## 10. File References

| Area | Key Files |
|------|-----------|
| Admin context | `contexts/AdminContext.tsx`, `hooks/use-admin.ts` |
| Admin API util | `app/api/admin/_util.ts` |
| Audit logger | `lib/audit/logger.ts` |
| Stripe webhook | `app/api/stripe/webhook/` (handlers.ts) |
| Order APIs | `app/api/orders/[orderId]/` |
| Refunds | `app/api/stripe/refunds/process/route.ts` |
| Disputes | `app/api/orders/[orderId]/disputes/resolve/route.ts` |
| Netlify functions | `netlify/functions/*.ts` |
| Firestore rules | `firestore.rules` |
| User dossier | `app/api/admin/users/[userId]/dossier/route.ts` |
