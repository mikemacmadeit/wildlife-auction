# Text Message (SMS) Notifications Setup

SMS is **optional**. The app already has the pipeline: events create `smsJobs`, and a scheduled function sends them via **Twilio**. To enable SMS for users you need: Twilio account, env vars, cron running, and (optionally) the in-app SMS toggle.

---

## 1. Twilio account

1. Sign up at [twilio.com](https://www.twilio.com).
2. In **Console** → **Account** → **API keys & tokens**: note **Account SID** and **Auth Token**.
3. In **Phone Numbers** → **Manage** → **Active numbers**: buy or use a trial number. The number must be able to send SMS (e.g. +1 XXX XXX XXXX). Note the number in **E.164** (e.g. `+15551234567`).
4. **Trial accounts**: you can only send to verified numbers until you upgrade.

---

## 2. Environment variables

Set these **server-side only** (Netlify env vars, not `NEXT_PUBLIC_*`):

| Variable | Required | Description |
|----------|----------|-------------|
| `SMS_DISABLED` | No | Set to `true` to disable SMS globally (no Twilio calls). Omit or `false` to enable when Twilio is configured. |
| `TWILIO_ACCOUNT_SID` | Yes (if SMS enabled) | Twilio Account SID. |
| `TWILIO_AUTH_TOKEN` | Yes (if SMS enabled) | Twilio Auth Token. |
| `TWILIO_FROM` | Yes (if SMS enabled) | Your Twilio phone number in E.164 (e.g. `+15551234567`). |

**Netlify:** Site → Environment variables → Production (and Build if the scheduled function needs them at runtime) → Add each variable. Do **not** commit these.

**Local:** Add to `.env.local` (already in `.gitignore`). Example:

```bash
SMS_DISABLED=false
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM=+15551234567
```

---

## 3. Netlify scheduled function (cron)

SMS jobs are sent by **`dispatchSmsJobs`**, a Netlify scheduled function that runs **every 1 minute** (`*/1 * * * *`).

- **Location:** `netlify/functions/dispatchSmsJobs.ts`
- **Behavior:** Reads `smsJobs` with `status == 'queued'`, sends via `lib/sms/twilio.ts`, updates status to `sent` or requeues on failure.
- **Netlify:** Scheduled functions are supported by Netlify; no extra config in `netlify.toml` is required. Ensure the site has **Functions** enabled and that the build deploys the `netlify/functions` directory.

If you use a different host (e.g. Vercel), trigger the same logic on a 1‑minute cron by calling an API route that runs the same job-processing code, or run `dispatchSmsJobs` as a serverless function on a schedule.

---

## 4. User requirements for receiving SMS

A user gets SMS only if **all** of the following are true:

1. **Phone number on profile**  
   Stored in Firestore at `users/{uid}.phoneNumber`. Users set this under **Dashboard → Account → Profile** (Phone Number). Must be a valid number (E.164 or at least 10 digits); the system normalizes to E.164 when creating jobs.

2. **SMS channel enabled in preferences**  
   Stored at `users/{uid}/notificationPreferences/default` with `channels.sms === true`. Users can turn this on in **Dashboard → Account → Notifications** (SMS toggle). If the toggle is missing, add it in `components/settings/NotificationPreferencesPanel.tsx` (see below).

3. **Event type supports SMS**  
   Notification rules in `lib/notifications/rules.ts` define which event types allow SMS (e.g. order updates, delivery, SLA reminders). Those events create `smsJobs` when the user has phone + SMS enabled.

4. **SMS not disabled globally**  
   Env: `SMS_DISABLED` is not `true`, and Twilio env vars are set. If Twilio is missing, `sendSmsTwilio` returns an error and jobs are requeued (and eventually dead-lettered after max attempts).

---

## 5. What gets sent as SMS

SMS body is built in `lib/notifications/processEvent.ts` (`buildSmsBody`) per event type, e.g.:

- Order confirmed, preparing, in transit, delivered, delivery check-in, receipt confirmed
- Delivery scheduled/agreed, address set, tracking started/stopped
- Pickup ready/window agreed/confirmed
- SLA approaching, review request/received
- Message received (if rule includes SMS)
- Auction/offer events that have SMS in the rule

Bodies are short and include a link (e.g. `orderUrl`) when available. Body length is capped (e.g. 1500 chars) when sending via Twilio.

---

## 6. Monitoring and failures

- **smsJobs:** Firestore collection `smsJobs`. Fields include `status` (`queued` | `processing` | `sent` | `failed`), `toPhone`, `body`, `attempts`, `error`.
- **Dead letters:** After max attempts, jobs are copied to `smsJobDeadLetters` for inspection. Admin can surface these in a support/ops view if desired.
- **Logs:** `dispatchSmsJobs` and `sendSmsTwilio` log send results and errors. Check Netlify function logs for the `dispatchSmsJobs` invocations.

---

## 7. Optional: SMS toggle in the UI

The data model already supports `channels.sms` in notification preferences. If **NotificationPreferencesPanel** does not show an SMS toggle:

1. In `components/settings/NotificationPreferencesPanel.tsx`, in the “Channels” section (where Email and Push are), add a row for **SMS**:
   - Label: e.g. “Text message (SMS)”
   - Description: “Order and delivery updates via text. Requires a phone number in your profile.”
   - `Switch` bound to `prefs.channels.sms` and `onCheckedChange` updating `prefs.channels.sms`.
2. Optionally disable the SMS switch when the user has no `phoneNumber` in their profile and show a short message: “Add a phone number in Profile to receive SMS.”

After this, users can opt in to SMS from **Account → Notifications**; the backend will create `smsJobs` when their phone is set and SMS is enabled.

---

## 8. Quick checklist

- [ ] Twilio account created; Account SID, Auth Token, and a phone number (E.164) noted.
- [ ] Env vars set: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`; `SMS_DISABLED` unset or `false`.
- [ ] Netlify (or your host) runs the scheduled function that processes `smsJobs` (e.g. `dispatchSmsJobs` every 1 minute).
- [ ] Users have phone number on profile and SMS enabled in notification preferences (and UI toggle added if it was missing).
- [ ] Test: trigger an event that creates an SMS (e.g. order update), confirm `smsJobs` doc created and then `status: 'sent'`, and that the phone receives the text.

---

---

## 9. Enable and tune once Twilio A2P is approved

SMS pipeline and UI are in place. **Enable and tune once Twilio A2P (Application-to-Person) registration is approved** so high-volume or promotional SMS (e.g. “order shipped,” “delivery tomorrow,” auction ending soon) can be sent reliably and stay within carrier guidelines.

1. **A2P registration**  
   Complete Twilio’s A2P 10DLC (US) or equivalent registration for your brand and use case. Until approved, keep volume low or use only for transactional (e.g. OTP, order status) if allowed by your plan.

2. **Tuning after approval**  
   - **Rules:** In `lib/notifications/rules.ts`, ensure event types that should trigger SMS have `channels.sms` enabled (e.g. order/delivery, auction ending soon, messages).  
   - **Bodies:** In `lib/notifications/processEvent.ts` (`buildSmsBody`), keep bodies short and include opt-out where required.  
   - **Rate:** `netlify/functions/dispatchSmsJobs.ts` processes queued jobs every minute; tune batch size or frequency if needed to stay within Twilio/carrier limits.  
   - **Preferences:** Users must have phone number set and SMS enabled in notification preferences; the UI toggle is in Dashboard → Account → Notifications.

3. **Monitoring**  
   Use `smsJobs` and `smsJobDeadLetters` in Firestore to monitor send success and failures; fix invalid numbers or carrier rejections (e.g. A2P compliance) as needed.

---

**References**

- Twilio SMS: `lib/sms/twilio.ts`
- SMS job creation: `lib/notifications/processEvent.ts` (sms jobs block)
- SMS job dispatch: `netlify/functions/dispatchSmsJobs.ts`
- Notification rules (which events allow SMS): `lib/notifications/rules.ts`
- Env example: `env.example` (SMS section)
