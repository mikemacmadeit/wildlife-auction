# Simulating wire / ACH in Stripe test mode

Wire and ACH (bank transfer) payments use Stripe’s **customer balance**. In test mode, no real money moves. To simulate “funds received” and move an order from **awaiting_wire** → **paid_held**, you use Stripe’s **test helper** to fund that customer’s cash balance. Stripe then applies the balance to the PaymentIntent, completes it, and sends `payment_intent.succeeded`; your webhook moves the order to paid_held.

---

## 1. Run through wire checkout (test mode)

1. Use **test** API keys (`sk_test_...`, `pk_test_...`).
2. On a listing, click **Buy Now** → choose **Wire**.
3. In the wire instructions dialog you’ll see:
   - **Reference code** (e.g. `22NQM5VSTF4B`) — needed for the simulation.
   - **Order** id (e.g. `PSRqoOCLXFYJAb4t2CkD`).
   - **PaymentIntent** id (e.g. `pi_3SuORFLQubUTaYsL19uNbyF7`).
   - Bank details (US / SWIFT).

The order is now **awaiting_wire**. To simulate the transfer, you need the **Stripe Customer ID** and the **amount in cents**.

---

## 2. Get the Stripe Customer ID

The PaymentIntent is tied to a Stripe Customer. You can get it in either place:

- **Stripe Dashboard (easiest)**  
  1. [Dashboard](https://dashboard.stripe.com) → **Payments** (or **Developers** → **Logs**).  
  2. Search for the PaymentIntent id (e.g. `pi_3SuORFLQubUTaYsL19uNbyF7`).  
  3. Open it and look at **Customer** — that’s `cus_...`.

- **API**  
  If you have the PI id:  
  `GET https://api.stripe.com/v1/payment_intents/pi_xxxx`  
  and read `customer` (e.g. `cus_TnPm5YntAtHgkC`).

---

## 3. Simulate the incoming transfer (fund cash balance)

Use Stripe’s test helper so the customer’s balance is credited. Use the **same amount** as the order (in **cents**). The **reference** should match the one from the wire instructions so Stripe can match the “transfer” to the PaymentIntent.

### Option A: cURL

```bash
# Replace CUSTOMER_ID, AMOUNT_CENTS, and REFERENCE with the real values.
# Example: $35,000 = 3500000 cents, reference from wire dialog = 22NQM5VSTF4B

curl https://api.stripe.com/v1/test_helpers/customers/CUSTOMER_ID/fund_cash_balance \
  -u "sk_test_YOUR_SECRET_KEY:" \
  -d amount=3500000 \
  -d currency=usd \
  -d reference="22NQM5VSTF4B"
```

Example with real-looking values:

```bash
curl https://api.stripe.com/v1/test_helpers/customers/cus_TnPm5YntAtHgkC/fund_cash_balance \
  -u "sk_test_xxxxx:" \
  -d amount=3500000 \
  -d currency=usd \
  -d reference="22NQM5VSTF4B"
```

### Option B: Stripe CLI

If the CLI supports the test helper (syntax may change; check `stripe --help`):

```bash
stripe test_helpers customers fund_cash_balance CUSTOMER_ID --amount=3500000 --currency=usd
```

(Add `--reference="22NQM5VSTF4B"` if the CLI exposes it.)

### Option C: Node (e.g. one-off script or REPL)

```js
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const customerId = 'cus_xxxx';   // from Dashboard or PI
const amountCents = 3500000;     // $35,000
const reference = '22NQM5VSTF4B';

const txn = await stripe.testHelpers.customers.fundCashBalance(customerId, {
  amount: amountCents,
  currency: 'usd',
  reference,
});
console.log('Funded:', txn.id);
```

---

## 4. What happens next

1. Stripe credits the customer’s **cash balance** with that amount (and optional reference).
2. Stripe applies the balance to the **PaymentIntent** and marks it **succeeded**.
3. Stripe sends a **`payment_intent.succeeded`** webhook to your app.
4. Your webhook handler (e.g. `handleWirePaymentIntentSucceeded`) finds the order by `metadata.orderId` or `stripePaymentIntentId`, and updates it to **paid_held** (and marks the listing sold, etc.).

So after step 3, the order should move to **paid_held** on its own. If you run the Stripe CLI with `stripe listen --forward-to localhost:3000/api/stripe/webhook`, the webhook will hit your app; otherwise it must reach whatever URL is configured in Dashboard → Developers → Webhooks for test mode.

---

## 5. ACH vs wire in test mode

- Your **wire** flow uses **customer_balance** + **us_bank_transfer** (the instructions you show are Stripe’s virtual US bank details).
- Simulating is the same: you’re not choosing “wire” vs “ACH” in the test helper; you’re **funding the customer’s cash balance**. That satisfies the PaymentIntent. The “wire instructions” and “reference” in your UI are what the buyer would use in production; in test, `fund_cash_balance` plus that reference is enough to simulate the payment.
- If you add a separate ACH (e.g. ACH Direct Debit) flow later, it may use different Stripe products; test flows for those are documented under [Financial Connections testing](https://docs.stripe.com/financial_connections/testing) and the relevant payment method docs.

---

## 6. Quick checklist

| Step | What you need |
|------|----------------|
| 1 | Complete wire checkout in test → note **Reference code**, **Order id**, **PaymentIntent id** |
| 2 | In Stripe Dashboard, open that PaymentIntent → copy **Customer** (`cus_...`) |
| 3 | Order amount in **cents** (e.g. $35,000 → `3500000`) |
| 4 | Call `fund_cash_balance` for that customer with `amount`, `currency=usd`, and `reference` |
| 5 | Ensure test webhooks point at your app so `payment_intent.succeeded` is received |
| 6 | Order status moves to **paid_held** when the webhook is handled |

---

## References

- [Stripe: Fund a test mode cash balance](https://docs.stripe.com/api/cash_balance_transactions/fund_cash_balance)
- [Stripe: Bank transfer payments – test](https://stripe.com/docs/payments/bank-transfers?dashboard-or-api=test-your-integration-api)
