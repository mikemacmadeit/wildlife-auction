# Admin Tools Review â€” Running the Platform Securely

**Purpose:** Confirm admins have what they need to run the platform correctly and securely.  
**Scope:** All admin UI pages and API routes; access control and gaps.

---

## 1. What exists

### 1.1 Admin pages (sidebar)

| Page | Route | Purpose |
|------|--------|--------|
| Users | `/dashboard/admin/users` | User directory: search, filters, link to dossier |
| User dossier | `/dashboard/admin/users/[uid]` | Profile, notes, audit trail (by user), actions |
| Approve Listings | `/dashboard/admin/listings` | Pending listings: approve, reject, AI retry, revert |
| Flagged Messages | `/dashboard/admin/messages` | Message threads with flags; review/action |
| System Health | `/dashboard/admin/health` | Firestore, Redis, Stripe, Sentry, indexes; **Audit Log**; **Stripe webhook events**; cron visibility |
| Admin Ops | `/dashboard/admin/ops` | Orders: overdue, needs action, disputes, completed; order detail (refund, dispute resolve, admin hold, confirm delivery, freeze seller) |
| Compliance | `/dashboard/admin/compliance` | Breeder permits, payout holds, compliance-related orders |
| Reconciliation | `/dashboard/admin/reconciliation` | Stripe â†” Firestore reconciliation |
| Revenue | `/dashboard/admin/revenue` | Revenue aggregates, refunds, chargebacks |
| Support | `/dashboard/admin/support` | Support tickets: list, reply, status, AI draft |
| Email Templates | `/dashboard/admin/email-templates` | Preview email templates |
| Notifications | `/dashboard/admin/notifications` | Events, jobs, deadletters, emit (super_admin) |

**Also present (not in main nav or sub-pages):**  
`/dashboard/admin/protected-transactions`, `/dashboard/admin/compliance-holds`, `/dashboard/admin/payouts`, `/dashboard/admin/knowledge-base` â€” linked from Ops/Compliance/Health or internal navigation.

### 1.2 Admin API routes (by category)

**Access:** All use **Bearer token + server-side check**. Almost all use `requireAdmin()` from `app/api/admin/_util.ts` (token + role/superAdmin claim + Firestore `isAdminUid` fallback). One route uses **requireSuperAdmin**: `users/[userId]/set-role` (assign admin/super_admin).

**Users:** directory, lookup, dossier, notes/add, set-role (super_admin only), set-disabled, set-selling-disabled, set-messaging-muted, set-risk, plan-override, password-reset-link, send-verification-email, force-logout, summaries/backfill.

**Listings:** approve, reject, documents/verify, revert-to-pending, listing-moderation-config (GET/PATCH), try-ai-auto-approve.

**Orders:** list (getAdminOrders), audit, review-request, mark-paid, cancel-abandoned-checkouts, payout-debug, payout-approval, documents/verify, compliance-transfer/remind, send-reminder, protected.

**Disputes:** resolve (via Ops; refund/partial_refund/release), disputes/[orderId]/ai-summary.

**Refunds:** Process refund is `POST /api/stripe/refunds/process` (not under /admin) but called from Ops with auth; that route verifies Bearer token and caller is order participant or admin (needs quick check). *(Checked: refunds/process uses auth and allows admin.)*

**Support:** tickets (list), tickets/[ticketId] (get), reply, update, status, ai-draft.

**Compliance:** breeder-permits (list), breeder-permits/[sellerId]/review, compliance/listings/[listingId]/approve, compliance/listings/[listingId]/reject.

**Health / ops:** health, audit-logs, stripe-events.

**Revenue / Stripe:** revenue, stripe/balance, reconcile.

**Notifications:** run, deadletters, jobs, emit, events (some super_admin only in UI).

**Knowledge base:** CRUD (route.ts, [slug]/route.ts).

**Email:** test-email, email/status, email-templates/render.

**Sellers:** sellers/[sellerId]/freeze (admin hold / disable selling).

**Reminders:** reminders/run, orders/[orderId]/send-reminder â€” use inline `verifyIdToken` + `isAdminUid` (same effective check as requireAdmin, but not the shared helper).

---

## 2. Security

### 2.1 API protection

- **requireAdmin:** Token required; then role from token (admin/super_admin) or Firestore `users/{uid}.role`. Blocks non-admins with 403.
- **requireSuperAdmin:** Only for `set-role`. Ensures only super_admin can assign admin/super_admin.
- **Rate limiting:** Many admin routes use `requireRateLimit(RATE_LIMITS.admin)` before or after requireAdmin.
- **No unauthenticated admin routes:** Every admin API checked requires Bearer + admin check.

**Consistency:** A few routes (compliance-transfer/remind, send-reminder, reminders/run, try-ai-auto-approve) use their own `verifyIdToken` + `isAdminUid` instead of `requireAdmin()`. They are still protected; using `requireAdmin()` everywhere would simplify maintenance and keep rate limiting consistent.

