## INTERNAL — Refund Policy (Operational; Evidence + Founder Choices)

**Internal operating document — not marketing — not legal advice.**

This document records:
- what refunds do **today** in code, and
- founder/counsel policy choices that are **not in repo**.

---

## 1) What is implemented (evidence-based)

**Refunds are processed by an admin-only endpoint** that:
- verifies admin role
- creates a Stripe refund against the order’s PaymentIntent
- updates the order status to `refunded` (full) or `completed` (partial)

Evidence:
- `app/api/stripe/refunds/process/route.ts:L78-L91` (admin role check)
- `app/api/stripe/refunds/process/route.ts:L161-L177` (Stripe refund creation)
- `app/api/stripe/refunds/process/route.ts:L186-L200` (order status update logic)

---

## 2) What is NOT present in repo (must be a policy decision)

Not present in current implementation:
- reversing a previously created Stripe Transfer
- refunding “application fees” (no `refund_application_fee` logic present)
- a defined policy for who absorbs Stripe processing fees

---

## 3) Founder policy required

Complete policy in:
- `docs/internal/FOUNDER_INPUTS.md` → “C) Refund Fee Allocation Policy”

