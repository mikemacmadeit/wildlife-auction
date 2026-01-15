## Phase 9 — Exposure Plans (Standard / Priority / Premier)

### Goal
- **Flat marketplace fee**: 5% for all sellers and categories (no fee discounts).
- **Optional subscriptions** for exposure/badges/priority only:
  - **Standard Seller** (Free)
  - **Priority Seller** ($99/mo)
  - **Premier Seller** ($299/mo)
- **No listing limits** (Standard sellers are not blocked from listing/selling).
- **No compliance implication**: tier badges do **not** imply regulatory/compliance approval.

---

## Key implementation notes

### Data model
- Added canonical user field: `users/{uid}.subscriptionTier: 'standard' | 'priority' | 'premier'`
- Backward compatibility:
  - `subscriptionPlan` (legacy) is still read/written where needed and mapped:
    - `free -> standard`
    - `pro -> priority`
    - `elite -> premier`

### Stripe subscriptions
- `/api/stripe/subscriptions/create` now accepts `priority|premier` (and legacy `pro|elite`).
- Env vars:
  - Preferred: `STRIPE_PRICE_ID_PRIORITY`, `STRIPE_PRICE_ID_PREMIER`
  - Legacy fallback still supported: `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_ELITE`

### Listing tier snapshot (for public browse + deterministic ranking)
- On publish (`/api/listings/publish`), we snapshot:
  - `listings/{id}.sellerTierSnapshot`
  - `listings/{id}.sellerTierWeightSnapshot`
- This avoids needing to read `users/*` publicly (Firestore rules require auth for user docs).

### Ranking logic
- Implemented page-local deterministic tier boost in `queryListingsForBrowse()`:
  - Primary: tier weight DESC (0/10/20)
  - Secondary: existing sort key (createdAt/price/endsAt)
  - Optional fairness: when sorting by newest, interleave Standard so it appears roughly 1 out of 5 when available.

### Firestore security
- Updated `firestore.rules` to prevent users from self-assigning paid tiers or mutating billing/admin fields.

---

## Manual QA checklist
1. **Pricing page** (`/pricing`)
   - Shows **Standard / Priority / Premier** with correct prices.
   - Copy states: **“All sellers pay the same 5% marketplace fee”** and no fee-reduction language exists.
2. **Tier badges**
   - On a listing card and listing page seller block, verify:
     - Priority user shows **Priority Seller** badge
     - Premier user shows **Premier Seller** badge
     - Standard shows no tier badge
     - Tooltip disclaimer says tier is optional exposure and not compliance approval
3. **Upgrade flow**
   - Logged-in seller clicks paid tier CTA on `/pricing` → Stripe hosted invoice URL appears.
   - Seller Settings → Plan card shows tier and “Manage Billing” works.
4. **Browse ordering**
   - Browse pages: paid tiers consistently appear above Standard within a page, without breaking sort direction.
5. **Listing creation**
   - Standard seller can create/publish listings (no listing-limit blocks).

---

## Intentional TODOs (not implemented)
- Listing-level “boosts” (separate from seller-tier ranking) — explicitly deferred.
- Any “faster payout window” behavior — copy-only unless a payout-timing mechanism exists.

