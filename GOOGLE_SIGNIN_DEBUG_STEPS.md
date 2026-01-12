# Debug Google Sign-In Failure

## Step 1: Check Browser Console

1. Open your site in Chrome/Firefox
2. Press **F12** to open DevTools
3. Go to **Console** tab
4. Click "Sign in with Google"
5. **Copy the exact error message** you see

Look for errors like:
- `auth/unauthorized-domain`
- `auth/popup-blocked`
- `auth/operation-not-allowed`
- `redirect_uri_mismatch`

---

## Step 2: Check Network Tab

1. In DevTools, go to **Network** tab
2. Click "Sign in with Google"
3. Look for **red/failed requests**
4. Click on any failed request
5. Check the **Response** tab for error details

---

## Step 3: Verify Firebase Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **wildlife-exchange**
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Verify these are listed:
   - `wildlife.exchange` ✅
   - `localhost` ✅ (should be there by default)
   - `wildlife-exchange.firebaseapp.com` ✅
   - `wildlife-exchange.web.app` ✅

**If `wildlife.exchange` is missing:**
- Click **"Add domain"**
- Enter: `wildlife.exchange`
- Click **Add**

---

## Step 4: Check OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: **wildlife-exchange**
3. Go to **APIs & Services** → **OAuth consent screen**
4. Check:
   - **Publishing status**: Should be "Testing" or "In production"
   - **Authorized domains**: Should include `wildlife.exchange`

---

## Step 5: Wait and Clear Cache

OAuth changes can take 2-5 minutes to propagate:

1. **Wait 5 minutes** after saving OAuth settings
2. **Clear browser cache**:
   - Chrome: `Ctrl + Shift + Delete` → Select "Cached images and files" → Clear
   - Or use **Incognito mode** (Ctrl + Shift + N)
3. **Try again** in incognito mode

---

## Step 6: Check for Redirect vs Popup

The code tries popup first, then falls back to redirect.

**If you see a popup:**
- Check if it opens and closes immediately
- Check console for popup errors

**If it redirects:**
- You should be taken to Google sign-in page
- After signing in, you should be redirected back
- Check the URL after redirect - any error parameters?

---

## Common Error Codes

### `auth/unauthorized-domain`
- **Fix**: Add domain to Firebase Console → Authentication → Settings → Authorized domains

### `auth/popup-blocked`
- **Fix**: Allow popups for your site, or use redirect (code already handles this)

### `auth/operation-not-allowed`
- **Fix**: Enable Google sign-in in Firebase Console → Authentication → Sign-in method → Google → Enable

### `redirect_uri_mismatch`
- **Fix**: Verify redirect URIs in Google Cloud Console match exactly (including `/__/auth/handler`)

### `auth/invalid-api-key`
- **Fix**: Check environment variables, especially `NEXT_PUBLIC_FIREBASE_API_KEY`

---

## Quick Test Checklist

- [ ] Checked browser console for exact error
- [ ] Verified authorized domains in Firebase Console
- [ ] Verified OAuth redirect URIs in Google Cloud Console
- [ ] Waited 5 minutes after changes
- [ ] Cleared browser cache or tried incognito
- [ ] Verified Google sign-in is enabled in Firebase Console
- [ ] Checked environment variables are set correctly

---

## Next Steps

**Share the exact error message from the browser console** and we can fix it specifically!

Most likely issues:
1. **Not waiting long enough** (need 2-5 minutes for Google to update)
2. **Missing authorized domain** in Firebase Console
3. **Cache issues** (try incognito mode)
