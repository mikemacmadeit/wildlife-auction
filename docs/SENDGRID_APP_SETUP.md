# Get SendGrid working with the app

Your SendGrid trial is active (6 sent, 100% delivered). To have the **app** send all notification emails through SendGrid, do the following.

---

## 1. Create a SendGrid API key (if you don’t have one)

1. In SendGrid: **Settings** (gear) → **API Keys**.
2. **Create API Key**.
3. Name it (e.g. `Agchange production`).
4. Permissions: **Restricted** → enable **Mail Send** → **Create & View** (or **Full Access** for simplicity).
5. **Create & View**. Copy the key **once** (it won’t be shown again). You’ll paste it in Netlify next.

---

## 2. Sender identity in SendGrid

The app sends from the address in `EMAIL_FROM`. SendGrid only sends from verified senders.

**Option A – Single Sender (quick for trial)**  
1. **Settings** → **Sender Authentication** → **Single Sender Verification**.  
2. Add a sender: use the **exact** email you want as “From” (e.g. `notify@yourdomain.com` or the address SendGrid suggests for testing).  
3. Complete verification (click the link in the email SendGrid sends).

**Option B – Domain authentication (better for production)**  
1. **Settings** → **Sender Authentication** → **Authenticate Your Domain**.  
2. Add your domain, then add the **CNAME records** SendGrid shows to your DNS.  
3. Click **Verify** in SendGrid.

Use the same address/domain in the app’s `EMAIL_FROM` (step 3).

---

## 3. Set environment variables (Netlify)

So the app uses SendGrid instead of Brevo:

1. **Netlify** → your site → **Site configuration** → **Environment variables**.
2. Add or edit:

| Variable | Value | Required |
|----------|--------|----------|
| `EMAIL_PROVIDER` | `sendgrid` | **Yes** – forces the app to use SendGrid. |
| `SENDGRID_API_KEY` | The API key you created in step 1 | **Yes** |
| `EMAIL_FROM` | The **exact** verified sender email (e.g. `notify@yourdomain.com`) | **Yes** |
| `EMAIL_FROM_NAME` | Sender name (e.g. `Agchange`) | Optional |
| `EMAIL_REPLY_TO` | Reply address (e.g. `support@yourdomain.com`) | Optional |
| `EMAIL_DISABLED` | Leave unset or `false` | **Yes** |

3. If you had **Brevo** as the provider before, you can leave `BREVO_API_KEY` set; the app will ignore it when `EMAIL_PROVIDER=sendgrid`.

4. **Save**, then trigger a new deploy: **Deploys** → **Trigger deploy** → **Deploy site**.

---

## 4. Confirm it’s working

- **In the app:** Trigger something that sends email (e.g. “Send verification email”, place a bid, complete an order step). Check the recipient inbox (and spam).
- **SendGrid dashboard:** **Activity** should show new “Processed” / “Delivered” entries for those sends.
- **Admin test (if you have admin):** Use the “Send test email” action (or `POST /api/admin/test-email` with admin auth). Check the `to` inbox and SendGrid Activity.

If no emails appear in Activity, the app is still using another provider or the API key/env aren’t in effect: double-check `EMAIL_PROVIDER=sendgrid` and `SENDGRID_API_KEY` in Netlify and redeploy.

---

## Summary

| Where | What to do |
|-------|-------------|
| **SendGrid** | Create API key (Mail Send). Verify one sender (single sender or domain). |
| **Netlify** | Set `EMAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY`, `EMAIL_FROM` (and optionally `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`). Redeploy. |
| **App** | No code changes; it already uses SendGrid when the env is set. |

Your trial ends **March 23, 2026**. Before then you can upgrade in SendGrid or switch the app back to Brevo/Resend by changing `EMAIL_PROVIDER` and the corresponding API key in Netlify.
