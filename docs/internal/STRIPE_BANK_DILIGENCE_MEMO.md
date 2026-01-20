## INTERNAL — Stripe / Banking Diligence Memo (Funds Flow + Controls)

**Internal operating document — not marketing — not legal advice.**

**Founder policy inputs required:** Merchant of Record stance and refund fee allocation policy are **FOUNDER POLICY REQUIRED** and must be completed in `docs/internal/FOUNDER_INPUTS.md`.

---

## 1) Funds flow (text diagram; evidence-based)

**Model implemented:** Platform collects funds first, then transfers to seller later (delayed payout release).

Text diagram:

- Buyer → Stripe Checkout (platform account)
- Funds settle to platform account (held for delayed payout release)
- After workflow gates pass → Admin triggers Stripe Transfer → Seller connected account

**Evidence (code):**
- Checkout session creation intentionally does not set `payment_intent_data.transfer_data`:
  - `app/api/stripe/checkout/create-session/route.ts:L787-L817`
- Payout release is performed by Stripe Transfer via shared release logic:
  - `lib/stripe/release-payment.ts:L60-L64`
  - `app/api/stripe/transfers/release/route.ts:L109-L121`

---

## 2) What blocks payout release (safety gates)

Payout release is blocked by:
- Open disputes / protected dispute status:
  - `lib/stripe/release-payment.ts:L99-L118`
- Active chargebacks:
  - `lib/stripe/release-payment.ts:L121-L137`
- Admin hold:
  - `lib/stripe/release-payment.ts:L139-L146`
- Protection window (if applicable):
  - `lib/stripe/release-payment.ts:L148-L155`

Compliance-related payout blocks:
- Whitetail breeder: verified `TPWD_TRANSFER_APPROVAL` required:
  - `lib/stripe/release-payment.ts:L166-L187`
- Policy-driven required verified docs and admin payout approval (exotics/livestock/horses):
  - `lib/stripe/release-payment.ts:L198-L251`
  - `lib/compliance/policy.ts:L65-L140`

---

## 3) Disputes / chargebacks handling (code surfaces)

Stripe webhook route verifies signatures and stores webhook event idempotency:
- `app/api/stripe/webhook/route.ts:L105-L151`
- `app/api/stripe/webhook/route.ts:L153-L207`

Charge dispute events are handled via webhook routing:
- `app/api/stripe/webhook/route.ts:L25-L30`, `L190-L199`

---

## 4) Refund implementation (NO policy assumptions)

**Current implementation:** refunds are created against the order’s Stripe PaymentIntent.
- `app/api/stripe/refunds/process/route.ts:L161-L177`

**Not present in current implementation:**
- reversing transfers
- refunding platform application fees
- explicit Stripe fee allocation logic

These items are **policy-controlled** and must be defined in `docs/internal/FOUNDER_INPUTS.md` (Refund fee allocation policy).

---

## 5) Merchant of Record (MoR)

**FOUNDER POLICY REQUIRED** (see `docs/internal/FOUNDER_INPUTS.md`).
This repo intentionally does not assert MoR in code comments or UI copy.