### 2.2 UI protection

- Admin nav is shown only when `useAdmin()` reports `isAdmin === true` (or previously true, to avoid nav flicker).
- Each admin page checks `isAdmin` and either redirects or shows â€œAdmin requiredâ€ when not admin.
- There is no single admin layout that enforces redirect; each page does its own check. API remains the real enforcement.

### 2.3 Sensitive actions

- **Role assignment:** Only super_admin via `set-role`; required for safe platform operation.
- **Refunds / dispute resolve:** Admin-only via Ops; refund API allows admin.
- **User disable / selling disabled / force-logout:** Admin-only; audit trail (createAuditLog) used where applicable.
- **Freeze seller:** Admin-only; used from Ops.
- **Mark paid:** Admin-only; for async payments.
- **Confirm delivery:** Admin-only; for edge cases.

---

## 3. Gaps and recommendations

### 3.1 Covered well

- **Users:** Directory, dossier, notes, disable, selling disabled, messaging muted, risk flag, plan override, password reset, verification email, force logout. Role change restricted to super_admin.
- **Listings:** Approve, reject, document verification, revert to pending, moderation config, AI retry.
- **Orders:** List, filters (overdue, needs action, disputes), order detail, refund, dispute resolve, admin hold, confirm delivery, mark paid, cancel abandoned checkouts, audit trail (order-level), compliance reminders.
- **Support:** Tickets list, reply, status, AI draft.
- **Compliance:** Breeder permits list/review, listing approve/reject (compliance).
- **Health:** Connectivity, Stripe, Redis, Sentry, indexes, cron visibility, **global audit log**, **Stripe webhook events**.
- **Revenue / Stripe:** Revenue aggregates, refunds, Stripe balance, reconciliation.
- **Notifications:** Run, deadletters, jobs, emit, events (with super_admin where appropriate).
- **Knowledge base / email:** KB CRUD; email test and template preview.

### 3.2 Minor improvements

1. **Admin layout guard** â€” Add a layout under `app/dashboard/admin/layout.tsx` that redirects non-admins to `/dashboard` (or login). Keeps one place for â€œno accessâ€ and avoids relying only on per-page checks.
2. **Unify admin auth** â€” Migrate the few routes that use inline `verifyIdToken` + `isAdminUid` to `requireAdmin()` so all admin APIs behave the same and rate limiting is consistent.
3. **Ops order detail** â€” Audit trail and Delivery proof are both visible. Buyer/seller name and email are shown. Delivery address (order.delivery.buyerAddress) is in the order payload but not shown in the Ops UI; adding a Delivery address line when present would help with delivery support.
4. **Add note to order (UI gap)** â€” The API POST /api/orders/[orderId]/admin-notes exists and is admin-only, but there is no button in Ops to add a freeform admin note to an order. Admins can add notes when resolving a dispute and in the user dossier; they cannot add a general Order note from the Ops UI. Recommendation: Add an Add note control in the Ops order detail dialog that calls this API.


### 3.3 Optional (nice to have)

- **Global payout freeze / site-wide flags** â€” You have env flags (e.g. `GLOBAL_PAYOUT_FREEZE_ENABLED`, `GLOBAL_CHECKOUT_FREEZE_ENABLED`). If you want admins to toggle these without a deploy, a small â€œPlatform flagsâ€ section in Health (or Ops) could write to a Firestore doc that the app reads. Not required for secure operation if youâ€™re okay using env and deploy.
- **Stripe webhook retry** â€” Health shows Stripe events; no â€œretry failed eventâ€ button. Usually handled via Stripe Dashboard; optional.

---

## 4. Verdict

| Area | Status | Notes |
|------|--------|--------|
| **User management** | âœ… | Directory, dossier, notes, disable, selling disabled, force logout, plan override, password reset, verification email. Role change is super_admin only. |
| **Listings** | âœ… | Approve, reject, docs verify, revert, moderation config, AI retry. |
| **Orders & payments** | âœ… | List, detail, refund, dispute resolve, admin hold, confirm delivery, mark paid, cancel abandoned, audit trail. |
| **Support** | âœ… | Tickets, reply, status, AI draft. |
| **Compliance** | âœ… | Breeder permits, listing compliance approve/reject. |
| **Health & ops** | âœ… | Connectivity, Stripe, Redis, Sentry, indexes, crons, **audit log**, **Stripe events**. |
| **Revenue / Stripe** | âœ… | Revenue, refunds, balance, reconciliation. |
| **Security** | âœ… | All admin APIs require token + admin (or super_admin for set-role). No unauthenticated admin endpoints. |

**Conclusion:** You have the admin tools needed to run the platform correctly and securely: user management, listing moderation, order/refund/dispute handling, support, compliance, health and observability (including audit log and Stripe events), and revenue/Stripe operations. Security is in place (requireAdmin/requireSuperAdmin, rate limiting where used). Recommended improvements are minor: optional admin layout redirect and unifying the few inline admin checks to use `requireAdmin()`.
