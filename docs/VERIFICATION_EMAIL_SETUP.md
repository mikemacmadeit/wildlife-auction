# Verification Email Setup

If users **never receive** the verification email (inbox or spam), the server is likely **not configured to send transactional email**. The app then falls back to Firebase’s email, which may not deliver if the site’s domain isn’t authorized.

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
