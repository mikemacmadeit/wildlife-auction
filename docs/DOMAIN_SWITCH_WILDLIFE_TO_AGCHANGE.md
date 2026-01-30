# Domain Switch: wildlife.exchange → agchange.app

**Context:** Production currently uses **wildlife.exchange**. New primary domain is **agchange.app** (from GoDaddy). This doc lists what will break when you switch and where to put the new URL.

---

## 1. What Will Break Initially (Until You Update)

These depend on the **current** domain (wildlife.exchange) and will fail or misbehave as soon as traffic moves to agchange.app until you update them.

| Area | What breaks | Where to fix |
|------|-------------|--------------|
| **Firebase Auth** | Sign-in (email link, Google redirect) will fail or redirect to wrong domain. | Firebase Console → Authentication → Settings → Authorized domains. **Add** `agchange.app` (and `www.agchange.app` if you use www). |
| **Google OAuth** | "Sign in with Google" will fail — redirect URI / origin mismatch. | Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client → **Authorized JavaScript origins** and **Authorized redirect URIs**. Add `https://agchange.app` and `https://agchange.app/__/auth/handler`. |
| **Stripe** | Connect onboarding redirects and webhook delivery will still point at wildlife.exchange. | Stripe Dashboard → Connect settings (return URLs); Developers → Webhooks → update endpoint URL to `https://agchange.app/api/stripe/webhook`. |
| **Stripe Connect return URL** | After seller onboarding, Stripe sends users back to the URL you set. If that URL is wildlife.exchange, users land on old domain. | Set **APP_URL** or **NEXT_PUBLIC_APP_URL** (or Netlify `URL`) to `https://agchange.app` so `getSiteUrl()` / `getAppUrl()` return the new domain. Create-account-link uses this. |
| **Email links** | Password reset, verify email, order/listing links in emails will point at wildlife.exchange (or at agchange.com if env was unset). | Set **NEXT_PUBLIC_SITE_URL** to `https://agchange.app` in production. Many email flows use this or `getSiteUrl()`. |
| **Firebase Storage CORS** | Uploads from the browser (listing images, etc.) can be blocked if the request origin is agchange.app but CORS only allows wildlife.exchange. | Update Storage CORS config: add `https://agchange.app` (and www if used). See `scripts/storage-cors.json` and Firebase Console → Storage → CORS. |
| **Netlify** | Site is still bound to wildlife.exchange. New domain won’t serve the app until you add it. | Netlify → Site → Domain management → Add custom domain `agchange.app` (and www if needed). Point DNS at Netlify (GoDaddy: A/CNAME as Netlify instructs). |
| **DNS** | agchange.app won’t resolve to your app until DNS is set. | At GoDaddy (or wherever agchange.app is): A record and/or CNAME to Netlify’s load balancer. Netlify shows exact values. |
| **Push notifications** | Browser may show “Enable notifications for wildlife.exchange” or wrong origin. | After domain switch, users may need to re-grant permission; copy in `lib/firebase/push.ts` references “agchange.com” — update to “agchange.app” (or dynamic). |

---

## 2. Where to Put the New URL (Config / Env)

Set these so the **app** uses agchange.app for redirects, links, and APIs.

| Where | Variable / Setting | Value |
|-------|---------------------|--------|
| **Netlify (production)** | `URL` | Usually set by Netlify when you add the custom domain. Verify it’s `https://agchange.app` (or your primary domain). |
| **Netlify (production)** | `APP_URL` or `NEXT_PUBLIC_APP_URL` | `https://agchange.app` (no trailing slash). Ensures Stripe Connect and server-side redirects use the new domain. |
| **Netlify (production)** | `NEXT_PUBLIC_SITE_URL` | `https://agchange.app`. Used for email links (disputes, support, password reset), so all links in emails point to agchange.app. |

After adding agchange.app as the primary domain in Netlify, `URL` / `DEPLOY_PRIME_URL` will often be that domain; then `getSiteUrl()` and `getAppUrl()` in code will use it. Setting `APP_URL` and `NEXT_PUBLIC_SITE_URL` explicitly avoids any fallback to localhost or agchange.com.

---

## 3. Code: Hardcoded Fallbacks to Update

The codebase uses **agchange.com** (and a few wildlifeexchange.com) as fallbacks when env is missing. For a clean switch to **agchange.app**, update these so that if env is ever wrong or missing, the app still points to the correct domain.

### 3.1 High impact (emails, redirects, API responses)

| File | Current | Change to |
|------|---------|-----------|
| `lib/brand.ts` | `'support@agchange.com'` | `'support@agchange.app'` (or keep .com if you keep that email) |
| `app/api/orders/[orderId]/dispute/route.ts` | `'https://agchange.com'` | `'https://agchange.app'` |
| `app/api/admin/support/tickets/[ticketId]/reply/route.ts` | `'https://agchange.com'` | `'https://agchange.app'` |
| `app/api/support/tickets/route.ts` | `'https://agchange.com'` | `'https://agchange.app'` |
| `app/api/stripe/connect/create-account-link/route.ts` | (error message says "e.g. https://agchange.com") | Update example to `https://agchange.app` |

### 3.2 Email templates and previews (lib/email)

| File | Current | Change to |
|------|---------|-----------|
| `lib/email/index.ts` | Many sample URLs `'https://agchange.com/...'` | `'https://agchange.app/...'` (all occurrences used as default/sample data) |
| `lib/email/templates.ts` | `productionOrigin = 'https://agchange.com'`, `origin \|\| 'https://agchange.com'`, "Visit agchange.com", "agchange.com" in footer | `https://agchange.app` and "agchange.app" where it’s the display/origin domain |

