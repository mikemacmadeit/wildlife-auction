# Google OAuth - Exact Steps to Fix

## Step 1: Authorized JavaScript Origins

In the **"Authorized JavaScript origins"** section, add these **ONE PER LINE** (just the domains, NO paths):

```
https://wildlife.exchange
http://localhost:3000
https://wildlife-exchange.firebaseapp.com
https://wildlife-exchange.web.app
```

**Important:**
- NO trailing slashes (`/`)
- NO paths (just the domain)
- Must include `https://` or `http://`

---

## Step 2: Authorized Redirect URIs

In the **"Authorized redirect URIs"** section (DIFFERENT section below), add these **ONE PER LINE**:

```
https://wildlife.exchange/__/auth/handler
http://localhost:3000/__/auth/handler
https://wildlife-exchange.firebaseapp.com/__/auth/handler
https://wildlife-exchange.web.app/__/auth/handler
```

**Important:**
- These HAVE paths (`/__/auth/handler`)
- This is where the redirect URIs go
- Must include `https://` or `http://`

---

## Visual Guide

The OAuth Client edit page should look like this:

```
Name:
[Web client (auto created by Google Service)]

Authorized JavaScript origins (where the JavaScript runs):
[+] https://wildlife.exchange
[+] http://localhost:3000
[+] https://wildlife-exchange.firebaseapp.com
[+] https://wildlife-exchange.web.app

Authorized redirect URIs (where Google redirects after sign-in):
[+] https://wildlife.exchange/__/auth/handler
[+] http://localhost:3000/__/auth/handler
[+] https://wildlife-exchange.firebaseapp.com/__/auth/handler
[+] https://wildlife-exchange.web.app/__/auth/handler
```

---

## Common Mistakes

❌ **Wrong:** Adding `https://wildlife.exchange/__/auth/handler` to "Authorized JavaScript origins"
✅ **Correct:** Add it to "Authorized redirect URIs"

❌ **Wrong:** Adding `https://wildlife.exchange/` (trailing slash) to JavaScript origins
✅ **Correct:** `https://wildlife.exchange` (no trailing slash)

❌ **Wrong:** Missing `http://` or `https://`
✅ **Correct:** Always include the protocol

---

## Summary

1. **JavaScript Origins** = Just domains (no paths)
2. **Redirect URIs** = Domains WITH paths (`/__/auth/handler`)

These are TWO SEPARATE sections on the same page. Make sure you're adding to the correct one!
