# Google Sign-In Troubleshooting Guide

## Common Issues and Solutions

### 1. "Unauthorized Domain" Error

**Error Code:** `auth/unauthorized-domain`

**Solution:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project → **Authentication** → **Settings** → **Authorized domains**
3. Add your domain:
   - For production: `wildlife.exchange`
   - For local development: `localhost`
4. Click **Add**

**Note:** Firebase automatically includes:
- `localhost` (for development)
- `*.firebaseapp.com`
- `*.web.app`

### 2. "Operation Not Allowed" Error

**Error Code:** `auth/operation-not-allowed`

**Solution:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project → **Authentication** → **Sign-in method**
3. Find **Google** in the list
4. Click **Enable**
5. Enter your **Support email** (required)
6. Click **Save**

### 3. OAuth Consent Screen Not Configured

**Error:** Google OAuth consent screen needs configuration

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (same as Firebase project)
3. Navigate to **APIs & Services** → **OAuth consent screen**
4. Configure:
   - User Type: **External** (for public apps)
   - App name: "Wildlife Exchange"
   - User support email: Your email
   - Developer contact: Your email
5. Add scopes (if needed):
   - `email`
   - `profile`
   - `openid`
6. Add test users (if in testing mode)
7. Click **Save and Continue**

### 4. Popup Blocked

**Error Code:** `auth/popup-blocked`

**Solution:**
- The code automatically falls back to redirect
- If you see this error, it means the popup was blocked
- The redirect should happen automatically
- If not, check browser console for errors

### 5. Redirect Not Working

**Issue:** After Google sign-in redirect, user is not signed in

**Solution:**
1. Check that `getGoogleRedirectResult()` is called on page load
2. Verify the redirect URL is correct in Firebase Console
3. Check browser console for errors
4. Ensure cookies/localStorage are enabled

### 6. Missing OAuth Client ID

**Error:** OAuth client not configured

**Solution:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project → **Project Settings** → **General**
3. Scroll to **Your apps** → Select your web app
4. Check that **OAuth redirect domains** includes:
   - `wildlife.exchange`
   - `localhost` (for development)
5. If missing, add them

### 7. Production Domain Not Authorized

**Issue:** Works on localhost but not on production

**Solution:**
1. Add production domain to Firebase:
   - Firebase Console → **Authentication** → **Settings** → **Authorized domains**
   - Add: `wildlife.exchange`
2. Add OAuth redirect URI in Google Cloud Console:
   - Google Cloud Console → **APIs & Services** → **Credentials**
   - Find your OAuth 2.0 Client ID
   - Add authorized redirect URI: `https://wildlife.exchange`
   - Add authorized JavaScript origins: `https://wildlife.exchange`

---

## Step-by-Step Firebase Setup

### Enable Google Sign-In Provider

1. **Firebase Console** → Your Project → **Authentication**
2. Click **Sign-in method** tab
3. Find **Google** in the providers list
4. Click **Enable**
5. Enter **Support email** (required)
6. Click **Save**

### Add Authorized Domains

1. **Firebase Console** → **Authentication** → **Settings**
2. Scroll to **Authorized domains**
3. Click **Add domain**
4. Add:
   - `wildlife.exchange` (production)
   - `localhost` (already included, but verify)
5. Click **Add**

### Verify OAuth Configuration

1. **Firebase Console** → **Project Settings** → **General**
2. Scroll to **Your apps** → Select your web app
3. Check **OAuth redirect domains** includes:
   - `wildlife.exchange`
   - `localhost` (for development)

---

## Step-by-Step Google Cloud Console Setup

### Configure OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Navigate to **APIs & Services** → **OAuth consent screen**
4. Configure:
   - **User Type:** External (for public apps)
   - **App name:** Wildlife Exchange
   - **User support email:** Your email
   - **Developer contact:** Your email
5. Click **Save and Continue**
6. Add scopes (if needed):
   - `email`
   - `profile`
   - `openid`
7. Add test users (if in testing mode)
8. Click **Save and Continue**

### Configure OAuth Client

1. **Google Cloud Console** → **APIs & Services** → **Credentials**
2. Find your **OAuth 2.0 Client ID** (created by Firebase)
3. Click to edit
4. Add **Authorized JavaScript origins:**
   - `https://wildlife.exchange`
   - `http://localhost:3000` (for development)