### 3.3 UI copy and links (user-facing)

| File | Current | Change to |
|------|---------|-----------|
| `app/terms/page.tsx` | `support@agchange.com` | `support@agchange.app` (or keep .com if that’s the real address) |
| `app/trust/page.tsx` | `compliance@agchange.com` | `compliance@agchange.app` (or keep .com) |
| `lib/firebase/push.ts` | "Enable notifications for agchange.com" | "Enable notifications for agchange.app" (or derive from current origin) |

### 3.4 Admin / internal

| File | Current | Change to |
|------|---------|-----------|
| `app/dashboard/admin/email-templates/page.tsx` | `origin.includes('agchange.com')`, `replace('https://agchange.com', origin)` | Use `agchange.app` in the rewrite logic so preview works when site is agchange.app |
| `app/dashboard/admin/notifications/page.tsx` | `listingUrl: 'https://agchange.com/...'` | `'https://agchange.app/...'` (or use `getSiteUrl()`) |
| `app/api/marketing/newsletter/subscribe/route.ts` | `SITE: 'agchange.com'` | `SITE: 'agchange.app'` |

### 3.5 Env example and defaults

| File | Current | Change to |
|------|---------|-----------|
| `env.example` | `EMAIL_FROM=notify@agchange.com`, `EMAIL_REPLY_TO=support@agchange.com` | Use `@agchange.app` if you’ll use that for email; else keep .com. |
| `lib/email/config.ts` | `'noreply@wildlifeexchange.com'` | `'noreply@agchange.app'` (or your chosen sending domain). |

### 3.6 Firebase Storage CORS (script)

| File | Current | Change to |
|------|---------|-----------|
| `scripts/storage-cors.json` | `"https://wildlife.exchange"`, `"https://www.wildlife.exchange"` | Add `"https://agchange.app"` and `"https://www.agchange.app"` (and keep wildlife.exchange until you fully retire it, or replace). |

---

## 4. External Services Checklist (No Code Change)

Do these in the order that makes sense (e.g. DNS + Netlify first, then auth and Stripe).

- [ ] **GoDaddy (agchange.app):** Point A/CNAME to Netlify as per Netlify’s “Add custom domain” instructions.
- [ ] **Netlify:** Add custom domain `agchange.app` (and www if needed). Set as primary if this will be the main URL. HTTPS will be provisioned.
- [ ] **Netlify env:** Set `APP_URL` and/or `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` to `https://agchange.app`.
- [ ] **Firebase Console → Authentication → Authorized domains:** Add `agchange.app` (and `www.agchange.app` if used).
- [ ] **Google Cloud Console → OAuth 2.0 Client:** Add Authorized JavaScript origin `https://agchange.app` and redirect URI `https://agchange.app/__/auth/handler`.
- [ ] **Stripe Dashboard → Connect:** Update platform return/refresh URLs to `https://agchange.app/...` if they’re set explicitly.
- [ ] **Stripe Dashboard → Webhooks:** Add (or update) endpoint to `https://agchange.app/api/stripe/webhook`; copy signing secret into Netlify env as `STRIPE_WEBHOOK_SECRET` if you use a single live endpoint.
- [ ] **Firebase Storage CORS:** Upload CORS config that includes `https://agchange.app` (see `scripts/storage-cors.json` and [FIREBASE_STORAGE_CORS_SETUP.md](./FIREBASE_STORAGE_CORS_SETUP.md)).
- [ ] **Email (Brevo/Resend/SendGrid):** If you use a custom domain for sending (e.g. notify@agchange.app), add and verify agchange.app in the provider. Update `EMAIL_FROM` / `FROM_EMAIL` in Netlify if you switch to @agchange.app.
- [ ] **Sentry (if used):** Add `agchange.app` to allowed origins if required.
- [ ] **Any other third parties** (analytics, support widget, etc.) that have wildlife.exchange or agchange.com whitelisted: add agchange.app.

---

## 5. Optional: Redirect wildlife.exchange → agchange.app

To avoid broken bookmarks and old links:

- In **Netlify**, add `wildlife.exchange` as an additional domain and set up a redirect rule (e.g. 301) from `https://wildlife.exchange/*` to `https://agchange.app/*`.
- Or handle redirects at DNS/CDN level if you move wildlife.exchange to the same Netlify site.

---

## 6. Quick Reference: Files to Edit for agchange.app

| Category | Files |
|----------|--------|
| **API/origin fallbacks** | `lib/brand.ts`, `app/api/orders/[orderId]/dispute/route.ts`, `app/api/admin/support/tickets/[ticketId]/reply/route.ts`, `app/api/support/tickets/route.ts`, `app/api/stripe/connect/create-account-link/route.ts` |
| **Email** | `lib/email/index.ts`, `lib/email/templates.ts`, `lib/email/config.ts`, `app/api/marketing/newsletter/subscribe/route.ts` |
| **UI** | `app/terms/page.tsx`, `app/trust/page.tsx`, `lib/firebase/push.ts` |
| **Admin** | `app/dashboard/admin/email-templates/page.tsx`, `app/dashboard/admin/notifications/page.tsx` |
| **Config / scripts** | `env.example`, `scripts/storage-cors.json` |

Doc references to wildlife.exchange (e.g. GOOGLE_OAUTH_*, STRIPE_CONNECT_SETUP.md) can be updated to agchange.app in a follow-up pass so new setups use the correct domain.
