## INTERNAL — Founder Inputs (Single Source of Truth)

**Internal operating document — not marketing — not legal advice.**

**Purpose:** This file captures **founder/counsel-provided policy and corporate facts** that are required for board/counsel/Stripe diligence but are **not inferable from code**.

**Rules**
- Do **not** paste secrets here.
- Use real names/emails only if this repo is private and access-controlled.
- If unknown, write: **COUNSEL TBD** or **FOUNDER TBD**.

---

## A) Corporate / Entity Facts (FOUNDER POLICY REQUIRED)

- **Legal entity name**: [FOUNDER TO FILL]
- **State of formation**: [FOUNDER TO FILL]
- **Registered agent**: [FOUNDER TO FILL]
- **Officers / Board list**: [FOUNDER TO FILL]
- **Counsel contact**: [FOUNDER TO FILL]
- **Official support email**: [FOUNDER TO FILL]
- **Mailing address**: [FOUNDER TO FILL]

---

## B) Merchant of Record (MoR) Stance (FOUNDER POLICY REQUIRED)

**Choose one (do not guess):**
- [ ] **Platform MoR**
- [ ] **Seller MoR**
- [ ] **COUNSEL TBD**

**Notes (required):**
- This is a **legal characterization** and must match Stripe setup and counsel advice.
- If COUNSEL TBD, document interim posture for diligence discussions and what is being validated with Stripe/counsel.

**MoR rationale + evidence pointer(s):**
- Rationale: [FOUNDER TO FILL]
- Stripe configuration evidence steps: [FOUNDER TO FILL] (e.g., which Stripe account, Connect configuration, account type)

---

## C) Refund Fee Allocation Policy (FOUNDER POLICY REQUIRED)

**Who absorbs Stripe processing fees on refunds?**
- [ ] Platform
- [ ] Seller
- [ ] Buyer
- [ ] Case-by-case

**Is the platform marketplace fee (5%) reversed on refunds?**
- [ ] Yes
- [ ] No
- [ ] Case-by-case

**Partial refunds fee treatment:**
- [FOUNDER TO FILL]

**Operator rules of thumb:**
- [FOUNDER TO FILL]

---

## D) Data Retention & Deletion Policy (FOUNDER POLICY REQUIRED)

**Retention periods**
- Orders: [FOUNDER TO FILL] (e.g., 7 years)
- Order documents (uploads): [FOUNDER TO FILL]
- Listing documents: [FOUNDER TO FILL]
- Audit logs: [FOUNDER TO FILL]
- Dispute evidence: [FOUNDER TO FILL]

**Deletion / DSAR workflow**
- What we can delete: [FOUNDER TO FILL]
- What we must retain: [FOUNDER TO FILL]
- How requests are received/verified/processed: [FOUNDER TO FILL]
- SLA targets: [FOUNDER TO FILL]

---

## E) Incident SOP + Regulator Inquiry SOP (FOUNDER POLICY REQUIRED)

**Incident owner role:** [FOUNDER TO FILL]

**Escalation chain**
- Primary: [FOUNDER TO FILL]
- Backup: [FOUNDER TO FILL]
- Counsel escalation: [FOUNDER TO FILL]

**Regulator inquiry workflow (TPWD / TAHC / USDA / USFWS)**
- Intake channel: [FOUNDER TO FILL]
- Who responds: [FOUNDER TO FILL]
- Evidence collection steps: [FOUNDER TO FILL]
- Communication rules: [FOUNDER TO FILL]

**Disease event playbook**
- Trigger criteria: [FOUNDER TO FILL]
- Immediate actions: [FOUNDER TO FILL]
- Marketplace communication policy: [FOUNDER TO FILL]

**Emergency comms rules**
- Who can communicate externally: [FOUNDER TO FILL]
- Required approvals: [FOUNDER TO FILL]

---

## F) Netlify Scheduled Jobs in Production (FOUNDER POLICY REQUIRED)

- **Are scheduled functions enabled in production?** [YES/NO/UNKNOWN — FOUNDER TO FILL]
- **Monitoring/alerting owner**: [FOUNDER TO FILL]
- **Where monitored** (Netlify UI / logs / Sentry): [FOUNDER TO FILL]
- **On-call expectations**: [FOUNDER TO FILL]

---

## G) Admin Governance (FOUNDER POLICY REQUIRED)

**Who can be `admin` vs `super_admin`**
- Eligibility rules: [FOUNDER TO FILL]
- Offboarding process: [FOUNDER TO FILL]

**Separation of duties**
- Is there a 2-person rule for payout release? [YES/NO/COUNSEL TBD]
- If yes: describe the workflow: [FOUNDER TO FILL]

**Approval requirements**
- For compliance-driven payout approvals (`adminPayoutApproval`): [FOUNDER TO FILL]
- For refunds above threshold: [FOUNDER TO FILL]

