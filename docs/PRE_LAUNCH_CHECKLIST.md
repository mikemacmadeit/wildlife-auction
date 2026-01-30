# Pre-Launch Checklist — Specific Items That MUST Be Done

**Use this list before going live.** Each item is concrete and verifiable.

---

## 1. Environment Variables (Netlify)

**Where:** Netlify → Site → Environment variables → Production (and optionally Build).

| Variable | Required | Notes |
|----------|----------|--------|
| **Firebase (client)** | Yes | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` |
| **Firebase Admin (server)** | Yes | **Option A (Netlify):** Set `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` as a **Build-time** variable (not runtime). Build writes `netlify/secrets/firebase-service-account.json`; functions bundle it. **Option B:** Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (full PEM including `-----BEGIN PRIVATE KEY-----`; use `\n` for newlines). |
| **Stripe** | Yes | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — **must be LIVE keys** (`sk_live_`, `pk_live_`) and a **live** webhook signing secret in production. |
| **Upstash Redis** | Yes | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Without these, checkout, bids, admin, and other sensitive routes return **503** on Netlify. |
| **Sentry** | Recommended | `SENTRY_DSN` (server), `NEXT_PUBLIC_SENTRY_DSN` (client). Optional: `SENTRY_ENVIRONMENT=production`, `SENTRY_TRACES_SAMPLE_RATE=0.1`. |
| **Email** | Yes (for orders/notifications) | At least one: `BREVO_API_KEY` or `RESEND_API_KEY`. Newsletter also needs `BREVO_NEWSLETTER_LIST_ID` if you use it. |

**Verify:** After deploy, open **Dashboard → Admin → System Health**. All of: Firestore OK, Upstash Redis OK, Stripe API OK, Sentry OK (or WARN if you skip it), Email configured. No FAILs for these.

---

## 2. Stripe Production Setup

### 2.1 Use live keys
- In Netlify production env, **do not** use `sk_test_`, `pk_test_`, or a test webhook secret.
- Use keys from Stripe Dashboard → **Live** mode (toggle in top-right): API keys and a **live** webhook endpoint.

### 2.2 Create live webhook endpoint
1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
2. **Endpoint URL:** `https://YOUR-PRODUCTION-DOMAIN.com/api/stripe/webhook` (your real Netlify URL).
3. **Events to send:** Subscribe at least to:
   - `account.updated`
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `payment_intent.succeeded`
   - `payment_intent.canceled`
   - `charge.dispute.created`
   - `charge.dispute.updated`
   - `charge.dispute.closed`
   - `charge.dispute.funds_withdrawn`
   - `charge.dispute.funds_reinstated`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the **Signing secret** (starts with `whsec_`) and set it as `STRIPE_WEBHOOK_SECRET` in Netlify **production** env.

### 2.3 Verify webhook
- In Stripe Dashboard → Webhooks → your endpoint → **Send test webhook** (e.g. `checkout.session.completed`). Check Netlify function logs; you should see 200 and no 500/503.

---

## 3. Firebase Admin (Netlify)

- If using **Option A:** `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` must be set as a **Build** variable so the build script can run. The decoded JSON must contain `project_id`, `client_email`, `private_key` (full PEM). After build, `netlify/secrets/firebase-service-account.json` is created and bundled; do **not** commit this file.
- If using **Option B:** `FIREBASE_PRIVATE_KEY` must be the full key with `\n` for newlines (no literal line breaks in the env value, or it will be truncated).

**Verify:** Any API route that uses Firebase Admin (e.g. `/api/stripe/webhook`, `/api/admin/health`) must not return 503 "Server is not configured" / "Firebase Admin init failed". Trigger a test webhook or open System Health; both should succeed.

---

## 4. Firestore Indexes

Deploy indexes so admin and app queries do not fail at runtime:

```bash
firebase deploy --only firestore:indexes
```

**Indexes that the System Health page explicitly checks (must exist or those checks FAIL):**
- **messageThreads:** `flagged` (Ascending) + `updatedAt` (Descending)
- **supportTickets:** `status` (Ascending) + `createdAt` (Descending)
- **orders:** `payoutHoldReason` (Ascending) + `createdAt` (Descending) — for `in` query with two values

**Verify:** Dashboard → Admin → System Health. Under "Firestore indexes", all three checks show **OK**. If any show FAIL, open the link in the check details to create the index in Firebase Console.

---

## 5. Rate Limiting (Redis)

- Without `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in **production**, routes that use `requireRateLimit` with `requireRedisInProd` (checkout, bids, admin, messages, support, etc.) return **503** with "Rate limiting is not configured".
- Create an Upstash Redis database (e.g. AWS region near your users), **disable eviction** for rate limiting, copy REST URL and REST token, add both to Netlify production env.

**Verify:** System Health → Key services → Upstash Redis shows **OK**. Then try checkout or place-bid flow; you should not get 503 for rate limiting.

---

## 6. Security / Keys

- [ ] **No test keys in production:** Netlify production env must not contain `sk_test_`, `pk_test_`, or a test webhook secret.
- [ ] **Firebase private key:** Never commit `serviceAccountKey.json` or `netlify/secrets/firebase-service-account.json`; both are in `.gitignore`. If using base64, use a Build-only secret.
- [ ] **Stripe webhook secret:** Must match the **live** webhook endpoint. Using a test secret with live keys (or vice versa) will cause signature verification to fail and orders/refunds will not process.

---

## 7. Critical Flows to Test in Production

Before announcing launch, run through once on the **live** site with live Stripe (or a live test payment):

1. **Sign up / sign in** — Create account, verify email if you use it.
2. **Create listing** — Draft → submit; if you use listing approval, approve in admin then confirm it goes live.
3. **Checkout** — Buy a listing (fixed-price or win an auction); complete payment. Confirm order appears in Dashboard → Orders and seller sees it in sales.
4. **Stripe webhook** — After checkout, in Stripe Dashboard → Webhooks → your endpoint, confirm latest event is 200. In System Health, "Stripe webhook activity" should show a recent event.
5. **Admin** — Log in as admin, open System Health: Firestore, Redis, Stripe, Sentry, indexes all OK. Open a user dossier, add a note, confirm audit trail entry.

---

## 8. Optional but Recommended

- **Sentry:** Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` so production errors are captured.
- **Email:** Set Brevo or Resend so order/auction/notification emails send; otherwise users may not get critical emails.
- **NEXT_PUBLIC_SITE_URL** or **APP_URL:** Set to your production URL (e.g. `https://yoursite.com`) so password-reset and other links point to production.
- **Firestore rules:** Run `firebase deploy --only firestore:rules` so production rules match your repo.

---

## Quick Checklist (Copy-Paste)

- [ ] Netlify production env: all Firebase client vars + Firebase Admin (base64 or split)
- [ ] Netlify production env: Stripe **live** keys + **live** webhook secret
- [ ] Netlify production env: Upstash Redis URL + token
- [ ] Stripe live webhook endpoint created, URL = production domain `/api/stripe/webhook`, all required events subscribed, secret in env
- [ ] Firestore indexes deployed; System Health index checks OK
- [ ] No `sk_test_` / `pk_test_` in production env
- [ ] Test: sign up, create listing, checkout, order visible; webhook 200; System Health all green for Firestore, Redis, Stripe
