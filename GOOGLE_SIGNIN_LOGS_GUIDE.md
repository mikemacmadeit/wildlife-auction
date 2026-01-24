# Google Sign-In Logs Guide

## Where to Check Logs When Google Sign-In Stops Working

### 1. **Browser Console (Most Important - Client-Side)**

**How to Access:**
- Open your site in a browser
- Press `F12` or `Right-click → Inspect → Console tab`
- Try Google sign-in
- Look for logs starting with `[Google Sign-In]` or `[Login]`

**What to Look For:**
```
[Google Sign-In] Starting Google redirect flow for all devices
[Google Sign-In] Auth domain: your-project.firebaseapp.com
[Google Sign-In] Current URL: https://wildlife.exchange/login
[Login] handleGoogleSignIn called, initiating Google redirect...
[Login] Redirect initiated successfully - page will reload after Google sign-in
```

**Error Patterns:**
- `auth/unauthorized-domain` → Domain not in Firebase authorized domains
- `auth/operation-not-allowed` → Google sign-in not enabled in Firebase
- `Redirect initiation failed` → Check the error details below
- `No redirect result found` → Redirect completed but result lost

**Filter Console:**
- Type `[Google` in the console filter to see only Google sign-in logs
- Type `[Login]` to see login page logs

---

### 2. **Network Tab (Browser DevTools)**

**How to Access:**
- Open DevTools (`F12`)
- Go to **Network** tab
- Try Google sign-in
- Look for:
  - Redirects to `accounts.google.com`
  - Redirects back to your site
  - Failed requests (red status codes)

**What to Check:**
1. **Initial Redirect:**
   - Should see a request to `accounts.google.com/o/oauth2/v2/auth?...`
   - Status should be `307 Temporary Redirect` or `302 Found`

2. **Return Redirect:**
   - After selecting Google account, should redirect to your site
   - URL should include hash fragments or query params from Firebase

3. **Failed Requests:**
   - Any `4xx` or `5xx` errors
   - CORS errors
   - Blocked requests

**Filter Network:**
- Filter by `google` to see Google OAuth requests
- Filter by `firebase` to see Firebase Auth requests

---

### 3. **Firebase Console Logs**

**How to Access:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Authentication** → **Users** tab
4. Check if sign-in attempts are being recorded

**What to Check:**
- **Users Tab:** See if new users are being created
- **Sign-in method:** Go to **Authentication** → **Sign-in method**
  - Ensure "Google" is enabled
  - Check authorized domains

**Authorized Domains:**
1. Go to **Authentication** → **Settings** → **Authorized domains**
2. Ensure these are listed:
   - `wildlife.exchange` (your production domain)
   - `localhost` (for development)
   - Any Netlify preview domains you use

---

### 4. **Netlify Deploy Logs**

