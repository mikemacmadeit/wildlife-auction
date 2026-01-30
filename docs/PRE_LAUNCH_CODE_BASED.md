# Pre-Launch: What the Code Actually Requires

**Source:** Codebase analysis (no testing). These are requirements and fixes derived from the code itself.

---

## 1. Code That Was Fixed (Done in This Pass)

| File | Issue | Fix |
|------|--------|-----|
| **6 files** | Debug instrumentation: `fetch('http://127.0.0.1:7242/ingest/...')` left from debug mode. | Removed all 9 occurrences. Files: `ListingDetailInteractiveClient.tsx`, `ListingDetailClient.tsx`, `create-session/route.ts`, `lib/stripe/api.ts`, `wire/create-intent/route.ts`. |
| **app/api/listings/publish/route.ts** | Hardcoded `const origin = 'https://agchange.com'` for admin notification links. | Replaced with `getSiteUrl()` so production uses the real site URL (env or Netlify URL). |
| **app/api/orders/[orderId]/disputes/open/route.ts** | Hardcoded `const origin = 'https://agchange.com'` for admin payload links. | Replaced with `getSiteUrl()`. |
| **app/api/admin/users/[userId]/password-reset-link/route.ts** | Used only `APP_URL` / `NEXT_PUBLIC_APP_URL` for Firebase reset link; if unset, link could be wrong. | Now uses `getSiteUrl()` (which respects Netlify `URL` / `DEPLOY_PRIME_URL`) and only sets `continueUrl` when not localhost. |

---

## 2. Env / Config the Code Requires (From 503 and Explicit Checks)

The following are **enforced in code** (routes return 503 or 500 if missing):

| Requirement | Where in code | Effect if missing |
|-------------|----------------|-------------------|
| **STRIPE_SECRET_KEY** | `lib/stripe/config.ts`, many API routes | Stripe routes return 503 "Stripe is not configured". |
| **STRIPE_WEBHOOK_SECRET** | `app/api/stripe/webhook/route.ts` (line ~107) | Webhook returns 500 "Webhook secret not configured"; orders/refunds won’t process. |
| **NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY** | Health check + client checkout | Checkout and client Stripe usage break. |
| **Firebase Admin** | `lib/firebase/admin.ts`; used by webhook, admin, messages, etc. | Any route that calls `getAdminDb()` or `getAdminAuth()` returns 503 "Server is not configured" (e.g. admin, webhook, messages, listings publish). |
| **UPSTASH_REDIS_REST_URL + TOKEN** | `lib/rate-limit.ts` | When `requireRedisInProd` is true and `NETLIFY` is set, sensitive routes (checkout, bids, admin, messages, support, etc.) return 503 "Rate limiting is not configured". |

Firebase Admin is satisfied by **either**:
- Netlify build: `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` (build-only) so the build script writes `netlify/secrets/firebase-service-account.json`, **or**
- `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (full PEM, `\n` for newlines).

---

## 3. Env the Code Uses (No Hard Fail, But Wrong If Missing)

| Env | Where used | Effect if missing / wrong |
|-----|------------|---------------------------|
| **APP_URL / NEXT_PUBLIC_APP_URL / URL / DEPLOY_PRIME_URL / NETLIFY_URL** | `lib/stripe/config.ts` `getAppUrl()`, `lib/site-url.ts` `getSiteUrl()` | `getAppUrl()` falls back to `http://localhost:3000`. Stripe Connect create-account-link **errors 500** in production if `getSiteUrl()` contains localhost (`create-account-link/route.ts`). Netlify usually sets `URL` / `DEPLOY_PRIME_URL`, so `getSiteUrl()` is OK; if not, set `APP_URL` or `NEXT_PUBLIC_APP_URL`. |
| **NEXT_PUBLIC_SITE_URL** | `app/api/orders/[orderId]/dispute/route.ts`, `app/api/admin/support/tickets/[ticketId]/reply/route.ts`, `app/api/support/tickets/route.ts` | Fallback is `'https://agchange.com'`. If your domain is different, set this or emails/links will point to agchange.com. |
| **BREVO_API_KEY** | Newsletter subscribe, email config | Newsletter subscribe returns 503 if missing. |
| **BREVO_NEWSLETTER_LIST_ID** | Newsletter subscribe | Returns 503 if not a valid number. |
| **SENDGRID_API_KEY / BREVO_API_KEY / RESEND_API_KEY** | `lib/email/config.ts` | Email provider selection; no send if none set. |
| **EMAIL_FROM / FROM_EMAIL** | `lib/email/config.ts` | Default `noreply@wildlifeexchange.com`. |

---

## 4. Hardcoded Domain Fallbacks in Code

