# Launch To-Do — Simple List

**This is your checklist for when you go live.** We already did the audits (security, sidebar, docs). The items below are things only you can do: set env in Netlify, create the webhook in Stripe, run `firebase deploy`, and test on your production site. If you’ve already done some, just check them off.

Details: `docs/PRE_LAUNCH_CHECKLIST.md`.

---

## Before launch

**1. Netlify production env**

- [ ] Firebase (client + Admin) set
- [ ] Stripe **live** keys + **live** webhook secret (no `sk_test_` / `pk_test_`)
- [ ] Upstash Redis URL + token
- [ ] Email: Brevo or Resend (for orders/notifications)
- [ ] If your domain isn’t agchange.app: set `NEXT_PUBLIC_SITE_URL`
- [ ] Optional: Sentry DSN

**2. Stripe live webhook**

- [ ] Stripe Dashboard (Live mode) → Webhooks → Add endpoint
- [ ] URL: `https://YOUR-DOMAIN/api/stripe/webhook`
- [ ] Subscribe required events (checkout, payment_intent, disputes, subscriptions, invoices — see `docs/PRE_LAUNCH_CHECKLIST.md` for full list)
- [ ] Copy signing secret → set as `STRIPE_WEBHOOK_SECRET` in Netlify
- [ ] Send test webhook → confirm 200 in Netlify logs

**3. Firebase**

- [ ] `firebase deploy --only firestore:indexes`
- [ ] `firebase deploy --only firestore:rules`
- [ ] `firebase deploy --only storage`

**4. Security**

- [ ] Run through `SECURITY_AUDIT_CHECKLIST.md` and tick items
- [ ] Run `npm audit`; fix or accept high/critical
- [ ] Confirm no secret files committed (`.env*.local`, service account JSON in `.gitignore`)

**5. Legal**

- [ ] Terms, Privacy, Seller Policy, Marketplace Policies, Buyer Acknowledgment are live and linked (footer / signup)
- [ ] Test: new user → `/legal/accept` → accept → dashboard

**6. After deploy**

- [ ] Admin → System Health: Firestore, Redis, Stripe, index checks all OK
- [ ] Run first Firestore backup (see `docs/runbooks/firestore-backups.md`)

---

## Test on live (one full pass)

On your **production URL** with **live Stripe**:

- [ ] Sign up → accept legal → dashboard
- [ ] Create listing (draft → submit → approve if used) → confirm it’s live
- [ ] Buy it (or win auction) → complete payment → order shows in Dashboard and seller sales
- [ ] Stripe Dashboard → Webhooks → latest event is 200; System Health shows recent webhook
- [ ] Admin: System Health green; open a user dossier; add a note; confirm audit trail
- [ ] Seller: Stripe Connect → complete → list and sell
- [ ] Dispute: open → add evidence → resolve; emails use production domain

---

## Day of launch (quick check)

- [ ] Production env set; no test Stripe keys
- [ ] Live webhook URL + secret; test event returns 200
- [ ] Firebase indexes + Firestore rules + Storage rules deployed
- [ ] System Health all green (Firestore, Redis, Stripe, indexes)
- [ ] One full flow done on live: sign up → list → buy → order visible; webhook 200
- [ ] Legal pages linked; legal accept works
- [ ] No “Lorem” or wrong support email on the site

---

*More detail: `docs/PRE_LAUNCH_CHECKLIST.md`. Payment tests: `VERIFICATION_CHECKLIST_PAYMENTS.md`. Security: `SECURITY_AUDIT_CHECKLIST.md`, `docs/SECURITY_AUDIT_REPORT.md`.*
