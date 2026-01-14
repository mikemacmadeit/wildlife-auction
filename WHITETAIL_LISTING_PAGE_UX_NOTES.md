## Whitetail Breeder Listing Page UX (Disclosures & Terminology)

Scope: **UI/UX only** for `whitetail_breeder` listing detail pages. No enforcement logic changes.

### Changes
- **`project/app/listing/[id]/page.tsx`**
  - Added **Transfer & Legal Requirements** card (whitetail-only) near Purchase Options:
    - payment ≠ legal transfer
    - TPWD Transfer Approval required (tooltip)
    - escrow/payout gating explanation
    - coordination language (pickup/transfer)
    - explicit marketplace disclaimer (WE not seller/transporter)
    - “No hunting/tags/licenses” note
    - link to `Trust & Compliance` page: `/trust#whitetail`
  - Replaced **“Shipping”** wording with **Transfer** wording for whitetail-only:
    - “Shipping & Payment” → “Transfer & Payment”
    - “Shipping Options” → “Transfer & Pickup”
    - Body copy avoids implying parcel shipping/platform-arranged transport

- **`project/components/compliance/TrustBadges.tsx`** (exported component is `ComplianceBadges`)
  - Whitetail-only clarification:
    - “TPWD Breeder Permit: Verified” label
    - Tooltip explaining “Verified” (admin reviewed uploaded permit; does not authorize transfer)
    - “Texas-only: TX residents only”
    - Fine print: Transfer Approval required before payout/delivery

- **`project/app/trust/page.tsx`**
  - Added anchor `id="whitetail"` on the TPWD Breeder Permit badge section to support deep links from listings.

### Acceptance checklist
- Whitetail listing page clearly states: **payment ≠ transfer**, **Transfer Approval required**, **escrow/payout gated**, **WE is not seller/transporter**.
- Whitetail listing page avoids “shipping” terminology (uses Transfer language).
- Trust badges clarify permit verification vs transfer approval.
*** End Patch}"}]}<commentary to=functions.apply_patch  微信上的天天中彩票 to=functions.apply_patch  大发快三计划 freeform code is here: number
