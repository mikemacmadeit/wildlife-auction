# Email Deliverability (Avoid Spam)

Verification and notification emails are sent via SendGrid, Resend, or Brevo. If messages land in **spam**, it’s almost always because the **sending domain** is not authenticated. Fix that first.

**If the verification email is From `noreply@...firebaseapp.com`:** That’s Firebase’s fallback, not your provider. The app only uses Firebase when the API isn’t configured or returns an error. Gmail (and others) often treat `firebaseapp.com` as low-trust or spam once it’s been marked. To fix: configure SendGrid/Resend/Brevo and `EMAIL_FROM` in production so the **API** sends the branded email from your domain (e.g. `noreply@wildlife.exchange`), then verify that domain (SPF/DKIM) so your mail lands in inbox.

## 1. Authenticate your sending domain (SPF, DKIM, DMARC)

Your **From** address (e.g. `noreply@yourdomain.com`) must use a domain you control. That domain must be **verified** in your email provider and have the correct **DNS records** so receiving servers trust the mail.

### SendGrid

1. **Settings** → **Sender Authentication** → **Authenticate Your Domain**.
2. Choose your domain (e.g. `yourdomain.com`).
3. Add the **CNAME records** SendGrid shows (for DKIM and link branding) to your DNS.
4. Click **Verify**. Until verification succeeds, SendGrid may still send, but inbox placement will be poor.
5. Optionally add **DMARC**: create a TXT record `_dmarc.yourdomain.com` (see [SendGrid DMARC](https://docs.sendgrid.com/ui/account-and-settings/dmarc)).

### Resend

1. **Domains** → **Add Domain** → enter your domain.
2. Add the **DNS records** Resend provides (SPF and DKIM).
3. Wait for **Verified**. Use a From address on this domain (e.g. `noreply@yourdomain.com`).
4. Optionally add DMARC; Resend’s dashboard often links to instructions.

### Brevo

1. **Settings** → **Senders & IP** (or **Domains**) → add and verify your domain.
2. Add the **SPF/DKIM** records Brevo gives you.
3. Optionally set up DMARC for the domain.

**Important:** `EMAIL_FROM` / `FROM_EMAIL` must be an address **on the domain you verified** (e.g. `noreply@yourdomain.com`). Using a different domain (or a free one like gmail.com) will hurt deliverability.

## 2. Use a consistent From address and name

- **EMAIL_FROM** (or **FROM_EMAIL**): use the verified domain, e.g. `noreply@yourdomain.com` or `verify@yourdomain.com`.
- **EMAIL_FROM_NAME** (or **FROM_NAME**): use your product name (e.g. `Wildlife Exchange`) so recipients recognize the sender.
- **EMAIL_REPLY_TO** (optional): e.g. `support@yourdomain.com` so users can reply; some providers treat a proper reply-to as a positive signal.

Set these in Netlify (or your server) env; see `env.example` and `docs/SENDGRID_EMAIL_SETUP.md`.

## 3. Content and reputation (optional tweaks)

- The verification template is already clean (one main CTA, no spammy wording). No code change required for basic deliverability.
- **New domains** have low reputation; sending only transactional mail (verification, order confirmations) and avoiding big blasts helps.
- If you later add marketing mail, use a separate subdomain or dedicated sending domain so transactional reputation stays high.

## 4. Quick checklist

| Step | Action |
|------|--------|
| 1 | In SendGrid/Resend/Brevo, **verify your sending domain** (add their SPF/DKIM/DMARC DNS records). |
| 2 | Set **EMAIL_FROM** to an address on that domain (e.g. `noreply@yourdomain.com`). |
| 3 | Set **EMAIL_FROM_NAME** to your brand. |
| 4 | Redeploy so the app uses the new env. |
| 5 | Send a test verification email and check inbox (not spam). |

If emails still go to spam after domain authentication, check the provider’s **deliverability** or **reputation** docs (e.g. [SendGrid](https://docs.sendgrid.com/ui/sending-email/deliverability), [Resend](https://resend.com/docs), [Brevo](https://help.brevo.com)).
