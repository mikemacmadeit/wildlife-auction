# Stripe Connect Setup Guide

This guide explains how to set up Stripe Connect (Marketplace model) for Wildlife Exchange.

## Overview

Wildlife Exchange uses **Stripe Connect Express** to enable sellers to receive payouts directly. The platform takes a 5% commission on each transaction.

### How It Works

1. **Seller Onboarding**: Sellers create a Stripe Connect Express account and complete onboarding
2. **Buyer Checkout**: Buyers purchase listings using Stripe Checkout
3. **Payment Flow**: 
   - Buyer pays full amount via Stripe Checkout
   - Platform receives 5% application fee
   - Remaining 95% is transferred directly to seller's bank account
4. **Order Creation**: Webhook creates order in Firestore and marks listing as sold

---

## Environment Variables

Add these to your `.env.local` and Netlify:

### Required Variables

```env
# Stripe Secret Key (Server-side only)
STRIPE_SECRET_KEY=sk_live_...

# Stripe Publishable Key (Client-side)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Stripe Webhook Secret (for webhook signature verification)
STRIPE_WEBHOOK_SECRET=whsec_...

# Application URL (for redirects)
APP_URL=https://your-domain.com
# OR
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### How to Get Stripe Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. **API Keys**: Settings → API keys → Copy secret and publishable keys
3. **Webhook Secret**: Developers → Webhooks → Add endpoint → Copy signing secret

---

## Stripe Dashboard Setup

### 1. Enable Stripe Connect

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Settings → Connect**
3. Enable **Express accounts**
4. Configure your platform settings:
   - Platform name: "Wildlife Exchange"
   - Support email: your support email
   - Support phone: your support phone (optional)

### 2. Create Webhook Endpoint

1. Go to **Developers → Webhooks**
2. Click **Add endpoint**
3. Set endpoint URL: `https://wildlife.exchange/api/stripe/webhook`
   - **Note**: This is a Next.js API route, NOT a Netlify Function
   - Use `/api/stripe/webhook` format (not `/.netlify/functions/...`)
4. Select events to listen for:
   - `account.updated` - Updates seller's Stripe Connect status
   - `checkout.session.completed` - Creates order when payment succeeds
5. Copy the **Signing secret** → Add to `STRIPE_WEBHOOK_SECRET`

### 3. Test Mode vs Live Mode

- **Test Mode**: Use test keys (`sk_test_...`, `pk_test_...`) for development
- **Live Mode**: Use live keys (`sk_live_...`, `pk_live_...`) for production

**Important**: Webhook secrets are different for test and live modes!

### If checkout fails with "seller's payment account is no longer linked"

Stripe returns `account_invalid` ("The provided key does not have access to account ... or application access may have been revoked") when the **current** `STRIPE_SECRET_KEY` cannot access the seller's Connect account. Common causes:

- **You changed keys:** Rotated `STRIPE_SECRET_KEY`, switched Stripe project or `.env`, or copied the app to a new machine with a new key. Connect account IDs are tied to the key that created them.
- **Stripe revoked access:** Stripe can revoke a Connect application or account access (e.g. compliance, platform review). You don't have to change anything for this to happen.
- **Different Stripe project:** The seller connected while the app was using a different Stripe project (e.g. another env or deployment); now the app uses a key that never had that account.
- **Test vs live:** The Connect account ID in Firestore was created in live mode but you're using a test key (or vice versa). Account IDs don't cross test/live.

