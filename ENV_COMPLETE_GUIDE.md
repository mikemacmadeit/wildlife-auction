# Complete Environment Variables Guide

## 📋 Quick Setup

1. **Copy the template:**
   ```bash
   cp .env.local.template .env.local
   ```

2. **Fill in your Firebase keys** (get from Firebase Console)
3. **Stripe keys are already included** (from your provided keys)
4. **Save the file** - it's already in `.gitignore`

---

## 🔑 All Required Environment Variables

### Firebase (Required)
All Firebase keys are prefixed with `NEXT_PUBLIC_` because they're used client-side.

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API Key | Firebase Console > Project Settings > General > Web App Config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth Domain | Same as above |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Project ID | Same as above |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage Bucket | Same as above |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Messaging Sender ID | Same as above |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID | Same as above |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Analytics ID (optional) | Same as above |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Web Push VAPID Key (for push notifications) | Firebase Console > Project Settings > Cloud Messaging > Web Push certificates |

### Stripe (Required for Payments)
✅ **Already configured with your live keys**

| Variable | Description | Security |
|----------|-------------|----------|
| `STRIPE_SECRET_KEY` | Server-side secret key | ⚠️ **NEVER expose to client** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-side publishable key | ✅ Safe for browser |

**Your Stripe Keys:**
- Secret: Get from [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → Secret key
- Publishable: Get from [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → Publishable key

---

## 🌐 Netlify Environment Variables

Copy these **exact values** to Netlify:

### Firebase Variables (All with NEXT_PUBLIC_ prefix)
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
NEXT_PUBLIC_FIREBASE_VAPID_KEY=your_vapid_key_here
```

### Stripe Variables
```
STRIPE_SECRET_KEY=sk_live_your_secret_key_here
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key_here
```

---

## 📝 How to Get Firebase Keys

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`wildlife-exchange`)
3. Click the gear icon ⚙️ → **Project settings**
4. Scroll to **Your apps** section
5. Click on your web app (or create one if needed)
6. Copy the config values from the `firebaseConfig` object

Example:
```javascript
const firebaseConfig = {
  apiKey: "AIza...",           // → NEXT_PUBLIC_FIREBASE_API_KEY
  authDomain: "...",           // → NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  projectId: "wildlife-exchange", // → NEXT_PUBLIC_FIREBASE_PROJECT_ID
  storageBucket: "...",         // → NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "...",     // → NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  appId: "...",                 // → NEXT_PUBLIC_FIREBASE_APP_ID
  measurementId: "G-..."       // → NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};
```

### How to Get VAPID Key (for Push Notifications)

The VAPID key is required for web push notifications. Here's how to get it:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`wildlife-exchange`)
3. Click the gear icon ⚙️ → **Project settings**
4. Click on the **Cloud Messaging** tab
5. Scroll down to **Web Push certificates** section
6. If you don't have a key pair yet:
   - Click **Generate key pair** button
   - A VAPID key will be generated (it looks like: `BEl62iUYgUivxIkv69yViEuiBIa40HI...`)
7. Copy the **Key pair** value (this is your `NEXT_PUBLIC_FIREBASE_VAPID_KEY`)
8. Add it to your `.env.local` file:
   ```
   NEXT_PUBLIC_FIREBASE_VAPID_KEY=BEl62iUYgUivxIkv69yViEuiBIa40HI...
   ```

**Note:** The VAPID key is safe to expose publicly (it's prefixed with `NEXT_PUBLIC_`). It's used to identify your app when sending push notifications.

**Also add to Netlify:**
- Add `NEXT_PUBLIC_FIREBASE_VAPID_KEY` to your Netlify environment variables
- Redeploy after adding it

---

## 🔒 Security Best Practices

1. ✅ **Never commit `.env.local`** - It's in `.gitignore`
2. ✅ **Use `NEXT_PUBLIC_` prefix** only for client-safe variables
3. ✅ **Secret keys** (like `STRIPE_SECRET_KEY`) should NEVER have `NEXT_PUBLIC_` prefix
4. ✅ **Rotate keys** if accidentally exposed
5. ✅ **Use different keys** for development vs production (if possible)

---

## ✅ Verification Checklist

After setting up `.env.local`:

- [ ] Firebase keys are filled in
- [ ] Stripe keys are included
- [ ] File is named `.env.local` (not `.env.local.template`)
- [ ] File is in `project/` directory
- [ ] Restart dev server: `npm run dev`
- [ ] Check browser console for Firebase initialization
- [ ] Test Firebase auth (sign in/up)
- [ ] Test Stripe integration (if implemented)

---

## 🚨 Troubleshooting

### "Firebase configuration is incomplete"
- Check that all `NEXT_PUBLIC_FIREBASE_*` variables are set
- Restart your dev server after adding variables
- Verify no typos in variable names

### "Stripe key not found"
- Check `STRIPE_SECRET_KEY` is set (server-side)
- Check `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set (client-side)
- Verify no `NEXT_PUBLIC_` prefix on secret key

### Variables not loading
- Restart dev server: `npm run dev`
- Clear Next.js cache: `rm -rf .next`
- Check file is named exactly `.env.local`
- Check file is in `project/` directory (not root)

---

## 📦 File Structure

```
project/
├── .env.local              ← Your actual env file (gitignored)
├── .env.local.template     ← Template (safe to commit)
├── env.example             ← Basic example
└── ENV_COMPLETE_GUIDE.md   ← This file
```

---

## 🎯 Quick Copy-Paste for Netlify

**All variables to add to Netlify:**

1. All your Firebase `NEXT_PUBLIC_*` variables
2. `STRIPE_SECRET_KEY=sk_live_your_secret_key_here`
3. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key_here`

**After adding:** Redeploy your site for changes to take effect.
