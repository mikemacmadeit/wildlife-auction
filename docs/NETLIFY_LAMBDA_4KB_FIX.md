# Fix: Netlify Deploy — "Environment variables exceed the 4KB limit"

**Error:** `Failed to create function: invalid parameter for function creation: Your environment variables exceed the 4KB limit imposed by AWS Lambda.`

Netlify sends all site env vars (with **Functions** scope) to every Lambda. AWS allows at most **4KB** total per function. Large Firebase vars push you over.

---

## Fix (one-time, in Netlify UI)

1. Open **Netlify** → your site (wildlifeexchange) → **Site configuration** → **Environment variables**.
2. For each variable below, click **Edit** → set **Scopes** to **Builds only** (uncheck **Functions**):
   - **`FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`**
   - **`FIREBASE_PRIVATE_KEY`** (if present)
   - **`FIREBASE_CLIENT_EMAIL`** (if present)
3. **Save**.
4. **Deploys** → **Trigger deploy** → **Deploy site** (or push to `main`).

After this, the build still has these vars (so the build script can write the Firebase JSON file), but Lambda won’t receive them, so you stay under 4KB. Runtime uses `netlify/secrets/firebase-service-account.json` (see `lib/firebase/admin.ts`).

---

## Why this works

- **Build:** `scripts/netlify-write-firebase-service-account.mjs` runs first and writes `netlify/secrets/firebase-service-account.json`.
- **Deploy:** That file is bundled into functions via `netlify.toml` → `included_files`.
- **Runtime:** Firebase Admin reads from that file first, so it does not need the base64 env var at runtime.

No code change required—only Netlify env var scopes.
