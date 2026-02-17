# Get notification emails working

Follow these steps in order. Everything happens in **Netlify** and **Brevo** (no code changes).

---

## 1. Get a Brevo API key

1. Go to [brevo.com](https://www.brevo.com) and sign in (or create an account).
2. **Settings** (gear) → **SMTP & API** → **API Keys**.
3. Create an API key (e.g. “Wildlife transactional”). Copy it — you’ll paste it in Netlify next.

---

## 2. Set environment variables in Netlify

1. Open **Netlify** → your site → **Site configuration** → **Environment variables**.
2. Add or edit these (use **Add a variable** / **Edit**):

| Variable | Value | Required |
|----------|--------|----------|
| `BREVO_API_KEY` | The API key you copied from Brevo | **Yes** |
| `EMAIL_PROVIDER` | `brevo` | **Yes** (so we use Brevo, not SendGrid) |
| `EMAIL_FROM` | Your “from” address, e.g. `notify@yourdomain.com` | **Yes** |
| `EMAIL_FROM_NAME` | Sender name, e.g. `Agchange` or your app name | Optional (has a default) |
| `EMAIL_DISABLED` | Leave **unset** or set to `false` | **Yes** (if set to `true`, no emails send) |

3. **Save** the variables.
4. **Trigger a new deploy**: **Deploys** → **Trigger deploy** → **Deploy site** (so the new env is used).

---

## 3. Verify your sender in Brevo

Brevo will only send from addresses/domains you’ve verified.

1. In Brevo: **Senders, Domains & Dedicated IPs** (or **Settings** → **Senders**).
2. Add and verify the **domain** you use in `EMAIL_FROM` (e.g. `yourdomain.com`).
3. Follow Brevo’s steps (add the DNS records they give you, then click **Verify**). Until the domain is verified, mail may not deliver or may go to spam.

If you don’t have a custom domain yet, you can try Brevo’s default sender first (they’ll show you the address) and set that exact address as `EMAIL_FROM` in Netlify — but for real use, a verified domain is better.

---

## 4. Confirm it’s working

**Option A – Admin test (if you have admin access)**  
- In your app, go to the **admin** area (e.g. **Dashboard** → **Admin** → **Notifications** or wherever the “Test email” action lives).  
- Use **Send test email** (or `POST /api/admin/test-email`).  
- Check the inbox (and spam) for the address you sent to.

**Option B – Real flow**  
- Trigger something that sends an email (e.g. “Send verification email” on account, place a bid, or complete an order step that sends a notification).  
- Check the recipient inbox and spam.

**Option C – Netlify logs**  
- **Netlify** → **Deploys** → latest deploy → **Functions** / **Logs**.  
- Trigger an action that should send an email, then search logs for `[email]` or `[send-verification-email]`.  
- If you see `provider: brevo` and no error, the app is using Brevo. If you see `not configured` or `provider: none`, `BREVO_API_KEY` or `EMAIL_PROVIDER` is missing or wrong.

---

## Summary checklist

- [ ] Brevo account created, API key copied.
- [ ] In Netlify: `BREVO_API_KEY`, `EMAIL_PROVIDER=brevo`, `EMAIL_FROM`, and (if needed) `EMAIL_FROM_NAME` set.
- [ ] `EMAIL_DISABLED` is not set to `true`.
- [ ] New deploy triggered after changing env.
- [ ] Sender/domain for `EMAIL_FROM` verified in Brevo.
- [ ] Test email or real flow checked (inbox + spam).

Once all of that is done, notification emails (verification, orders, bids, messages, etc.) go through Brevo and should work.
