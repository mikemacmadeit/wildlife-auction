# Wildlife Exchange — Executive Summary (Internal; 1–2 pages)

**Internal operating document — not marketing — not legal advice.**

**Founder policy inputs:** Certain corporate/legal/policy items are not inferable from code. See:
- `docs/internal/FOUNDER_INPUTS.md`

**Purpose of this summary:** provide leadership/board/counsel a factual, code-backed snapshot of what the platform is, how it avoids broker/shipper/custody posture, and the highest-risk residual gaps requiring operational governance.

---

## 1) What the platform is (and is not)

Wildlife Exchange is a **technology marketplace** that provides software for:
- users to create listings and communicate, and
- payments to be processed via Stripe with marketplace workflow holds.

It is explicitly **not** the seller, dealer, broker, agent, or auctioneer, does not take title/custody/control of animals or goods, and does not arrange transport.  
- Evidence: `app/terms/page.tsx:L30-L36`, `app/terms/page.tsx:L64-L68`, `app/terms/page.tsx:L162-L169`

The platform also scopes any “Verified” labeling to **marketplace workflow completeness** and explicitly states it is **not regulator approval**.  
- Evidence: `app/terms/page.tsx:L34-L36`

---

## 2) Texas-only animal marketplace posture

The Terms state: **all animal transactions are Texas-only**; the platform may apply geographic restrictions and workflow checks.  
- Evidence: `app/terms/page.tsx:L100-L110`

Texas-only enforcement exists in the **money path**:
- Checkout creation blocks if the listing is not TX and/or the buyer’s profile state is not TX (for texasOnly categories).  
  - Evidence: `app/api/stripe/checkout/create-session/route.ts:L368-L400`
- Stripe webhook processing for texasOnly categories attempts to verify the buyer’s state via Stripe session/payment data and triggers a TX-only violation path (refund for card flows; deferred handling for async rails).  
  - Evidence: `app/api/stripe/webhook/handlers.ts:L148-L229`

**Leadership implication:** the strongest “Texas-only” control is already in the most defensible place: **checkout + webhook** (the money path).

---

## 3) Compliance enforcement: documents + payout holds (not a custody/intermediary service)

The platform’s control model is:
- allow buyer/seller to contract directly (platform not party),
- require certain acknowledgments (seller/buyer) before publish/checkout,
- require compliance documents to be uploaded and **verified** for workflow completeness (admin),
- hold payout release until workflow conditions are satisfied.

The Terms explicitly state the platform may hold/release funds for workflow rules and that this is about settlement only (not custody of animals/goods).  
- Evidence: `app/terms/page.tsx:L214-L218`

Payout movement is explicitly gated in the shared release function:
- blocks on open disputes/chargebacks/admin holds and already-released states,  
  - Evidence: `lib/stripe/release-payment.ts:L35-L45`, `lib/stripe/release-payment.ts:L103-L137`
- enforces whitetail TPWD transfer approval doc verification before payout release,  
  - Evidence: `lib/stripe/release-payment.ts:L148-L176`
- enforces policy-driven doc requirements and admin payout approval for certain categories/species.  
  - Evidence: `lib/stripe/release-payment.ts:L189-L239`, `lib/compliance/policy.ts:L65-L149`

Manual payout release is admin-only and audited:
- Evidence: `app/api/admin/orders/[orderId]/release/route.ts:L54-L86`

**Why this is not a custody/intermediary service (internal framing):**
- the platform’s role is payment processing + settlement timing controls and workflow gating; it does not become a party to the buyer–seller contract and disclaims custody/transport.  
  - Evidence: `app/terms/page.tsx:L74-L85`, `app/terms/page.tsx:L162-L169`, `app/terms/page.tsx:L214-L218`

---

## 4) Category policy snapshot (what’s enforceable today)

The compliance policy module defines required payout docs and admin approval requirements:
- Whitetail breeder: requires verified `TPWD_TRANSFER_APPROVAL` (and listing always requires review).  
  - Evidence: `lib/compliance/policy.ts:L73-L80`, `lib/compliance/validation.ts:L496-L500`
- Wildlife exotics: requires verified `TAHC_CVI` for payout; certain species require admin payout approval (cervids / ESA/CITES overlay / other_exotic).  
  - Evidence: `lib/compliance/policy.ts:L100-L139`
- Cattle: requires verified `TAHC_CVI` for payout.  
  - Evidence: `lib/compliance/policy.ts:L91-L98`
- Horse: bill of sale required at checkout; `TAHC_CVI` required for payout by policy.  
  - Evidence: checkout enforcement `app/api/stripe/checkout/create-session/route.ts:L719-L777`; payout policy `lib/compliance/policy.ts:L91-L98`

---

## 5) Operational auditability

Critical actions are logged into Firestore `auditLogs` (payout releases, disputes, delivery confirmations, admin compliance actions).  
- Evidence: `lib/audit/logger.ts:L41-L105`, `lib/audit/logger.ts:L129-L171`

Documents are stored in Firebase Storage with restricted access (not public) and metadata in Firestore subcollections:
- Storage rules: `storage.rules:L52-L91`
- Firestore rules for doc metadata: `firestore.rules:L262-L292`, `firestore.rules:L476-L515`

---

## 6) Highest-risk gaps to address (internal, not sugarcoated)

1) **Operational policy vs technical enforcement mismatch risk**  
   The code properly scopes “Verified” and avoids transport/custody claims, but ongoing copy governance and operator behavior must remain consistent to avoid broker/shipper/custody appearance risk.  
   - Evidence of posture statement: `app/terms/page.tsx:L30-L36`, `app/terms/page.tsx:L162-L169`

2) **Upstash/Redis rate limiting configuration is not documented in env.example**  
   The code expects `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and can fail closed (503) for sensitive endpoints in Netlify runtime if missing, but the env example does not include those keys.  
   - Evidence of required env read: `lib/rate-limit.ts:L33-L35`  
   - Evidence of fail-closed behavior: `lib/rate-limit.ts:L122-L132`

3) **Sold/expired listing transition mapping not fully documented here**  
   The listing lifecycle includes `sold` and `expired`, but authoritative setters (webhook/auction finalization) require a specific internal mapping review.  
   - Evidence of status set existence: `lib/types.ts:L15`  
   - Evidence of checkout gating on listing statuses: `app/api/stripe/checkout/create-session/route.ts:L257-L267`

4) **Founder-approved incident SOP is required** (disease outbreaks, regulator requests, high-severity fraud)  
   The platform has strong logs and doc stores, but an SOP is not inferable from code.  
   - Evidence of available logs: `lib/audit/logger.ts:L176-L205`

---

## 7) Leadership action items (next 30 days)

1) Approve and publish an internal SOP: regulator inquiry handling + disease incident protocol + retention policy. (**Input required from founder/counsel**)  
2) Ensure production env includes Upstash Redis credentials (or accept fail-closed behavior for sensitive endpoints).  
3) Conduct a short “sold/expired lifecycle” mapping exercise and add citations to the operating document.

