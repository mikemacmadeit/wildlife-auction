# Pre-Launch Check Results

**Checked:** Items 2–5 from the launch checklist (payments, legal, security, system health).  
**Outcome:** What’s in place vs. what you still need to do.

---

## 2. Payments & orders

| Check | Status | Notes |
|-------|--------|--------|
| One full flow (sign up → list → buy → order) | **You do** | Code paths exist: checkout create-session, Stripe webhook, order creation. You must run this once on **live** site with **live** Stripe. |
| Webhook returns 200 in Stripe Dashboard | **You verify** | After live test, confirm in Stripe Dashboard → Webhooks → your endpoint → recent events. |
| Admin → System Health shows recent webhook | **In place** | `app/dashboard/admin/health/page.tsx` calls `/api/admin/health` and shows a **Stripe Webhook Events** card; health API returns `opsHealth.stripeWebhook` and recent events. |
| Optional: VERIFICATION_CHECKLIST_PAYMENTS.md | **Exists** | `VERIFICATION_CHECKLIST_PAYMENTS.md` in project root: rapid-click, idempotency, refund single/concurrent. Run if you want extra assurance. |

**Your action:** On production with live Stripe, run one full flow and confirm webhook 200 + System Health shows the webhook.

---

## 3. Legal & compliance

| Check | Status | Notes |
|-------|--------|--------|
| Terms, Privacy, Seller Policy, Marketplace Policies, Buyer Acknowledgment live and linked | **In place** | Footer (`components/navigation/Footer.tsx`) links: `/privacy`, `/terms`, `/legal/marketplace-policies`, `/legal/seller-policy`, `/legal/buyer-acknowledgment`. |
| Legal pages exist | **In place** | `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/legal/marketplace-policies/page.tsx`, `app/legal/seller-policy/page.tsx`, `app/legal/buyer-acknowledgment/page.tsx`. |
| Legal accept gate | **In place** | `app/legal/accept/page.tsx`: shows ToS/marketplace/seller/buyer; POST `/api/legal/accept` with `docs: ['tos', 'marketplacePolicies', 'buyerAcknowledgment', 'sellerPolicy']`; redirects to `next`. |
| New/outdated user → /legal/accept | **In place** | `RequireAuth` redirects to `/legal/accept?next=...` when legal not accepted; `app/register/page.tsx` sends new users to `/legal/accept?next=...` after signup. |

**Your action:** After deploy, test: new user → sign up → `/legal/accept` → accept → redirect to dashboard.

---

## 4. Security final pass

| Check | Status | Notes |
|-------|--------|--------|
| Walk through SECURITY_AUDIT_CHECKLIST.md | **Ready** | `SECURITY_AUDIT_CHECKLIST.md` in project root: auth, API, Firestore, Storage, payments, dependencies, error handling, etc. Tick each item as you verify. |
| Run npm audit; fix or accept high/critical | **Action needed** | **npm audit** reported **4 vulnerabilities:** |
| | | • **axios** (high) – DoS via mergeConfig; fix: `npm audit fix` |
| | | • **lodash** (moderate) – prototype pollution; fix: `npm audit fix` |
| | | • **next** (high, 2 advisories) – DoS; fix may require `npm audit fix --force` (Next 16 – breaking). Either upgrade or accept risk and document. |
| | | • **qs** (low) – DoS; fix: `npm audit fix` |
| No secrets committed | **In place** | `.gitignore` includes: `.env`, `.env*.local`, `serviceAccountKey.json`, `*.json.key`, `*-firebase-adminsdk-*.json`, `netlify/secrets/`, and explicit env file names. |

**Your action:** Run `npm audit fix`; then either upgrade Next (and test) or document accepted risk for Next. Tick through `SECURITY_AUDIT_CHECKLIST.md`.

---

## 5. System Health & ops

| Check | Status | Notes |
|-------|--------|--------|
| Admin → System Health: Firestore, Redis, Stripe, index checks OK | **In place** | `app/dashboard/admin/health/page.tsx` and `app/api/admin/health/route.ts`: Firestore connectivity, Upstash Redis, Stripe API + webhook secret, Email, Sentry. **Firestore index checks:** messageThreads (flagged + updatedAt), supportTickets (status + createdAt), orders (payoutHoldReason + createdAt). All show OK/FAIL with index creation links. |
| First Firestore backup and verify | **Doc in place** | `docs/runbooks/firestore-backups.md`: setup, bucket layout, verify procedure. You run the backup and verification (e.g. `scripts/verify-firestore-backup.sh` or equivalent per runbook). |

**Your action:** After deploy, open Admin → System Health and confirm all green (or expected WARN). Run first Firestore backup and verification per runbook.

---

## Summary

| Area | Code/docs | Your action |
|------|-----------|-------------|
| **Payments** | Flow + Health webhook UI in place | One full live flow; confirm webhook 200 + Health |
| **Legal** | All pages + footer links + accept gate in place | Test legal accept after deploy |
| **Security** | Checklist + .gitignore in place | Run `npm audit fix`; fix or accept Next; tick checklist |
| **System Health** | Health page + index checks + backup runbook in place | After deploy confirm Health green; run first backup |

---

*Generated from pre-launch checklist review. Re-run checks after any env or dependency changes.*
