# Production Readiness Review

**Date:** January 2026  
**Purpose:** What needs work, improvement, or fixes before going live.

---

## 1. What’s Already Solid

| Area | Status | Notes |
|------|--------|--------|
| **Payments** | ✅ | Direct buyer→seller (Stripe Connect destination charges). No platform-held funds; `releasePayment()` deprecated. See `docs/PAYMENT_POLICY.md`. |
| **Webhooks** | ✅ | Signature verification, event idempotency (event ID + order checks), chargeback handlers (`charge.dispute.*`). |
| **Idempotency** | ✅ | Checkout session, webhook order creation, refunds, dispute resolve use keys or duplicate checks. |
| **Audit logging** | ✅ | `lib/audit/logger.ts`; admin actions (user status, risk, plan override, refunds, disputes, etc.) write to `auditLogs`. |
| **Rate limiting** | ✅ | Upstash Redis when `UPSTASH_REDIS_REST_*` set; sensitive routes fail closed (503) on Netlify if Redis missing. |
| **Sentry** | ✅ | `sentry.client.config.ts` / server / edge init when DSN set. Health page shows Sentry status. |
| **Auction winner** | ✅ | `netlify/functions/emitAuctionOutcomeEvents.ts` + email templates (`auction_winner`, etc.). |
| **Admin checks** | ✅ | Admin/super-admin enforced server-side on admin API routes. |
| **Firestore rules** | ✅ | Users, listings, orders, bids, messages, etc. enforced in `firestore.rules`. |
| **Error boundaries** | ✅ | `ProductionErrorBoundary` used in dashboard/seller layouts. |
| **Security** | ✅ | Message sanitization, contact masking until payment, Stripe webhook verification. |

---

## 2. What Needs Work, Improvement, or Fixes

### P0 – Before Launch

| Item | What to do |
|------|------------|
| **Obsolete health check** | **FIXED.** System Health now shows "autoReleaseProtected [RETIRED — informational only]" with a "Retired" badge; it is not treated as a live check and does not show FAIL. (Previously: The System Health page still had a check for “Scheduled job: autoReleaseProtected,” which was removed (Stripe escrow removal). It will always show FAIL or very stale. **Fix:** Remove or retire this check so the dashboard doesn’t show a permanent failure. |
| **Production env** | In Netlify, set and verify: Firebase (client + service account or `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`), Stripe (secret, publishable, webhook secret), Upstash Redis (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`), Sentry (`SENTRY_DSN` and optionally `NEXT_PUBLIC_SENTRY_DSN`), email (Brevo or Resend). Use **live** Stripe keys and webhook URL in production. |
| **Stripe webhook** | In Stripe Dashboard, ensure the production webhook endpoint points to your live URL and includes all events you handle (e.g. `checkout.session.completed`, `charge.dispute.*`, etc.). |
| **Security checklist** | Run through `SECURITY_AUDIT_CHECKLIST.md` and tick off each item (auth, API, Firestore, payments, secrets). |

### P1 – Soon After Launch

| Item | What to do |
|------|------------|
| **Firestore indexes** | Confirm all admin/list queries have composite indexes in `firestore.indexes.json` and run `firebase deploy --only firestore:indexes`. Health page “Index” checks will FAIL if indexes are missing. |
| **Stripe reconciliation** | Use Admin → Reconciliation regularly to compare Stripe charges/transfers with Firestore orders and fix any mismatches. |
| **Email provider** | If using SendGrid, set `SENDGRID_API_KEY` and `EMAIL_*` in production. If using Brevo for transactional, set `BREVO_API_KEY`. Health page shows “Email provider configured” when set. |
| **Legacy Sentry file** | `lib/monitoring/sentry.ts` has commented-out code; the app uses `sentry.*.config.ts`. Remove or align the legacy file to avoid confusion. |

### P2 – Hardening / Scale

| Item | What to do |
|------|------------|
| **Email verification** | Optionally require email verification before creating listings (currently not enforced). |
| **Profile completion** | Optionally require phone/address before first listing. |
| **Backups** | Document or automate Firestore exports (e.g. scheduled exports to GCS) for disaster recovery. |
| **Texas compliance** | If listing approval / breeder permits apply, ensure gating and docs are clear and audited. |

---

## 3. Pre-Launch Checklist

- [ ] All P0 items above done (health check, env, webhook, security checklist).
- [ ] Netlify env: Firebase, Stripe (live), Upstash, Sentry, email; no test keys in production.
- [ ] Stripe webhook URL is production URL; required events subscribed.
- [ ] Firestore indexes deployed; System Health “Index” checks OK.
- [ ] System Health page: Redis OK (or FAIL with clear action), Sentry OK, Stripe OK, no obsolete FAILs.
- [ ] Run through critical flows: sign-up, create listing, checkout (test mode if needed), order flow, admin actions, dispute resolution.
- [ ] Confirm audit trail: trigger an admin action and verify an entry in `auditLogs` (or via user dossier Audit trail).

---

## 4. References

- **Pre-launch (specific must-dos):** `docs/PRE_LAUNCH_CHECKLIST.md` — env vars, Stripe live webhook, Firestore indexes, Redis, verification steps.
- Payment model: `docs/PAYMENT_POLICY.md`
- Env vars: `env.example`, `ENV_COMPLETE_GUIDE.md`
- Security: `SECURITY_AUDIT_CHECKLIST.md`
- Deployment: `DEPLOYMENT_CHECKLIST.md`, `NETLIFY_DEPLOYMENT_GUIDE.md`
