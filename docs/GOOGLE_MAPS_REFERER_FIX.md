# Fix "RefererNotAllowedMapError" for address search

If you see **RefererNotAllowedMapError** in the console and address search doesn’t work in Complete Profile (or elsewhere), Google is blocking requests because your site URL isn’t allowed for the API key.

## 1. Which key is in use?

The app uses **one** of these (first one set wins):

- **NEXT_PUBLIC_GOOGLE_MAPS_KEY** (Netlify / `.env.local`)
- **NEXT_PUBLIC_FIREBASE_API_KEY** (Firebase “Browser key” if the above isn’t set)

Check **Netlify** → Environment variables. Whichever of these two is set is the key that must have the correct referrers.

**Verify you’re editing the right key:** In Netlify, the value is masked (e.g. `AIza…`). In Google Cloud Console → Credentials, each key shows a prefix (e.g. `AIzaSy…`). The key you edit must be the **same** key that’s in Netlify. If you have both NEXT_PUBLIC_GOOGLE_MAPS_KEY and NEXT_PUBLIC_FIREBASE_API_KEY set, the app uses **NEXT_PUBLIC_GOOGLE_MAPS_KEY** — so add referrers to that key, not the Firebase one.

## 2. Edit that key in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials**.
2. Open the **same** API key (the one whose value matches your env).
3. Under **Application restrictions** → **HTTP referrers (websites)**.
4. Under **Website restrictions**, add **exactly** (no trailing slash after the `*`):

   - `https://wildlife.exchange/*`
   - `https://www.wildlife.exchange/*`

   If you use a Netlify URL (e.g. `yoursite.netlify.app`), also add:

   - `https://*.netlify.app/*`

5. **Save**. Changes can take a few minutes to apply.

## 3. Format rules

- Use `https://` (or `http://` only for localhost).
- Use a trailing `/*` to allow all paths on that origin (e.g. `/seller/overview`, `/dashboard`).
- Do **not** put a slash after the asterisk: `https://wildlife.exchange/*` not `https://wildlife.exchange/*/`.
- Entries like `https://wildlife.exchange/` (no `*`) only allow the root URL, not paths like `/seller/overview`.

## 4. Complete Profile without search

If you need to finish Complete Profile before the referrer fix applies, use **“Enter address manually”** at the top of the Primary location section and fill in city, state, and ZIP.