5. Add **Authorized redirect URIs:**
   - `https://wildlife.exchange`
   - `http://localhost:3000` (for development)
6. Click **Save**

---

## Testing Checklist

- [ ] Google sign-in provider is enabled in Firebase
- [ ] Authorized domains include production domain
- [ ] OAuth consent screen is configured
- [ ] OAuth client has correct redirect URIs
- [ ] Environment variables are set correctly
- [ ] Test in incognito mode (to avoid cache issues)
- [ ] Check browser console for errors
- [ ] Verify redirect result handler is called

---

## Debug Steps

### 1. Check Browser Console

Open browser DevTools → Console tab and look for:
- Firebase errors
- Google OAuth errors
- Network errors

### 2. Check Network Tab

1. Open DevTools → Network tab
2. Try Google sign-in
3. Look for failed requests
4. Check request/response details

### 3. Check Firebase Console Logs

1. Firebase Console → **Authentication** → **Users**
2. Check if user was created
3. Check for error messages

### 4. Test with Different Browsers

- Chrome
- Firefox
- Safari
- Edge

### 5. Test in Incognito Mode

- Clears cache and cookies
- Rules out extension interference

---

## Common Error Messages

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `auth/unauthorized-domain` | Domain not authorized | Add domain to Firebase authorized domains |
| `auth/operation-not-allowed` | Google sign-in not enabled | Enable Google provider in Firebase |
| `auth/popup-blocked` | Popup blocked by browser | Code auto-falls back to redirect |
| `auth/popup-closed-by-user` | User closed popup | User action, not an error |
| `auth/cancelled-popup-request` | Multiple popup requests | Wait and try again |
| `auth/network-request-failed` | Network error | Check internet connection |
| `auth/internal-error` | Firebase internal error | Check Firebase status, try again |

---

## Quick Fix Checklist

1. ✅ Enable Google sign-in in Firebase Console
2. ✅ Add `wildlife.exchange` to authorized domains
3. ✅ Configure OAuth consent screen in Google Cloud Console
4. ✅ Add redirect URIs in Google Cloud Console (CRITICAL - fixes "illegal URL" error)
5. ✅ Verify environment variables are set
6. ✅ Clear browser cache and cookies
7. ✅ Test in incognito mode
8. ✅ Check browser console for errors

---

## 🔴 FIX: "Illegal URL" Error

This error means the redirect URI is not configured in Google Cloud Console.

### Step-by-Step Fix:

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select your Firebase project (wildlife-exchange)

2. **Navigate to OAuth Credentials**
   - Go to **APIs & Services** → **Credentials**
   - Find your **OAuth 2.0 Client ID** (created by Firebase)
   - Click to edit it

3. **Add Authorized JavaScript origins:**
   ```
   https://wildlife.exchange
   http://localhost:3000
   https://wildlife-exchange.firebaseapp.com
   ```

4. **Add Authorized redirect URIs (CRITICAL):**
   ```
   https://wildlife.exchange/__/auth/handler
   http://localhost:3000/__/auth/handler
   https://wildlife-exchange.firebaseapp.com/__/auth/handler
   https://wildlife-exchange.web.app/__/auth/handler
   ```

5. **Click Save**

**Important Notes:**
- The `/__/auth/handler` path is required for Firebase redirects
- Make sure there are NO trailing slashes
- Use `https://` for production, `http://` for localhost
- Wait a few minutes for changes to propagate

### Alternative: Use Firebase's Auto-Generated URIs

Firebase automatically adds redirect URIs, but you may need to verify them:

1. **Firebase Console** → **Project Settings** → **General**
2. Scroll to **Your apps** → Select your web app
3. Check **OAuth redirect domains** section
4. Verify these domains are listed:
   - `wildlife.exchange`
   - `localhost` (for development)

If not listed, add them manually.

---

## Still Not Working?

If Google sign-in still fails after following all steps:

1. **Check Firebase Status**: https://status.firebase.google.com/
2. **Check Google Cloud Status**: https://status.cloud.google.com/
3. **Review Firebase Documentation**: https://firebase.google.com/docs/auth/web/google-signin
4. **Check Error Logs**: Browser console and Firebase Console
5. **Contact Support**: Provide error codes and steps to reproduce

---

## Environment Variables Required

Make sure these are set in `.env.local` and Netlify:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=wildlife-exchange.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=wildlife-exchange
```

All other Firebase config variables should also be set.
