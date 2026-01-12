# Fix "Illegal URL" Error for Google Sign-In

## 🔴 Problem

When clicking "Sign in with Google", you see an error: **"Illegal URL"** or **"redirect_uri_mismatch"**

## ✅ Solution

The redirect URI is not configured in Google Cloud Console. Follow these exact steps:

---

## Step 1: Go to Google Cloud Console

1. Visit: https://console.cloud.google.com/
2. Select your project: **wildlife-exchange** (or your Firebase project name)
3. Make sure you're in the correct project!

---

## Step 2: Find OAuth 2.0 Client ID

1. In Google Cloud Console, go to **APIs & Services** → **Credentials**
2. Look for **OAuth 2.0 Client IDs** section
3. You should see a client ID (usually named something like "Web client (auto created by Google Service)")
4. **Click on the client ID** to edit it

---

## Step 3: Add Authorized JavaScript Origins

In the **Authorized JavaScript origins** section, add these **exactly** (one per line):

```
https://wildlife.exchange
http://localhost:3000
https://wildlife-exchange.firebaseapp.com
https://wildlife-exchange.web.app
```

**Important:**
- Use `https://` for production
- Use `http://` for localhost
- **NO trailing slashes** (don't add `/` at the end)
- **NO paths** (just the domain)

---

## Step 4: Add Authorized Redirect URIs (THIS FIXES THE ERROR!)

In the **Authorized redirect URIs** section, add these **exactly** (one per line):

```
https://wildlife.exchange/__/auth/handler
http://localhost:3000/__/auth/handler
https://wildlife-exchange.firebaseapp.com/__/auth/handler
https://wildlife-exchange.web.app/__/auth/handler
```

**Critical Notes:**
- The `/__/auth/handler` path is **REQUIRED** for Firebase
- This is Firebase's special redirect endpoint
- **NO trailing slashes**
- Must match **exactly** (case-sensitive)

---

## Step 5: Save and Wait

1. Click **Save** at the bottom
2. **Wait 2-5 minutes** for changes to propagate
3. Try Google sign-in again

---

## Step 6: Verify Firebase Configuration

Also check Firebase Console:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project → **Project Settings** → **General**
3. Scroll to **Your apps** → Select your web app
4. Check **OAuth redirect domains** section
5. Verify these are listed:
   - `wildlife.exchange`
   - `localhost` (for development)

If not listed, they should be added automatically, but you can verify.

---

## Step 7: Verify Authorized Domains

1. Firebase Console → **Authentication** → **Settings**
2. Scroll to **Authorized domains**
3. Verify these are listed:
   - `wildlife.exchange`
   - `localhost` (should be there by default)

If `wildlife.exchange` is missing, add it.

---

## Common Mistakes

❌ **Wrong:** `https://wildlife.exchange/` (trailing slash)
✅ **Correct:** `https://wildlife.exchange`

❌ **Wrong:** `https://wildlife.exchange/auth/handler` (missing `__`)
✅ **Correct:** `https://wildlife.exchange/__/auth/handler`

❌ **Wrong:** `wildlife.exchange` (missing protocol)
✅ **Correct:** `https://wildlife.exchange`

❌ **Wrong:** `https://www.wildlife.exchange` (www subdomain)
✅ **Correct:** `https://wildlife.exchange` (unless you use www)

---

## Still Not Working?

### Check Browser Console

1. Open DevTools (F12)
2. Go to **Console** tab
3. Try Google sign-in
4. Look for error messages
5. Copy the exact error message

### Check Network Tab

1. Open DevTools → **Network** tab
2. Try Google sign-in
3. Look for failed requests (red)
4. Click on failed request → **Response** tab
5. Look for error details

### Verify Environment Variables

Make sure these are set correctly:

```env
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=wildlife-exchange.firebaseapp.com
```

The `authDomain` should match what's in Firebase Console.

---

## Quick Test

After making changes:

1. **Wait 2-5 minutes** (Google needs time to update)
2. **Clear browser cache** (Ctrl+Shift+Delete)
3. **Try in incognito mode** (to avoid cache issues)
4. **Try Google sign-in again**

---

## Exact Redirect URIs to Add

Copy and paste these **exactly** into Google Cloud Console:

### Authorized JavaScript Origins:
```
https://wildlife.exchange
http://localhost:3000
https://wildlife-exchange.firebaseapp.com
https://wildlife-exchange.web.app
```

### Authorized Redirect URIs:
```
https://wildlife.exchange/__/auth/handler
http://localhost:3000/__/auth/handler
https://wildlife-exchange.firebaseapp.com/__/auth/handler
https://wildlife-exchange.web.app/__/auth/handler
```

**Replace `wildlife-exchange` with your actual Firebase project ID if different!**

---

## Need Help?

If it's still not working after following these steps:

1. Check the **exact error message** in browser console
2. Verify your **Firebase project ID** matches
3. Verify your **domain** is correct
4. Make sure you **waited 2-5 minutes** after saving
5. Try in **incognito mode**
