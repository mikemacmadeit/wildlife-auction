# Stripe Environment Variables for Netlify

## ⚠️ IMPORTANT SECURITY NOTES

- **STRIPE_SECRET_KEY** is a **LIVE SECRET KEY** - Keep it secure!
- Never commit secret keys to Git
- Only the publishable key is exposed to the client-side
- The secret key is server-side only (API routes, server actions)

---

## Netlify Environment Variables

Copy and paste these into Netlify:

**Site Settings → Environment Variables → Add a variable**

### 1. Stripe Publishable Key (Client-Side)
```
Key: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
Value: pk_live_your_publishable_key_here
```
Get from: [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → Publishable key

### 2. Stripe Secret Key (Server-Side Only)
```
Key: STRIPE_SECRET_KEY
Value: sk_live_your_secret_key_here
```
Get from: [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → Secret key

---

## How to Add in Netlify

1. Go to your Netlify dashboard
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Click **Add a variable**
5. Add each key-value pair above
6. Click **Save**
7. **Redeploy** your site for changes to take effect

---

## Usage in Code

### Client-Side (React Components)
```typescript
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
// Use with Stripe.js or @stripe/stripe-js
```

### Server-Side (API Routes, Server Actions)
```typescript
const secretKey = process.env.STRIPE_SECRET_KEY;
// Use with stripe package for server-side operations
```

---

## Verification

After adding to Netlify and redeploying:
1. Check that `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is available in browser console
2. Verify `STRIPE_SECRET_KEY` is NOT exposed (should be undefined in browser)
3. Test Stripe integration

---

## Security Checklist

- ✅ Secret key is NOT prefixed with `NEXT_PUBLIC_`
- ✅ Secret key is only used server-side
- ✅ Publishable key is safe to expose client-side
- ✅ Keys are stored in Netlify (not in code)
- ✅ `.env` files are in `.gitignore`
