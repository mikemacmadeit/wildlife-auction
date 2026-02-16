# Why notification emails work but verification email might not

Both use the **same** SendGrid (or Brevo) pipeline: `sendEmailHtml()` in `lib/email/sender.ts`. The difference is **who triggers the send** and **what happens when the API fails**.

---

## Notification emails (order, bid, delivery, etc.)

**Flow (100% server-side):**

1. Something happens **on the server**: Stripe webhook, order accepted, bid placed, delivery confirmed, etc.
2. That code runs in an **API route or Netlify function** (e.g. `app/api/stripe/webhook/`, `app/api/orders/.../accept/`, `netlify/functions/dispatchEmailJobs.ts`).
3. The handler has Firestore (`getAdminDb()`) and calls `tryDispatchEmailJobNow()` or `emitAndProcessEventForUser()` → which eventually calls `renderEmail()` + `sendEmailHtml()`.
4. **No browser, no user token.** The same serverless function that handled the webhook/request sends the email via SendGrid. Env vars (SENDGRID_API_KEY, etc.) are available there.

So notification emails **always** go through your configured provider (SendGrid) as long as that code path runs and env is set.

---

## Verification email

**Flow (client → API → SendGrid or fallback):**

1. The **user** clicks “Send verification email” or “Resend” in the browser.
2. The **client** calls `POST /api/auth/send-verification-email` with `Authorization: Bearer <user id token>`.
3. The **Next.js API route** (`app/api/auth/send-verification-email/route.ts`) runs and must:
   - `getAdminAuth()` (Firebase Admin) — if this throws → **503**
   - `auth.verifyIdToken(token)` — if this fails → **401**
   - `auth.getUser(uid)` and `auth.generateEmailVerificationLink(email, ...)` — need Firebase Admin
   - `isEmailEnabled()` and `sendEmailHtml(...)` — need SendGrid env
4. If the API returns **200** and `{ ok: true }`, the email was sent via SendGrid (same as notifications).
5. If the API returns **401**, **503**, or **500**, the **client** does **not** show an error. It falls back to **Firebase** `sendEmailVerification()` and shows “Verification email sent (via Firebase)”. So the user sees “sent” but the email might be going through **Firebase**, not SendGrid — and Firebase may not deliver (e.g. domain not in authorized domains, or different sender/spam).

So verification can “work” in the UI (user sees “sent”) but actually be sent by **Firebase**, not SendGrid. Notification emails don’t have that fallback; they only go through SendGrid.

---

## What to check

### You don’t have to use Netlify logs

On Netlify with **Next.js**, `/api/*` routes don’t show up as named “Functions” in the Netlify UI. Their logs are mixed into the **Next.js serverless** runtime. So “Functions” in the dashboard is confusing and often empty or shows different things.

**Easier: use what the app already shows**

- If the user sees **“Verification email sent (via Firebase)”** → the **API did not send**; the app fell back to Firebase. So your SendGrid path wasn’t used (API failed or returned 503/401).
- If the user sees **“Verification email sent”** (no “via Firebase”) → the **API succeeded** and sent via SendGrid. If the email still doesn’t arrive, the issue is delivery (SendGrid, spam, from address).

So you can tell which path was used **without** looking at Netlify.

### If you still want to check Netlify logs

1. Netlify dashboard → your site → **Logs** (or **Real-time logs** / **Function log**).
2. Trigger “Send verification email” in the app, then in the log stream search for **`send-verification-email`** or **`[send-verification-email]`**.
3. Logs from Next.js API routes may appear under a generated function name (e.g. `___netlify-*`) or in the same stream as page requests. If you don’t see anything, the request may be logged under a different label — that’s why relying on the in-app message (“via Firebase” vs not) is simpler.

2. **Same env**  
   Notification and verification both use `sendEmailHtml()` and thus the same env (SENDGRID_API_KEY, EMAIL_PROVIDER, EMAIL_FROM). So if notifications work, env is fine for sending. The only extra requirement for verification is that the **verification API route** runs successfully (Firebase Admin + token verification + `generateEmailVerificationLink`).

3. **Optional: remove fallback for debugging**  
   To confirm whether the API is failing, you could temporarily show an error when the API returns 503/401 instead of falling back to Firebase (e.g. “Verification email service unavailable. Try again later.”). That would make it obvious when the API path isn’t used.

---

## Summary

| | Notification emails | Verification email |
|---|---------------------|---------------------|
| **Trigger** | Server (webhook, API, cron) | Client (user clicks “Send”) |
| **Path** | Server → sendEmailHtml (SendGrid) | Client → API → sendEmailHtml (SendGrid) **or** API fails → client → Firebase |
| **Uses SendGrid?** | Yes (no fallback) | Only if API returns 200; otherwise client uses Firebase |
| **Same code for sending?** | Yes (`sendEmailHtml`) | Yes (same when API succeeds) |

So: notification emails work because they’re sent entirely on the server with SendGrid. Verification can appear to “work” (message sent) but actually be sent by Firebase if the verification API fails (503/401/500). **You don’t need Netlify logs:** if the user sees “Verification email sent **(via Firebase)**”, the API path didn’t run and SendGrid wasn’t used; if they see “Verification email sent” with no “via Firebase”, the API sent via SendGrid.
