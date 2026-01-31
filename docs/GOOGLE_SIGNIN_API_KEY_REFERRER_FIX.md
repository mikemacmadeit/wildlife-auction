# Fix: "The requested action is invalid" / API_KEY_HTTP_REFERRER_BLOCKED (Google Sign-In)

## What you see

- **Browser:** "The requested action is invalid" when signing in with Google (local or production).
- **Console:** `403`, `API_KEY_HTTP_REFERRER_BLOCKED`, or:
  - `"Requests from referer https://wildlife-exchange.firebaseapp.com/ are blocked."`
  - `identitytoolkit.googleapis.com` or `getProjectConfig` failing with 403.

## Cause

The **Google Cloud API key** used as `NEXT_PUBLIC_FIREBASE_API_KEY` has **Application restrictions** set to **HTTP referrers**. Firebase Auth (and the Google Identity Services iframe) send requests whose **referrer** is your Firebase Auth domain (e.g. `https://wildlife-exchange.firebaseapp.com/`). If that referrer is not in the allow list, Google blocks the request and sign-in fails.

This is **separate** from:

- **OAuth client** "Authorized JavaScript origins" (that’s for the OAuth client ID, not the API key).
- **Firebase** "Authorized domains" (that’s for which domains can use Firebase Auth).

Here we fix the **API key** restrictions in **Google Cloud Console**.

## Fix (do this once)

1. Open **[Google Cloud Console](https://console.cloud.google.com/)** and select the **same project** as your Firebase project (e.g. wildlife-exchange / project number `997321283928`).

2. Go to **APIs & Services → Credentials**.

3. Under **API keys**, open the key that you use as **`NEXT_PUBLIC_FIREBASE_API_KEY`** in your app (often the "Browser key" or "Web client" key).

4. In **Application restrictions**:
   - If it’s **"None"**: you’re done; no referrer blocking. If you still see 403, the cause is elsewhere.
   - If it’s **"HTTP referrers"**: add the following **Website restrictions** (one per line). Use your actual project/auth domain if different:
     - `https://wildlife-exchange.firebaseapp.com/*`
     - `https://wildlife-exchange.firebaseapp.com`
     - `http://localhost:3000/*`
     - `http://localhost:3000`
     - `http://localhost/*`
     - `http://127.0.0.1:3000/*`
     - `http://127.0.0.1:*`
     - Your production domain(s), e.g.:
       - `https://wildlife.exchange/*`
       - `https://your-site.netlify.app/*`

5. **Save**.

6. Wait a few minutes for changes to propagate, then try Google sign-in again (hard refresh or incognito if needed).

## Optional: restrict key by API

To reduce abuse risk while keeping sign-in working:

- Under **API restrictions**, choose **"Restrict key"** and enable only the APIs you need for Auth (e.g. **Identity Toolkit API**, **Token Service API**).  
- Do **not** remove the HTTP referrer entries above; they are required for the key to work from your app and Firebase auth domain.

## Summary

| What                    | Where                         | Fix                                                                 |
|-------------------------|-------------------------------|---------------------------------------------------------------------|
| API key referrer block  | Google Cloud → Credentials → API key → Application restrictions | Add Firebase auth domain + localhost + production domains to HTTP referrers |

After adding these referrers, Google sign-in (including on localhost) should work again.
