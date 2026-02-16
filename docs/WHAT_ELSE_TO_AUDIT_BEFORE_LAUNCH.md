# What Else to Audit Before Launch

**Purpose:** After backend sidebar audit and full security audit, use this list so nothing critical is missed. Each section points to existing checklists or concrete steps.

---

## Already done (reference only)

- **Backend sidebar** — `docs/BACKEND_SIDEBAR_PAGES_AUDIT.md` (UX, load/error handling, nav).
- **Security** — `docs/SECURITY_AUDIT_REPORT.md` (auth, Firestore/Storage rules, API, secrets, backups, error disclosure). Use `SECURITY_AUDIT_CHECKLIST.md` for a final tick-through.

---

## 1. Environment & deployment (P0)

**Checklist:** `docs/PRE_LAUNCH_CHECKLIST.md`

- [ ] Netlify **production** env: Firebase (client + Admin), Stripe **live** keys + **live** webhook secret, Upstash Redis, Email (Brevo/Resend), optional Sentry.
- [ ] No `sk_test_`, `pk_test_`, or test webhook secret in production.
- [ ] Stripe **live** webhook: URL = `https://YOUR-DOMAIN/api/stripe/webhook`; all required events subscribed; signing secret in env.
- [ ] `NEXT_PUBLIC_SITE_URL` or `APP_URL` set to production domain (emails/links).
- [ ] Firestore indexes: `firebase deploy --only firestore:indexes`; System Health index checks OK.
- [ ] **Firestore rules:** `firebase deploy --only firestore:rules`.
- [ ] **Storage rules:** `firebase deploy --only storage` (or `firebase deploy`). Often missed; required so listing/order docs and uploads are protected in production.

---

## 2. Payments & orders (P0)

**Checklists:** `VERIFICATION_CHECKLIST_PAYMENTS.md`, `docs/PRE_LAUNCH_CHECKLIST.md` §7

- [ ] Run payment verification tests (rapid-click checkout, webhook idempotency, refund single/concurrent) per `VERIFICATION_CHECKLIST_PAYMENTS.md`.
- [ ] On **live** site with **live** Stripe: sign up → create listing → checkout → confirm order in Dashboard and seller sales; webhook 200 in Stripe Dashboard; System Health shows recent webhook activity.
- [ ] Optional: `AIRTIGHT_COMPLIANCE_QA_CHECKLIST.md` if you use strict compliance flows.

---

## 3. Legal & compliance (P0)

**Reference:** `docs/LAUNCH_AUDIT_FULL.md` §4

- [ ] Terms, Privacy, Seller Policy, Marketplace Policies, Buyer Acknowledgment are published and linked (footer, signup, legal accept).
- [ ] Legal accept gate works: new/outdated user → `/legal/accept` → accept → redirect.
- [ ] If Texas/breeder applies: `TEXAS_COMPLIANCE_AUDIT.md` and listing/breeder-permit flows reviewed.

---

## 4. System Health & ops (P0)

**Reference:** `docs/PRE_LAUNCH_CHECKLIST.md` §1

- [ ] After deploy: **Admin → System Health**. Firestore OK, Upstash Redis OK, Stripe API OK, Firestore index checks OK. Sentry/Email optional but no FAIL for required services.
- [ ] Firestore backup: first backup run and `scripts/verify-firestore-backup.sh` (or equivalent) succeeds; see `docs/runbooks/firestore-backups.md`.

---

## 5. Security final pass (P0)

**Checklists:** `SECURITY_AUDIT_CHECKLIST.md`, `docs/SECURITY_AUDIT_REPORT.md`

- [ ] Tick through `SECURITY_AUDIT_CHECKLIST.md` (auth, API, Firestore, Storage, payments, secrets, error handling, dependencies).
- [ ] Run `npm audit`; fix or accept high/critical (see `docs/SECURITY_AUDIT_REPORT.md` §9).
- [ ] Confirm `.env.local` and any secret files are in `.gitignore` and never committed.

---

## 6. Critical user flows (P0)

**Reference:** `docs/LAUNCH_AUDIT_FULL.md` §5

- [ ] Sign up / sign in (and email verification if used).
- [ ] Legal accept → dashboard.
- [ ] Create listing (draft → submit → approval if used → live).
- [ ] Checkout (fixed-price or auction win) → order visible to buyer and seller.
- [ ] Admin: System Health green; user dossier; audit trail.
- [ ] Seller onboarding: Stripe Connect → complete → list and sell.
- [ ] Dispute: open → evidence → resolve; emails/links use production domain.

---

## 7. Content & branding (P1)

- [ ] No placeholder “Lorem” or “TODO” in user-facing copy on production.
- [ ] Support email and brand name correct in footer and emails (`lib/brand.ts`, `SUPPORT_EMAIL`).
- [ ] Custom 404 page works; Netlify redirects (if any) tested.

---

## 8. Monitoring & errors (P1)

**Reference:** `ERROR_MONITORING_SETUP.md`, `docs/PRE_LAUNCH_CHECKLIST.md` §8

- [ ] Sentry: `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` set; trigger test error; confirm event in Sentry.
- [ ] System Health shows Sentry OK (or intentional WARN if disabled).

---

## 9. Optional but recommended (P2)

- [ ] **Accessibility:** Run Lighthouse accessibility on key pages (home, listing, checkout, dashboard).
- [ ] **SEO:** Critical pages have correct `<title>`, meta description, OG tags (especially listing and public legal pages).
- [ ] **Performance:** Core Web Vitals on main flows; consider `next.config.js` image config if listing images are heavy (see `UX_PERFORMANCE_AUDIT_EBAY_LEVEL.md` if needed).
- [ ] **ESLint in build:** Consider turning off `eslint.ignoreDuringBuilds` in `next.config.js` for launch to catch lint issues (see `docs/LAUNCH_AUDIT_FULL.md` P1).
- [ ] **E2E tests:** Confirm `tests/e2e/*` match current payment model (direct buyer→seller; no escrow).

---

## 10. One-page “go/no-go” checklist

Immediately before announcing launch:

| Area | Action |
|------|--------|
| Env | Production env vars set; no test Stripe keys. |
| Webhook | Live Stripe webhook URL + secret; test event returns 200. |
| Firebase | Indexes + Firestore rules + **Storage rules** deployed. |
| Redis | Upstash Redis in prod; System Health shows OK. |
| Security | `SECURITY_AUDIT_CHECKLIST.md` ticked; `npm audit` reviewed. |
| Payments | One full live flow: sign up → list → buy → order visible; webhook 200. |
| Legal | Terms/Privacy linked; legal accept flow works. |
| Health | System Health all green for required services. |
| Content | No placeholder copy; support email correct. |

---

## References

| Doc | Purpose |
|-----|--------|
| `docs/PRE_LAUNCH_CHECKLIST.md` | Env, Stripe, Firestore indexes, Redis, critical flows. |
| `docs/LAUNCH_AUDIT_FULL.md` | P0/P1/P2, legal, flows, references. |
| `docs/SECURITY_AUDIT_REPORT.md` | Security audit results and recommendations. |
| `SECURITY_AUDIT_CHECKLIST.md` | Final security tick-through. |
| `VERIFICATION_CHECKLIST_PAYMENTS.md` | Payment and order integrity tests. |
| `PRODUCTION_DEPLOYMENT_CHECKLIST.md` | Broader deployment and payment checklist. |
| `docs/runbooks/firestore-backups.md` | Backup and verify procedure. |
