# Payment Processor Brief — Wildlife Exchange (Agchange)

**Purpose:** Provide a high-risk payment processor or acquirer with a clear, evidence-based description of the business, funds flow, and risk controls so they can evaluate underwriting.

**Audience:** Underwriting, risk, or compliance at a payment processor or bank.  
**Source:** Derived from this repository (code, terms, and internal docs). Not legal advice.

---

## 1. What We Are (Business Description)

**Wildlife Exchange** (brand: Agchange) is a **Texas-only B2B marketplace** for:

- **Registered livestock and ranch exotics** — axis, fallow, elk, blackbuck, aoudad, nilgai, and similar species raised on permitted Texas ranches (not wild-caught wildlife).
- **Whitetail breeder deer** — TPWD-permitted breeder operations.
- **Cattle, horses, working dogs,** and **ranch equipment**.

We are a **technology platform only**. We are **not** the seller, dealer, broker, agent, or auctioneer. We do **not** take title, custody, possession, or control of animals or goods. We do **not** arrange transport. Buyers and sellers contract directly; we provide listing, messaging, and payment software.

**Suggested one-liner for applications:**  
*“Texas-only marketplace for registered livestock, horses, TPWD-permitted whitetail breeder deer, ranch exotics (axis, fallow, elk, etc.), and ranch assets. Technology platform only; no custody or transport.”*

---

## 2. Funds Flow — We Do Not Hold Funds

We use **Stripe Connect destination charges**. This is important for underwriting:

| Aspect | Implementation |
|--------|----------------|
| **Who gets paid** | On each payment, **the seller’s share goes directly to the seller’s Stripe Connect Express account**. The **platform fee** (e.g. 5–10%) goes to the platform Stripe account. |
| **Fund custody** | The platform **never** receives the full payment and **never** performs a “release” or transfer to the seller. Sellers are paid at payment time by Stripe. |
| **Post-payment movement** | The only post-payment movement is **refunds** (full or partial), via Stripe’s refund API. |

**Evidence in code:**  
- Checkout: `app/api/stripe/checkout/create-session/route.ts` — `payment_intent_data.transfer_data.destination` (seller Connect account) and `application_fee_amount` (platform fee).  
- Wire (bank transfer): `app/api/stripe/wire/create-intent/route.ts` — same destination-charge pattern.  
- No “payout release” flow: the platform does not call `stripe.transfers.create` to move funds to sellers.

**Why this matters for processors:**  
Lower custody and settlement risk; we are not an escrow or money transmitter holding buyer funds before release to sellers.

---

## 3. Risk Controls

### 3.1 Geographic and category scope

- **Texas-only for animals:** Terms and checkout enforce that animal transactions are Texas-only. Checkout and webhook validate buyer/seller state and listing category; non-Texas animal checkout is blocked.  
- **Content and category rules:** Listings are categorized (e.g. wildlife_exotics, cattle_livestock, ranch_equipment). Prohibited keywords and content checks run before publish and checkout.

### 3.2 Seller onboarding (KYC / payouts)

- Sellers receive payouts via **Stripe Connect Express**. They complete Stripe’s onboarding (identity, bank details). We do not process payouts until Stripe reports `payoutsEnabled` and `chargesEnabled` for the connected account.  
- Checkout and wire flows validate that the seller’s Connect account exists and is payout-ready before creating a session or PaymentIntent.

### 3.3 Compliance and documentation

- **Whitetail breeder:** TPWD transfer approval documentation is required and verified before listing/sale workflow; policy and validation live in the compliance module.  
- **Other categories:** Policy-driven requirements (e.g. TAHC CVI, bills of sale) and admin verification are used for workflow completeness.  
- Documents are stored in Firebase Storage with access controls; document metadata is in Firestore with rules restricting access.

### 3.4 Disputes and chargebacks

- Stripe webhooks are **signature-verified** and processed with **idempotency** (event ID) to avoid duplicate handling.  
- We handle Stripe dispute events: `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`.  
- Dispute/chargeback state is written to Firestore (e.g. `chargebacks` collection, order fields such as `chargebackStatus`, `payoutHoldReason`). With destination charges, the seller already has the funds; chargebacks are handled via Stripe’s dispute process and refunds where appropriate.

### 3.5 Refunds

- Refunds are issued via Stripe’s refund API against the order’s PaymentIntent. Admin-only refund flows exist; no automated release of “held” funds (because we do not hold seller funds).

### 3.6 Auditability

- Critical actions (e.g. refunds, dispute state changes, admin actions) are logged to Firestore `auditLogs` with action type, order ID, and actor.  
- Audit action types are defined in code (e.g. refund_full, refund_partial, dispute_opened, chargeback_created, admin_hold_placed).

### 3.7 Rate limiting and abuse

- Sensitive endpoints (checkout, bids, admin, messages, support, etc.) are protected by rate limiting. In production (e.g. Netlify), we use **Upstash Redis**; if Redis is not configured in that environment, the code can fail closed (503) for those endpoints to avoid running without rate limits.

### 3.8 Terms and “Verified” meaning

- Terms state clearly: we are a technology marketplace only; we do not take custody; “Verified” means document review for **marketplace workflow completeness**, not regulator approval.  
- Evidence: `app/terms/page.tsx` — marketplace-only status, no custody, Texas-only animal transactions, and verified-label disclaimer.

---

## 4. Technical Summary (for security/risk review)

| Area | Detail |
|------|--------|
| **Payments** | Stripe Connect Express, destination charges, application fee. Card (Checkout) and wire (PaymentIntent with same pattern). |
| **Auth** | Firebase Authentication (email/password, OAuth). Admin and API routes use server-side Firebase Admin. |
| **Data** | Firestore (metadata, orders, listings, audit logs); Firebase Storage (documents, images). Security rules restrict read/write by role and resource. |
| **Webhooks** | Stripe webhook route verifies `Stripe-Signature`, parses body once, handles events (checkout.session.completed, payment_intent.*, charge.dispute.*, account.updated, etc.). |
| **Environment** | Stripe (secret, publishable, webhook secret), Firebase Admin, and in production Upstash Redis are required for core and rate-limited routes; missing config returns 503. |

---

## 5. What We Do Not Do

- We do **not** hold buyer funds in escrow or release them later to sellers; sellers are paid at payment time via Stripe.  
- We do **not** take title, custody, or control of animals or goods.  
- We do **not** represent that “Verified” is a regulator or government approval.  
- We do **not** allow checkout for prohibited content; listing and checkout validation block restricted categories/keywords.

---

## 6. Suggested Use

- **Application / questionnaire:** Use Section 1 (business description) and the one-liner; add Section 2 (funds flow) if they ask about fund handling.  
- **Underwriting / risk:** Share Sections 2–4 (funds flow, risk controls, technical summary).  
- **Compliance follow-up:** Point to Terms (`/terms`), this brief, and internal docs (e.g. `docs/internal/STRIPE_SUBMISSION_FRAMING.md`, `docs/internal/WILDLIFE_EXCHANGE_EXECUTIVE_SUMMARY.md`) for consistent framing.

If the processor uses “wildlife” or “exotic” as trigger terms, emphasize: **Texas-only**, **registered livestock / ranch exotics on permitted ranches**, and **technology platform only—no custody, no transport**. Listing examples should be ranch livestock and permitted species (e.g. axis, fallow, elk), not wild-caught or prohibited species.