**How to Access:**
1. Go to [Netlify Dashboard](https://app.netlify.com/)
2. Select your site
3. Go to **Deploys** tab
4. Click on the latest deploy
5. Check **Deploy log** and **Functions log**

**What to Look For:**
- Build errors
- Environment variable issues
- Firebase configuration errors
- Any errors during build

**Recent Changes:**
- Check if recent deploys changed anything related to auth
- Look for changes to `lib/firebase/auth.ts` or `app/login/page.tsx`

---

### 5. **Sentry Error Tracking (If Configured)**

**How to Access:**
1. Go to [Sentry Dashboard](https://sentry.io/)
2. Select your project
3. Go to **Issues** tab
4. Filter by:
   - `auth` or `google` or `sign-in`
   - Time range: Last 24 hours or 7 days

**What to Check:**
- Error messages related to Firebase Auth
- Stack traces showing where sign-in fails
- User context (browser, device, URL)

**If Sentry Not Configured:**
- Check if `SENTRY_DSN` is set in environment variables
- Errors will still be logged to console, but not tracked in Sentry

---

### 6. **Server-Side Logs (API Routes)**

**If you have API routes that handle auth:**
- Check Netlify Functions logs
- Look for errors in `/api/auth/*` routes
- Check for Firebase Admin SDK errors

---

## Quick Diagnostic Checklist

Run through this when sign-in stops working:

### ✅ Step 1: Browser Console
- [ ] Open console, try sign-in
- [ ] Look for `[Google Sign-In]` logs
- [ ] Check for any red error messages
- [ ] Note the exact error code/message

### ✅ Step 2: Network Tab
- [ ] Check if redirect to Google happens
- [ ] Check if redirect back happens
- [ ] Look for failed requests

### ✅ Step 3: Firebase Console
- [ ] Verify Google sign-in is enabled
- [ ] Check authorized domains include your domain
- [ ] Check if users are being created

### ✅ Step 4: Environment Variables
- [ ] Verify `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is set correctly
- [ ] Verify `NEXT_PUBLIC_FIREBASE_API_KEY` is set
- [ ] Check if values changed recently

### ✅ Step 5: Recent Changes
- [ ] Check git history for recent changes to auth code
- [ ] Check if any dependencies were updated
- [ ] Check if Firebase project settings changed

---

## Common Issues & Log Patterns

### Issue: "No redirect result found"
**Logs:**
```
[Google Sign-In] No redirect result found (user may have navigated directly or cancelled)
[Login] No redirect result found - user navigated directly or cancelled
```

**Possible Causes:**
- User cancelled the Google sign-in
- Redirect URL mismatch
- Browser storage blocked (Safari ITP, private mode)
- Redirect happened but result was lost

**Fix:**
- Check if `currentUser` fallback works (should auto-detect)
- Check browser storage settings
- Verify redirect URL matches Firebase config

---

### Issue: "Unauthorized domain"
**Logs:**
```
[Google Sign-In] Redirect initiation failed: Error: auth/unauthorized-domain
[Google Sign-In] Domain not authorized. Check Firebase Console > Authentication > Settings > Authorized domains
```

**Fix:**
1. Go to Firebase Console → Authentication → Settings
2. Add your domain to "Authorized domains"
3. Wait a few minutes for changes to propagate

---

### Issue: "Operation not allowed"
**Logs:**
```
[Google Sign-In] Redirect initiation failed: Error: auth/operation-not-allowed
```

**Fix:**
1. Go to Firebase Console → Authentication → Sign-in method
2. Enable "Google" provider
3. Configure OAuth consent screen if needed

---

### Issue: Redirect loop
**Logs:**
```
[Login] Redirect initiated successfully - page will reload after Google sign-in
[Login] Checking for Google redirect result...
[Google Sign-In] No redirect result found
[Login] No redirect result found
```

**Possible Causes:**
- Redirect result not being stored/retrieved
- Auth state not ready when checking
- Browser storage issues

**Fix:**
- The retry logic should handle this
- Check if `currentUser` fallback works
- Try in incognito/private mode to rule out storage issues

---

## Exporting Logs for Debugging

### Browser Console Export:
1. Right-click in console
2. Select "Save as..." or copy all
3. Save to a text file

### Network Tab Export:
1. Right-click in Network tab
2. Select "Save all as HAR"
3. Share the HAR file for analysis

---

## Getting Help

When reporting the issue, include:
1. **Browser console logs** (filter by `[Google` or `[Login]`)
2. **Error messages** (exact text)
3. **Network tab** (HAR file if possible)
4. **Browser/device** (Chrome on Android, Safari on iOS, etc.)
5. **Time it stopped working** (after a deploy? after a change?)
6. **Firebase Console screenshot** (authorized domains, sign-in methods)

---

## Quick Test Script

Open browser console and run:
```javascript
// Check Firebase Auth config
console.log('Auth domain:', firebase?.auth?.()?.app?.options?.authDomain);
console.log('Current URL:', window.location.href);
console.log('Current user:', firebase?.auth?.()?.currentUser);

// Check if auth is ready
firebase?.auth?.()?.authStateReady().then(() => {
  console.log('Auth is ready');
}).catch(err => {
  console.error('Auth not ready:', err);
});
```
