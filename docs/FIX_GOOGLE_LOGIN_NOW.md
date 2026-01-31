# Fix "The requested action is invalid" – do this now

**Proven from your app:** The app uses the Firebase API key that **ends with `2lrc`** and auth domain **`wildlife-exchange.firebaseapp.com`**. Google is blocking requests from that auth domain because the key’s HTTP referrer list doesn’t allow it.

## Steps (5 minutes)

1. Open **[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)** and select the project **wildlife-exchange** (or the one that owns your Firebase app).

2. Under **API keys**, find the key whose value **ends with `2lrc`** (the one you use as `NEXT_PUBLIC_FIREBASE_API_KEY`). Click it to edit.

3. Under **Application restrictions**:
   - If it’s **"None"** → switch to **"HTTP referrers"** and add the referrers below (then Save).  
   - If it’s **"HTTP referrers (web sites)"** → add any missing lines below. **Do not remove existing lines.** Ensure these are in the list:
     - `https://wildlife-exchange.firebaseapp.com/*`
     - `https://wildlife-exchange.firebaseapp.com`
     - `http://localhost:3000/*`
     - `http://localhost:3000`
     - Your production domain(s), e.g. `https://wildlife.exchange/*` or your Netlify URL.

4. Click **Save**.

5. Wait 2–5 minutes, then try **Sign in with Google** again (hard refresh or incognito).

## Why this fixes it

The error comes from **Google’s servers** when the Firebase Auth iframe calls Identity Toolkit with referrer `https://wildlife-exchange.firebaseapp.com/`. That key’s “HTTP referrers” list is what allows or blocks that. Adding `https://wildlife-exchange.firebaseapp.com/*` (and the others above) to **the key ending in `2lrc`** fixes it. No code changes are required.

## If you have several keys

Only the key whose value **ends with `2lrc`** is used by the app. Edit that one. If you’re not sure, in Credentials click each “Browser key” / “Web client” key and check the last 4 characters; the one ending in `2lrc` is the one to update.
