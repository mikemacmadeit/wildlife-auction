# Google Sign-In Checklist - Quick Fix

## ✅ Must Check These:

### 1. Firebase Console - Authorized Domains

**Link:** https://console.firebase.google.com/project/wildlife-exchange/authentication/settings

**Steps:**
1. Scroll to **"Authorized domains"** section
2. Check if `wildlife.exchange` is listed
3. **If missing:** Click **"Add domain"** → Enter `wildlife.exchange` → **Add**

**Required domains:**
- ✅ `wildlife.exchange` (MUST have this)
- ✅ `localhost` (should be there by default)
- ✅ `wildlife-exchange.firebaseapp.com` (auto-added)
- ✅ `wildlife-exchange.web.app` (auto-added)

---

### 2. Firebase Console - Enable Google Sign-In

**Link:** https://console.firebase.google.com/project/wildlife-exchange/authentication/providers

**Steps:**
1. Find **"Google"** in the providers list
2. Click on **"Google"**
3. Toggle **"Enable"** to ON
4. Enter support email (optional): `usalandspecialist@gmail.com`
5. Click **"Save"**

**This MUST be enabled!**

---

### 3. Wait Time

After making OAuth changes:
- ⏰ **Wait 2-5 minutes** for Google to update
- 🧹 **Clear browser cache** (Ctrl+Shift+Delete) OR use **Incognito mode**
- 🔄 **Try again**

---

### 4. Google Cloud Console - Already Done ✅

You already configured:
- ✅ JavaScript origins
- ✅ Redirect URIs

No changes needed here if you saved it.

---

## 🔍 Debug: Get Exact Error

1. Open your site: https://wildlife.exchange/login
2. Press **F12** (DevTools)
3. Go to **Console** tab
4. Click **"Sign in with Google"**
5. **Copy the exact error message** you see

**Common errors:**
- `auth/unauthorized-domain` → Missing authorized domain (fix #1)
- `auth/operation-not-allowed` → Google sign-in not enabled (fix #2)
- `auth/popup-blocked` → Popup blocked, code will auto-fallback to redirect
- `redirect_uri_mismatch` → Redirect URI issue (should be fixed)

---

## ⚡ Quick Test

**After checking all above:**

1. Open site in **Incognito mode** (Ctrl+Shift+N)
2. Go to: https://wildlife.exchange/login
3. Click **"Sign in with Google"**
4. Does it work?

**If still fails:**
- Check browser console for exact error
- Share the error message

---

## 🎯 Most Likely Issues

1. **Missing authorized domain** in Firebase Console (check #1 above)
2. **Google sign-in not enabled** (check #2 above)
3. **Not waiting long enough** (need 2-5 minutes after changes)

**Check #1 and #2 first - those are the most common issues!**
