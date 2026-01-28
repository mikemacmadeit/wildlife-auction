# Clear “Awaiting Payment” Orders (Abandoned Checkouts)

Orders with status **pending**, **awaiting_bank_transfer**, or **awaiting_wire** are created when a user opens a Stripe Checkout session but never completes payment. They can show up as “Awaiting payment” / “Payment processing · Waiting on payment confirmation” for both buyer and seller.

To **clear these for the whole system**, use either the script (recommended) or the admin API.

---

## Option 1: Run the script (recommended for “whole system”)

From the **project root**, with Firebase Admin credentials in `.env.local` (or env):

```bash
# Preview only (no changes)
npx tsx scripts/cancel-all-awaiting-payment-orders.ts --dry-run

# Cancel up to 500 awaiting-payment orders (default)
npx tsx scripts/cancel-all-awaiting-payment-orders.ts

# Cancel up to 2000 in one run
npx tsx scripts/cancel-all-awaiting-payment-orders.ts --limit=2000
```

The script will:

- Find all orders with `status` in `['pending','awaiting_bank_transfer','awaiting_wire']`
- Set each to `status: 'cancelled'`, `lastUpdatedByRole: 'admin'`
- Clear that order’s listing reservation (`purchaseReservations`, `purchaseReservedByOrderId`, etc.) so quantity/availability is restored

If you have more than the `--limit`, run it again (or raise `--limit`) until the script reports 0 found.

**Prerequisites:** `.env.local` (or env) must include Firebase Admin vars: `FIREBASE_PRIVATE_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`.

---

## Option 2: Admin API (when you’re already in the app as admin)

**Endpoint:** `POST /api/admin/orders/cancel-abandoned-checkouts`

Query params:

| Param    | Meaning |
|----------|--------|
| `all=1`  | Cancel **all** awaiting-payment orders (no Stripe session check). Use this to clear the whole system. |
| `dryRun=1` | Only report what would be cancelled; no writes. |
| `limit=500` | Max orders to process (default 50, max 500). |

Examples (replace `https://your-site.com` with your origin):

```bash
# Preview
curl -X POST "https://your-site.com/api/admin/orders/cancel-abandoned-checkouts?all=1&dryRun=1&limit=500" \
  -H "Authorization: Bearer YOUR_ID_TOKEN" -H "Content-Type: application/json"

# Execute (cancel all matching, up to 500 per request)
curl -X POST "https://your-site.com/api/admin/orders/cancel-abandoned-checkouts?all=1&limit=500" \
  -H "Authorization: Bearer YOUR_ID_TOKEN" -H "Content-Type: application/json"
```

You must be logged in as an **admin** and send your Firebase ID token in `Authorization: Bearer <token>`.

If more than 500 exist, call again until `totalScanned` is less than `limit`.

---

## After clearing

- Those orders will have `status: 'cancelled'`.
- Buyer “My purchases” already excludes awaiting-payment orders; cancelled ones will not appear as awaiting.
- Seller Sold tab (and filters) exclude cancelled-without-paidAt, so they drop off the “Awaiting payment” list and no longer show as in-progress.