If your production domain is **not** agchange.com, set **NEXT_PUBLIC_SITE_URL** (and optionally **APP_URL**) so these don’t point to agchange.com:

- **lib/brand.ts:** `NEXT_PUBLIC_SUPPORT_EMAIL || 'support@agchange.com'`
- **lib/email/config.ts:** `FROM_EMAIL` default `'noreply@wildlifeexchange.com'`
- **lib/email/templates.ts**, **lib/email/index.ts:** Many `origin || 'https://agchange.com'` and sample URLs with `agchange.com` (templates use `origin` when passed; callers should pass `getSiteUrl()`).
- **app/api/orders/[orderId]/dispute/route.ts:** `process.env.NEXT_PUBLIC_SITE_URL || 'https://agchange.com'`
- **app/api/admin/support/tickets/[ticketId]/reply/route.ts:** same
- **app/api/support/tickets/route.ts:** same

The **publish** and **disputes/open** routes were fixed to use `getSiteUrl()`; the dispute **route.ts** (buyer dispute flow) still uses `NEXT_PUBLIC_SITE_URL || 'https://agchange.com'` for the email origin — set the env if your domain differs.

---

## 5. Firestore Indexes the Code Depends On

The **admin health** route runs these queries; if the index is missing, the health check fails and the underlying feature can fail in production:

- **messageThreads:** `where('flagged', '==', true).orderBy('updatedAt', 'desc')`
- **supportTickets:** `where('status', '==', 'open').orderBy('createdAt', 'desc')`
- **orders:** `where('payoutHoldReason', 'in', [...]).orderBy('createdAt', 'desc')`

Deploy with: `firebase deploy --only firestore:indexes`.

---

## 6. Stripe Webhook Events the Code Handles

The webhook route switches on these event types; the **live** webhook endpoint must subscribe to them or those flows won’t run:

- `account.updated`
- `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
- `payment_intent.succeeded`, `payment_intent.canceled`
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `invoice.payment_succeeded`, `invoice.payment_failed`

---

## 7. TODOs in Code (What the Code Says Needs Doing)

All of these were found by reading the code (no testing). Classified by impact.

### Display / UX only (non-blocking)

| File | TODO | Impact |
|------|------|--------|
| **app/seller/overview/page.tsx** | `responseTime: '< 2 hours'` — calculate from actual response times | Placeholder text only. |
| **app/dashboard/account/page.tsx** | `responseRate: 0` — calculate from message response times | Placeholder metric only. |

### Incomplete features (code explicitly defers)

| File | TODO | Impact |
|------|------|--------|
| **components/orders/ComplianceTransferPanel.tsx** | Implement file upload to storage (Firebase Storage or similar) | File upload handler logs and shows "File upload will be implemented in next phase". Compliance flow works without it if you don’t require uploads for launch. |
| **components/listing/RelatedListings.tsx** | Use sellerId comparison when re-implemented with Firestore in Phase 2 | Related listings still work; sellerId filter is deferred. |

### Audit trail granularity (optional)

Four routes use `actionType: 'admin_note_added'` with a TODO to add a specific `AuditActionType`:

| File | Suggested type |
|------|----------------|
| **app/api/admin/orders/[orderId]/send-reminder/route.ts** | `admin_reminder_sent` |
| **app/api/admin/reminders/run/route.ts** | `admin_reminders_run` |
| **app/api/admin/orders/[orderId]/compliance-transfer/remind/route.ts** | `compliance_reminder_sent` |
| **app/api/orders/[orderId]/compliance-transfer/confirm/route.ts** | `compliance_transfer_confirmed` |

To fulfill: add these strings to `AuditActionType` in **lib/audit/logger.ts** and use them in the routes. Behavior is unchanged; audit trail becomes more precise.

### Monitoring (optional)

| File | TODO | Impact |
|------|------|--------|
| **lib/monitoring/reportError.ts** | Integrate with server-side monitoring | Client-only today; server errors are not sent to a monitoring service from this module. |
| **lib/monitoring/reportError.ts** | Integrate with monitoring service for warnings | Warnings only go to `console.warn`. |

None of the above affect payments, auth, or critical flows for launch.

---

## Summary: Must-Haves From Code

1. **Remove debug instrumentation** — ✅ Done (6 files).
2. **Use dynamic site URL for publish + disputes/open + password-reset** — ✅ Done.
3. **Set in production:** Firebase (client + Admin), Stripe (secret, publishable, webhook secret), Upstash Redis; then Stripe webhook URL and event list; deploy Firestore indexes.
4. **If domain ≠ agchange.com:** Set `NEXT_PUBLIC_SITE_URL` (and optionally `APP_URL`) so emails and links use the correct domain.
