## INTERNAL — Operations Runbook (Managers/Operators)

**Internal operating document — not marketing — not legal advice.**

**Scope:** Day-to-day operational procedures for Wildlife Exchange.

**Founder policy inputs required:** See `docs/internal/FOUNDER_INPUTS.md` for escalation chain, retention, MoR stance, and regulator inquiry SOP.

---

## 1) Golden rules (operator posture)

- Wildlife Exchange is a **technology marketplace only**; do not imply custody, transport coordination, or regulator approval.
- Use “**payout hold / delayed payout release**” language (do not use “escrow”).
- “Verified” = marketplace workflow review only (not regulator approval).

---

## 2) Payout release checklist (admin)

**Before releasing funds, confirm in Admin Ops / order details:**
- No open dispute and no chargeback safety block.
- No admin hold.
- Delivery marked + buyer confirmation (per current release eligibility rules).
- Required documents are uploaded and **verified** (policy-driven; whitetail TPWD transfer approval is required).
- If the order requires `adminPayoutApproval`, confirm the internal review is complete and approval is recorded.

**Emergency controls (optional; default OFF):**
- If `GLOBAL_PAYOUT_FREEZE_ENABLED=true`, payout release is paused platform-wide. (See `env.example`.)

---

## 3) Buyer dispute workflow (protected transactions)

1) Buyer opens dispute in the order flow (collects reason and evidence as applicable).
2) Operator verifies dispute is within relevant window and that evidence links/files are present.
3) Admin resolves dispute via admin tools:
   - Release payout (if appropriate), or
   - Refund (full/partial).

**Refund fee policy:** **FOUNDER POLICY REQUIRED** (see `docs/internal/FOUNDER_INPUTS.md`).

---

## 4) Seller compliance document rejection workflow

1) Review uploaded listing/order document in admin tooling.
2) If rejecting:
   - Provide a clear rejection reason.
   - Ensure the order remains blocked from payout release if the document is required by policy.
3) Communicate to the seller using support channels (do not imply regulator rejection/approval).

---

## 5) Chargeback workflow

1) Confirm whether Stripe dispute/chargeback is open.
2) Place `adminHold` if needed to prevent any release attempts.
3) Collect evidence and prepare response per internal SOP.

**SOP owner and process:** **FOUNDER POLICY REQUIRED** (see `docs/internal/FOUNDER_INPUTS.md`).

---

## 6) Auction monitoring checklist

Auctions depend on Netlify scheduled jobs. Confirm:
- Auction finalization runs.
- Unpaid auctions expire and relist as designed.
- Reservation cleanup runs (prevents deadlocks).

**Production monitoring/alerting owner:** **FOUNDER POLICY REQUIRED** (see `docs/internal/FOUNDER_INPUTS.md`).

---

## 7) Regulator inquiry handling (TPWD / TAHC / USDA / USFWS)

**FOUNDER POLICY REQUIRED** (see `docs/internal/FOUNDER_INPUTS.md`). This repo does not implement regulator notification automation.

---

## 8) Emergency operations

If a critical incident requires pausing payouts and/or checkout:
- Set environment flags (default OFF):
  - `GLOBAL_PAYOUT_FREEZE_ENABLED=true`
  - `GLOBAL_CHECKOUT_FREEZE_ENABLED=true`
- Follow internal communications rules and escalation chain.

**External comms rules:** **FOUNDER POLICY REQUIRED** (see `docs/internal/FOUNDER_INPUTS.md`).

