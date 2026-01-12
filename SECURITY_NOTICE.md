# ⚠️ SECURITY NOTICE: Exposed API Key

## What Happened

GitHub detected an exposed Firebase API key in the repository commit history. The key `AIzaSyBXBK_jtB_grkJ_GwCXeHoM9ce0dEx2lrc` was hardcoded in:
- `scripts/seed-listings.ts` (line 24)
- `lib/firebase/config.ts` (line 8)

## ✅ What Was Fixed

1. **Removed all hardcoded API keys** from the codebase
2. **Updated configuration** to require environment variables only
3. **Updated documentation** to use placeholder values
4. **Pushed security fix** to GitHub

## 🔒 CRITICAL: Rotate the Exposed Key

**The exposed API key is now in the public Git history and should be considered compromised.**

### Steps to Rotate Firebase API Key:

1. **Go to Firebase Console:**
   - Visit: https://console.firebase.google.com/project/wildlife-exchange/settings/general
   - Scroll to **"Your apps"** section

2. **Regenerate API Key:**
   - Click on your web app
   - Click **"Regenerate key"** next to the API key
   - **OR** create a new web app and use its API key

3. **Update Environment Variables:**
   - Update `.env.local` with the new API key
   - Update Netlify environment variables (if deployed)
   - Update any other deployment environments

4. **Restrict Old Key (Optional but Recommended):**
   - In Firebase Console → Project Settings → General
   - Under "API keys", you can restrict the old key or delete it
   - Set HTTP referrer restrictions to limit usage

### Additional Security Measures:

1. **Review Firebase Security Rules:**
   - Ensure Firestore rules are properly configured
   - Ensure Storage rules are properly configured
   - Review Authentication settings

2. **Monitor for Unauthorized Access:**
   - Check Firebase Console → Usage and billing for unusual activity
   - Review Firestore logs for suspicious queries
   - Monitor Storage usage

3. **Best Practices Going Forward:**
   - ✅ Never commit API keys or secrets to Git
   - ✅ Always use environment variables
   - ✅ Use `.env.local` for local development (already in `.gitignore`)
   - ✅ Use Netlify environment variables for production
   - ✅ Consider using Firebase App Check for additional security

## Current Status

- ✅ Hardcoded keys removed from codebase
- ✅ Configuration now requires environment variables
- ⚠️ **Old API key still needs to be rotated** (see steps above)
- ✅ `.gitignore` properly configured to exclude `.env.local`

## Verification

After rotating the key, verify:
1. Local development still works with new key in `.env.local`
2. Netlify deployment works with new key in environment variables
3. All Firebase services (Auth, Firestore, Storage) function correctly

## Questions?

If you need help rotating the key or have security concerns, refer to:
- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Security Best Practices](https://firebase.google.com/docs/projects/best-practices)

---

**Date:** $(Get-Date -Format "yyyy-MM-dd")  
**Status:** Security fix deployed, key rotation required
