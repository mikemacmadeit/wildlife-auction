## INTERNAL — Scheduled Jobs (Netlify Functions) & Operations Checklist

**Internal operating document — not marketing — not legal advice.**

**Founder policy inputs required:** production enablement + monitoring owner are **FOUNDER POLICY REQUIRED** (see `docs/internal/FOUNDER_INPUTS.md`).

---

## 1) Inventory (scheduled functions in repo)

### `finalizeAuctions` (runs every 2 minutes)
- **File:** `netlify/functions/finalizeAuctions.ts`
- **Purpose:** finalize ended auctions and set listing `status: 'expired'`; write `auctionResults/{listingId}`.
- **How it runs:** `schedule('*/2 * * * *', ...)`
- **Evidence:** `netlify/functions/finalizeAuctions.ts:L1-L13`, `L39-L46`, `L87-L88`
- **Failure looks like:** auctions remain `status: 'active'` after `endsAt` and do not produce `auctionResults`.

### `expireUnpaidAuctions` (runs every 5 minutes)
- **File:** `netlify/functions/expireUnpaidAuctions.ts`
- **Purpose:** expire unpaid winners and auto-relist as a fresh listing (new listing ID).
- **How it runs:** `schedule('*/5 * * * *', ...)`
- **Evidence:** `netlify/functions/expireUnpaidAuctions.ts:L1-L16`, `L49-L56`, `L120-L188`, `L254-L255`
- **Failure looks like:** `auctionResults` stuck in `ended_winner_pending_payment` past `paymentDueAt`.

### `clearExpiredPurchaseReservations` (runs every 5 minutes)
- **File:** `netlify/functions/clearExpiredPurchaseReservations.ts`
- **Purpose:** prevent stale `purchaseReservedUntil` from blocking checkout/browse by clearing expired reservations.
- **How it runs:** `schedule('*/5 * * * *', ...)`
- **Evidence:** `netlify/functions/clearExpiredPurchaseReservations.ts:L1-L14`, `L34-L41`, `L74-L85`, `L121-L122`
- **Failure looks like:** listings remain “reserved pending payment confirmation” beyond reservation window.

### `emitAuctionOutcomeEvents`
- **File:** `netlify/functions/emitAuctionOutcomeEvents.ts`
- **Purpose:** present in repo; confirm operational behavior in production logs.
- **Evidence:** **present in repo** (see file); production enablement is not provable from repo alone.

### ~~`autoReleaseProtected`~~ [RETIRED]
- **Status:** Retired. Payments are direct buyer→seller (destination charges); there is no platform-held escrow or delayed payout release. The scheduled function and `opsHealth/autoReleaseProtected` doc may still exist for historical reference; System Health shows this check as "[RETIRED — informational only]" and does not treat it as a live job.

---

## 2) Required env / flags

- `AUTO_RELEASE_ENABLED` default is OFF (see `env.example`).
- Additional platform emergency flags (default OFF):
  - `GLOBAL_PAYOUT_FREEZE_ENABLED`
  - `GLOBAL_CHECKOUT_FREEZE_ENABLED`

---

## 3) How to confirm jobs are running in production (operator checklist)

**FOUNDER POLICY REQUIRED** for where/what to check (Netlify UI/logs/Sentry), and who is responsible.

Operational steps template:
1) Open Netlify → Functions → Scheduled Functions and confirm enabled.
2) Check function logs for each scheduled function (last run time, error rate).
3) Verify Firestore side-effects:
   - ended auctions produce `auctionResults/{listingId}`
   - expired reservations cleared
4) If errors mention “requires an index”, add the Firestore composite index referenced in logs.

