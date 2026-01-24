# Google Sign-In Diagnosis

## Configuration Status: ✅ CORRECT

Your Firebase and Google Cloud configuration is correct:
- ✅ `wildlife.exchange` is in Firebase authorized domains
- ✅ `https://wildlife.exchange` is in Google Cloud authorized JavaScript origins
- ✅ `https://wildlife.exchange/__/auth/handler` is in authorized redirect URIs

## The Real Problem

Based on your logs showing:
- `wasExpectingRedirect: true` (redirect was initiated)
- `getRedirectResult returned null` (result not found)

**This is a URL mismatch issue.** Firebase stores the redirect result keyed by the **exact URL** that initiated the redirect.

### How Firebase Redirect Results Work

1. User clicks "Sign in with Google" on `https://wildlife.exchange/login`
2. `signInWithRedirect()` is called → Firebase stores result keyed by: `https://wildlife.exchange/login`
3. User goes through Google OAuth
4. Firebase redirects back to: `https://wildlife.exchange/login`
5. Page loads → `getRedirectResult()` looks for result keyed by: `https://wildlife.exchange/login`
6. **If URLs don't match exactly, result is null**

### What Could Cause URL Mismatch

1. **Query parameters** - If redirect initiated from `/login?something` but returns to `/login`
2. **Hash fragments** - If redirect initiated from `/login#something` but returns to `/login`
3. **Trailing slashes** - If redirect initiated from `/login/` but returns to `/login`
4. **Protocol mismatch** - If redirect initiated from `http://` but returns to `https://`
5. **Subdomain mismatch** - If redirect initiated from `www.wildlife.exchange` but returns to `wildlife.exchange`

### How to Diagnose

Add this logging to see the exact URLs:

```typescript
// In signInWithGoogle() - when redirect is initiated
console.log('[Google Sign-In] Initiating redirect from URL:', window.location.href);
console.log('[Google Sign-In] URL components:', {
  href: window.location.href,
  origin: window.location.origin,
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
});

// In getGoogleRedirectResult() - when checking for result
console.log('[Google Sign-In] Checking redirect result on URL:', window.location.href);
console.log('[Google Sign-In] URL components:', {
  href: window.location.href,
  origin: window.location.origin,
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
});
```

### Most Likely Cause

Since it was working before and suddenly stopped, the most likely cause is:

**The redirect is being initiated from a URL with query parameters or hash, but Firebase redirects back to the clean URL without them.**

For example:
- Initiated from: `https://wildlife.exchange/login?redirect=/dashboard`
- Returns to: `https://wildlife.exchange/login`
- Result: Firebase can't find the result because URLs don't match

### Solution

Firebase's `signInWithRedirect()` uses the current page URL. If you're on `/login?something`, it will store the result for that exact URL. But Firebase's redirect handler might redirect back to the clean `/login` URL.

**Fix:** Ensure the redirect URL is normalized before calling `signInWithRedirect()`, or use Firebase's `redirectUrl` parameter to explicitly set where to return.
