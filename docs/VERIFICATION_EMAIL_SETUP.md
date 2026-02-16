# Verification Email Setup

If users **never receive** the verification email (inbox or spam), the server is likely **not configured to send transactional email**. The app then falls back to Firebase’s email, which may not deliver if the site’s domain isn’t authorized.

## Verification email not sending — quick checklist

**1. See which path ran**

When the user clicks “Send verification email” in the app:

- **Toast says “Verification email sent (via Firebase)”** → The **API did not send**. The app fell back to Firebase (API returned 503/401/500 or timed out). Fix: configure the API in production (see step 2).
- **Toast says “Verification email sent” (no “via Firebase”)** → The **API sent** the branded email. If the user still doesn’t get it, it’s delivery (spam, provider). See [Email deliverability](EMAIL_DELIVERABILITY.md).

**2. Make the API send (Netlify production)**

In **Netlify** → Site → **Environment variables**, set **all** of the following, then **redeploy**:

| Variable | Required for |
|----------|----------------|
| `SENDGRID_API_KEY` (or `RESEND_API_KEY` or `BREVO_API_KEY`) | Email provider; without it the API returns 503 and the app uses Firebase. |
| `EMAIL_FROM` | From address (e.g. `noreply@wildlife.exchange`); must be on a domain you verify in the provider. |
| `EMAIL_FROM_NAME` | Sender name (e.g. `Wildlife Exchange`). |
| Firebase Admin | The API needs `getAdminAuth()` to generate the verification link. Use **either** `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` (build-only, recommended) **or** `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`. |

If any of these are missing in **production**, the API returns 503 and the client falls back to Firebase (or the request fails and then Firebase is used).

**3. If you rely on Firebase fallback**

- **Firebase Console** → Authentication → **Settings** → **Authorized domains** → add your production domain (e.g. `wildlife.exchange`).
- Without this, Firebase may not send or may throw `auth/unauthorized-domain`.

**4. After changing env**

Redeploy, then trigger “Send verification email” again. The toast should **not** say “(via Firebase)” if the API is configured correctly.

---

## 1. Confirm the template exists

The app **does** have a verification email template:

- **Template:** `verify_email` in `lib/email` (subject: “Verify your email — Agchange”, body with “Verify email” button).
- **API:** `POST /api/auth/send-verification-email` uses `renderEmail('verify_email', { userName, verifyUrl, dashboardUrl })` and `sendEmailHtml()`.

So the template is used when the API sends. If no provider is configured, the API returns 503 and the client uses **Firebase** `sendEmailVerification()` instead (different sender, may not deliver).

## 2. Configure a transactional email provider (recommended)

Set **one** of these in your **Netlify** (or server) environment so the API actually sends the branded email:

| Variable | Provider | Notes |
|----------|----------|--------|
| `RESEND_API_KEY` | [Resend](https://resend.com) | Verify your from domain in Resend dashboard. |
| `SENDGRID_API_KEY` | [SendGrid](https://sendgrid.com) | Set `EMAIL_PROVIDER=sendgrid` and verify from domain. |
| `BREVO_API_KEY` | [Brevo](https://brevo.com) | Verify sender/domain in Brevo. |

Also set:

- `EMAIL_FROM` (e.g. `noreply@yourdomain.com`) — must be a verified sender/domain in the provider.
- `EMAIL_FROM_NAME` (e.g. `Agchange`).

**If verification emails go to spam:** authenticate your sending domain (SPF, DKIM, DMARC) in the provider and use `EMAIL_FROM` on that domain. See [Email deliverability](EMAIL_DELIVERABILITY.md).

After setting these, redeploy. The API will send the verification email using the template above.

## 3. Check deploy logs

In **Netlify** → Deploys → [latest deploy] → **Deploy log** (or Functions log for the API):

- **“No email provider configured”**  
  → Set `RESEND_API_KEY`, `SENDGRID_API_KEY`, or `BREVO_API_KEY` (and verify from domain).

- **“Sent to x…@domain via resend”** (or sendgrid/brevo)  
  → API is sending; if users still don’t get it, check provider dashboard (bounces, spam) and from-domain verification.

- If the API returns 503, the client falls back to **Firebase**. You may see a toast: **“Verification email sent (via Firebase)”**. Then delivery depends on Firebase (authorized domains, recipient spam).

## 4. Firebase fallback (authorized domains)

If you rely on Firebase’s email (no provider set or API 503):

1. **Firebase Console** → Authentication → **Settings** → **Authorized domains**.
2. Add your production domain (e.g. `your-site.netlify.app` or custom domain).
3. Without this, Firebase may not send or may fail with `auth/unauthorized-domain`.

## Summary

| Goal | Action |
|------|--------|
| Reliable verification emails | Set `RESEND_API_KEY` (or SendGrid/Brevo) in Netlify and verify from domain. |
| Template in use | Already in use when the API sends (`verify_email` → branded HTML with “Verify email” button). |
| No email at all | 1) Add provider + from domain, or 2) Use Firebase fallback and add site to Firebase authorized domains. |
