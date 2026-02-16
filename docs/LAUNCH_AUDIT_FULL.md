# Full App Audit / Review — Before Launch

**Purpose:** Single consolidated list of what needs improvement, fixing, or upgrading before launch.  
**Scope:** Agchange/Wildlife Exchange marketplace (Next.js, Firebase, Stripe Connect, Netlify).  
**Audit-only:** No code changes in this doc; use as a checklist.

---

## 1. P0 — Must fix before launch

### 1.1 Environment & deployment

| Item | Detail | Reference |
|------|--------|-----------|
| **Production env** | Netlify production must have: Firebase (client + Admin via `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` or split vars), Stripe **live** keys + **live** webhook secret, Upstash Redis (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`), Sentry (optional but recommended), Email (Brevo or Resend). | `docs/PRE_LAUNCH_CHECKLIST.md` |
| **No test keys in prod** | No `sk_test_`, `pk_test_`, or test webhook secret in production env. | `docs/PRE_LAUNCH_CHECKLIST.md` §6 |
| **Stripe live webhook** | Create live webhook endpoint for production URL; subscribe all required events; set `STRIPE_WEBHOOK_SECRET` to live signing secret. | `docs/PRE_LAUNCH_CHECKLIST.md` §2 |
| **Site URL / domain** | If production domain ≠ agchange.com: set `NEXT_PUBLIC_SITE_URL` (and optionally `APP_URL`) so emails and links use correct domain. `getSiteUrl()` falls back to localhost then `https://agchange.app` in `lib/site-url.ts`. | `docs/PRE_LAUNCH_CODE_BASED.md` §4 |
| **Firestore indexes** | Deploy: `firebase deploy --only firestore:indexes`. System Health index checks fail if missing (messageThreads, supportTickets, orders). | `docs/PRE_LAUNCH_CHECKLIST.md` §4 |

### 1.2 System Health / ops

| Item | Detail | Reference |
|------|--------|-----------|
| **Obsolete health check** | **FIXED.** Title is "autoReleaseProtected [RETIRED — informational only]" with "Retired" badge; no FAIL. (Was: System Health still showed “Scheduled job: autoReleaseProtected (retired)”. It’s marked retired but can confuse; consider removing or clearly labeling so dashboard doesn’t imply a permanent failure. | `app/api/admin/health/route.ts`, `docs/PRODUCTION_READINESS_REVIEW.md` |

### 1.3 Security

| Item | Detail | Reference |
|------|--------|-----------|
| **Security checklist** | Run through `SECURITY_AUDIT_CHECKLIST.md` (auth, API, Firestore, Storage, payments, secrets) and tick off each item. | `SECURITY_AUDIT_CHECKLIST.md` |
| **Firestore rules** | Deploy production rules: `firebase deploy --only firestore:rules`. | `docs/PRE_LAUNCH_CHECKLIST.md` §8 |

---

## 2. P1 — Soon after launch (or before if time)

### 2.1 Code TODOs / placeholders

| File | Issue | Impact |
|------|--------|--------|
| `app/seller/overview/page.tsx` | **Addressed.** Response Time shows "Target: < 2 hours" (future: compute from message response times). | Display only. |
| `app/dashboard/account/page.tsx` | **Addressed.** Response Rate shows "—" when no data; future: compute from message response times. | Display only. |
| `components/orders/ComplianceTransferPanel.tsx` | **Done.** File upload implemented via `uploadComplianceDocument` (Firebase Storage); URL sent with confirm. | — |
| `lib/monitoring/reportError.ts` | **Done.** Wired to `captureException` / `captureMessage` (Sentry) for server and client. | — |

### 2.2 Audit trail granularity

| Item | Detail |
|------|--------|
| **Audit action types** | **Done.** Added `admin_reminder_sent`, `admin_reminders_run`, `compliance_reminder_sent`, `compliance_transfer_confirmed` to `AuditActionType`; send-reminder, reminders/run, compliance-transfer/remind, compliance-transfer/confirm use them. | `lib/audit/logger.ts`, routes above |

### 2.3 Hardcoded / fallback URLs

| Location | Issue |
|----------|--------|
| `lib/site-url.ts` | `getCanonicalSiteUrl()` fallback `https://agchange.app` when localhost. |
| `lib/brand.ts` | `SUPPORT_EMAIL` default `support@agchange.app`. |
| Various API routes | `NEXT_PUBLIC_SITE_URL || 'https://agchange.com'` in dispute, support ticket reply, support tickets route. Set env if domain differs. |

### 2.4 Testing & quality

| Item | Detail |
|------|--------|
| **Unit tests** | Present for: deriveOrderUIState, evaluateAutoApprove, billOfSale, horseRequirements, normalizeCategory, notifications, paymentGating, proxyBidding, soldListings, verifyCheckoutSession, wireInstructions. |
| **E2E** | `tests/e2e/auto-release.spec.ts`, `stripe-webhook.spec.ts` — confirm they match current payment model (direct buyer→seller; no escrow). |
| **ESLint in build** | `next.config.js`: `eslint.ignoreDuringBuilds: true`. Consider enabling for launch to catch lint issues. |

---

## 3. P2 — Hardening / UX / scale

### 3.1 Optional product/UX

| Item | Detail |
|------|--------|
| **Email verification** | Not required before creating listings; consider requiring for trust. |
| **Profile completion** | Phone/address not required before first listing; consider for compliance/support. |
| **Related listings** | `components/listing/RelatedListings.tsx` — TODO to use sellerId when re-implemented with Firestore; current behavior works. |

### 3.2 Deprecated / legacy (no immediate change)

| Item | Location | Note |
|------|----------|------|
| **Classified listings** | `app/api/listings/publish/route.ts`, NewListingClient, edit page, checkout, wire | Classified deprecated; back-compat only. |
| **Legacy seller object** | `lib/types.ts`, `lib/firebase/listings.ts` | `@deprecated`; do not persist; kept for backward compatibility. |
| **releasePayment()** | `lib/stripe/api.ts` | Deprecated; sellers paid via Stripe Connect destination charges. |
| **Fee overrides / seller tiers** | `lib/types.ts`, `lib/stripe/config.ts` | Deprecated fields; plan-based fees used. |

### 3.3 Documentation / runbooks

| Item | Detail |
|------|--------|
| **Internal docs** | **Updated.** `docs/internal/SCHEDULED_JOBS.md`, `docs/payments-current-state.md`, `docs/internal/WILDLIFE_EXCHANGE_INTERNAL_OPERATING_DOCUMENT.md`, `docs/audit/feature-audit.md`, `docs/audit/EXECUTIVE_SUMMARY.md`, `docs/PRODUCTION_READINESS_REVIEW.md` now state autoReleaseProtected is RETIRED and direct buyer→seller; no escrow. |
| **Firestore backups** | Documented: `docs/runbooks/firestore-backups.md`, `FIRESTORE_BACKUP_IMPLEMENTATION_SUMMARY.md`; runbook ref in `docs/internal/RUNBOOK_OPERATIONS.md` §9. |
| **Texas compliance** | If listing approval / breeder permits apply, ensure gating and docs are audited. `TEXAS_COMPLIANCE_AUDIT.md` exists. |

### 3.4 Performance & reliability

| Item | Detail |
|------|--------|
| **Error boundaries** | `app/error.tsx` exists; dashboard/seller use `ProductionErrorBoundary`. Confirm coverage for critical routes. |
| **Sentry** | Configured via `sentry.*.config.ts` when DSN set; verify in production and check System Health. |
| **Rate limiting** | Upstash Redis in prod; routes fail closed (503) when Redis missing. |
| **ChunkLoadError** | Cache headers in `next.config.js` set `max-age=0, must-revalidate` for HTML to avoid stale chunks after deploy. |

---

## 4. Legal & compliance (pre-launch)

| Item | Status | Note |
|------|--------|------|
| **Terms of Service** | ✅ | `app/terms/page.tsx`; versioned in `lib/legal/versions.ts`. |
| **Seller Policy** | ✅ | `app/legal/seller-policy/page.tsx`. |
| **Marketplace Policies** | ✅ | `app/legal/marketplace-policies/page.tsx`. |
| **Buyer Acknowledgment** | ✅ | `app/legal/buyer-acknowledgment/page.tsx`. |
| **Privacy Policy** | ✅ | `app/privacy/page.tsx`. |
| **Legal acceptance gate** | ✅ | `app/legal/accept/page.tsx` + `/api/legal/accept`; used at register and listing publish. |
| **Terms published** | Confirm | Footer and signup link to `/terms`; ensure “Terms of Service” published and linked. |

---

## 5. Critical flows to test before launch

1. **Sign up / sign in** — Create account; verify email if used.
2. **Legal accept** — New user or outdated version redirected to `/legal/accept`; accept ToS/policies; redirect to dashboard.
3. **Create listing** — Draft → submit; if listing approval enabled, approve in admin; confirm live.
4. **Checkout** — Buy listing (fixed-price or win auction); complete payment (Stripe live or test); confirm order in Dashboard → Orders and seller sees in sales.
5. **Stripe webhook** — After checkout, Stripe Dashboard → Webhooks → endpoint shows 200; System Health “Stripe webhook activity” shows recent event.
6. **Admin** — System Health: Firestore, Redis, Stripe, indexes OK; user dossier and audit trail.
7. **Seller onboarding** — Stripe Connect link; complete onboarding; list and sell.
8. **Dispute flow** — Open dispute, evidence, resolve; confirm emails/links use correct domain.

---

## 6. Quick checklist (copy-paste)

**P0 – Before launch**

- [ ] Netlify production env: Firebase (client + Admin), Stripe **live** keys + **live** webhook secret, Upstash Redis, Sentry (optional), Email (Brevo/Resend).
- [ ] No `sk_test_` / `pk_test_` in production.
- [ ] Stripe live webhook: URL = production `/api/stripe/webhook`; required events subscribed; secret in env.
- [ ] Firestore indexes deployed; System Health index checks OK.
- [ ] If domain ≠ agchange.com: set `NEXT_PUBLIC_SITE_URL` (and optionally `APP_URL`).
- [ ] Run `SECURITY_AUDIT_CHECKLIST.md` and tick off items.
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`.
- [x] Health check autoReleaseProtected clearly retired (title "[RETIRED — informational only]", "Retired" badge; no FAIL).

**P1 – Soon after**

- [ ] Replace placeholder “Response Time” / “Response Rate” with real metrics or remove.
- [ ] Add audit action types for reminders and compliance transfer.
- [ ] Optionally enable ESLint during build.
- [ ] Confirm E2E tests match current payment model (no escrow).

**P2 – Hardening**

- [x] Internal docs updated: autoReleaseProtected RETIRED, direct buyer→seller (no escrow).
- [x] Firestore backup strategy documented (docs/runbooks/firestore-backups.md; RUNBOOK_OPERATIONS §9).
- [ ] Optional: require email verification or profile completion before listing.

---

## 7. References

| Doc | Purpose |
|-----|--------|
| `docs/PRE_LAUNCH_CHECKLIST.md` | Env vars, Stripe webhook, Firestore indexes, Redis, verification steps. |
| `docs/PRE_LAUNCH_CODE_BASED.md` | Env requirements from code, TODOs, hardcoded URLs. |
| `docs/PRODUCTION_READINESS_REVIEW.md` | What’s solid vs what needs work; P0/P1/P2. |
| `SECURITY_AUDIT_CHECKLIST.md` | Auth, API, Firestore, Storage, payments, secrets. |
| `DEPLOYMENT_CHECKLIST.md` | Netlify deploy, env, KB sync. |
| `ENV_COMPLETE_GUIDE.md` | Full env variable reference. |
| `ERROR_MONITORING_SETUP.md` | Sentry setup. |

---

*Generated for launch audit. No code modified.*