**Verify:** In [Stripe Dashboard](https://dashboard.stripe.com) → **Connect** → **Accounts**, confirm you're in the same Stripe account that owns your `STRIPE_SECRET_KEY`. See if the seller's Connect account (e.g. `acct_1Sp9s7LL9MMK7frT`) appears there. If it doesn't, that account belongs to another Stripe project or was revoked.

**Fix:** Have the seller **reconnect payments**: Account/Settings → **Payments** → disconnect and connect again. That creates a new Connect account under your current key and checkout will work again. No need to change any keys if you didn't intend to.

**Why does one user (e.g. super admin) work but another says "payout ready" and checkout fails?**  
"Payout ready" in the app is **cached** in Firestore from when the seller completed onboarding (or when we last refreshed from Stripe). Stripe can later revoke or restrict access to **that specific Connect account** (e.g. platform under review, or that connected account flagged) without updating our cache. We only discover it at checkout when Stripe returns `account_invalid`. So the other user didn't "get disconnected" in the app — Stripe no longer allows the platform to use that Connect account. When checkout fails with SELLER_ACCOUNT_DISCONNECTED, we now clear that seller's cached Stripe state so their dashboard shows "Connect payments" and they can create a new Connect account.

---

## Local Development

### 1. Install Dependencies

```bash
cd project
npm install
```

### 2. Set Environment Variables

Create `.env.local`:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:3000
```

### 3. Test Webhooks Locally

Use [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhooks to localhost:

```bash
# Install Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Windows: Download from https://github.com/stripe/stripe-cli/releases

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Copy the webhook signing secret shown and add to .env.local
```

### 4. Run Development Server

```bash
npm run dev
```

---

## Testing the Flow

### Test Seller Onboarding

1. Sign in as a seller
2. Go to `/seller/payouts`
3. Click **"Enable Payouts"**
4. Complete Stripe onboarding (use test data)
5. Verify status updates to "Payouts Enabled"

### Test Checkout

1. Create a test listing (fixed price)
2. Sign in as a different user (buyer)
3. Go to listing page
4. Click **"Buy Now"**
5. Complete Stripe Checkout (use test card: `4242 4242 4242 4242`)
6. Verify:
   - Order created in Firestore
   - Listing marked as "sold"
   - Webhook logs show successful processing

### Test Cards

Use these test cards in Stripe Checkout:

- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

Expiry: Any future date (e.g., `12/34`)
CVC: Any 3 digits (e.g., `123`)

---

## Production Deployment

### 1. Add Environment Variables to Netlify

1. Go to Netlify Dashboard → Your Site → **Site settings** → **Environment variables**
2. Add all required variables (see above)
3. **Important**: Use **live** Stripe keys for production!

### 2. Update Webhook Endpoint

1. Go to Stripe Dashboard → **Developers → Webhooks**
2. Update endpoint URL to production: `https://wildlife.exchange/api/stripe/webhook`
   - **Important**: Use `/api/stripe/webhook` (Next.js API route format)
   - Do NOT use `/.netlify/functions/...` (that's for standalone Netlify Functions)
3. Copy the **live** webhook signing secret → Add to Netlify env vars

### 3. Deploy

```bash
git push origin main
# Netlify will auto-deploy
```

### 4. Verify Webhook

1. In Stripe Dashboard → Webhooks → Your endpoint
2. Click **"Send test webhook"**
3. Select `checkout.session.completed`
4. Verify it succeeds (check Netlify function logs)

---

## API Routes

### POST `/api/stripe/connect/create-account`

Creates a Stripe Connect Express account for the authenticated user.

**Auth**: Required (Firebase Auth token in `Authorization: Bearer <token>` header)

**Response**:
```json
{
  "stripeAccountId": "acct_...",
  "message": "Stripe account created successfully"
}
```

### POST `/api/stripe/connect/create-account-link`

Creates an onboarding link for the user's Stripe account.

**Auth**: Required

**Response**:
```json
{
  "url": "https://connect.stripe.com/setup/...",
  "message": "Onboarding link created successfully"
}
```

### POST `/api/stripe/checkout/create-session`

Creates a Stripe Checkout session for purchasing a listing.

**Auth**: Required (buyer)

**Body**:
```json
{
  "listingId": "listing_id_here"
}
```

**Response**:
```json
{
  "sessionId": "cs_...",
  "url": "https://checkout.stripe.com/...",
  "message": "Checkout session created successfully"
}
```

### POST `/api/stripe/webhook`

Handles Stripe webhook events.

**Auth**: None (uses Stripe signature verification)

**Events Handled**:
- `account.updated` - Updates user's Stripe Connect status
- `checkout.session.completed` - Creates order and marks listing as sold

---

## Firestore Schema

### Users Collection

Added Stripe Connect fields:

```typescript
{
  stripeAccountId?: string; // Stripe Connect account ID
  stripeOnboardingStatus?: 'not_started' | 'pending' | 'complete';
  chargesEnabled?: boolean; // Can accept payments
  payoutsEnabled?: boolean; // Can receive payouts
  stripeDetailsSubmitted?: boolean; // Has submitted required details
}
```

### Orders Collection

New collection for completed purchases:

```typescript
{
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number; // Total amount paid (in dollars)
  platformFee: number; // Platform commission (in dollars)
  sellerAmount: number; // Amount seller receives (in dollars)
  status: 'pending' | 'paid' | 'completed' | 'refunded' | 'cancelled';
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}
```

---

## Troubleshooting

### Webhook Not Receiving Events

1. Check webhook endpoint URL is correct
2. Verify `STRIPE_WEBHOOK_SECRET` is set correctly
3. Check Netlify function logs for errors
4. Test webhook in Stripe Dashboard → Send test webhook

### Seller Can't Enable Payouts

1. Check Firebase Admin SDK is initialized correctly
2. Verify `STRIPE_SECRET_KEY` is set
3. Check browser console for API errors
4. Verify user is authenticated

### Checkout Fails

1. Verify seller has `payoutsEnabled: true`
2. Check listing status is `'active'`
3. Verify listing type is `'fixed'` (auctions use bidding)
4. Check Stripe Dashboard for payment errors

### Orders Not Created

1. Check webhook is receiving `checkout.session.completed` events
2. Verify webhook handler is processing events correctly
3. Check Firestore rules allow order creation
4. Review Netlify function logs

---

## Security Notes

1. **Never expose `STRIPE_SECRET_KEY`** to client-side code
2. **Always verify webhook signatures** using `STRIPE_WEBHOOK_SECRET`
3. **Use HTTPS** in production (required for Stripe)
4. **Validate user authentication** in all API routes
5. **Check seller payout status** before allowing checkout

---

## Support

For Stripe-specific issues:
- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Stripe Support](https://support.stripe.com/)

For Wildlife Exchange implementation:
- Check code comments in API routes
- Review Firestore rules
- Check Netlify function logs
