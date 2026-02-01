# Netlify Deployment Guide

## Deploy like normal (push to Netlify)

**Your repo root is the app.** To deploy:

1. Commit and push to `main`:  
   `git add -A && git commit -m "your message" && git push origin main`
2. Netlify builds automatically. Wait for the deploy to show "Published" in the Deploys tab.

**Netlify Build settings:** Base directory must be **empty**. This repo has no subdirectory — the app is the repo root. If Base directory is set to `project` or anything else, clear it and redeploy.

---

## Step-by-Step: Connect GitHub to Netlify

### Step 1: Push Latest Changes to GitHub

Make sure all your code is pushed to GitHub:

```bash
cd "C:\Users\micha\OneDrive\Desktop\Wildlife Auction\project"
git push origin main
```

### Step 2: Connect to Netlify

1. **Go to Netlify Dashboard**
   - Visit: https://app.netlify.com
   - Sign in (or create account if needed)

2. **Add New Site**
   - Click **"Add new site"** button (top right)
   - Select **"Import an existing project"**

3. **Connect to GitHub**
   - Click **"Deploy with GitHub"**
   - Authorize Netlify to access your GitHub account (if prompted)
   - Grant access to your repositories

4. **Select Your Repository**
   - Search for: `wildlife-auction`
   - Click on `mikemacmadeit/wildlife-auction`

5. **Configure Build Settings**
   Netlify reads `netlify.toml` from this repo; you usually don't need to override. If you set anything manually:
   - **Base directory**: Leave **empty** (this repo root is the app)
   - **Build command**: from `netlify.toml` (or `npm run build` as fallback)
   - **Publish directory**: `.next`
   - **Node version**: 18.x or 20.x

6. **Click "Deploy site"**

### Step 3: Add Environment Variables

**CRITICAL:** Add all environment variables before the first deployment completes:

1. In Netlify dashboard, go to:
   - **Site settings** → **Environment variables** → **Add a variable**

2. Add these variables (from your `.env.local` file):

   **Firebase Public Variables:**
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (if you have it)

   **Firebase Admin Variables (for server-side):**
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (⚠️ Keep the newlines! Use triple quotes or `\n`)

   **Other Variables (if you use them):**
   - Any other API keys or secrets

3. **After adding variables:**
   - Go to **Deploys** tab
   - Click **"Trigger deploy"** → **"Clear cache and deploy site"**

### Step 4: Verify Deployment

1. **Check Build Logs**
   - Go to **Deploys** tab
   - Click on the latest deploy
   - Check for any errors

2. **Visit Your Site**
   - Netlify provides a URL like: `https://wildlife-auction-xyz.netlify.app`
   - Test key functionality:
     - Homepage loads
     - Browse listings
     - Authentication works
     - Create listing (if logged in)

### Step 5: Configure Custom Domain (Optional)

1. Go to **Site settings** → **Domain management**
2. Click **"Add custom domain"**
3. Follow Netlify's DNS instructions

## Troubleshooting

### "Page not found" (Netlify's default 404)

If you see **Netlify's** 404 page (the one that says "visit Netlify's page not found support guide"), your requests are **not** reaching the Next.js app. Fix it like this:

1. **Let the Next.js plugin control the publish directory**
   - Netlify Dashboard → **Site settings** → **Build & deploy** → **Build** → **Publish directory**
   - **Clear the value** (leave it empty) so `@netlify/plugin-nextjs` sets it. Do **not** set it to `.next` manually.
   - Save, then **Deploys** → **Trigger deploy** → **Clear cache and deploy site**.

2. **Confirm the build succeeded**
   - **Deploys** → open the latest deploy → check the build log.
   - If the build failed (e.g. missing env, script error), fix that first; a failed build can leave the site showing 404.

3. **Note which URL 404s**
   - If only one path 404s (e.g. `/help/foo`), that route may not exist in the app.
   - If every path (including `/`) 404s, the publish directory or build output is wrong (step 1 and 2).

### Build Fails?

**Check:**
- Build logs for specific errors
- All environment variables are set correctly
- `netlify.toml` is in the repository
- Node version is compatible (18.x or 20.x)

### 4KB Environment Variable Limit Error?

The `netlify-plugin-inline-functions-env` plugin should handle this automatically. If you still see errors:
- Verify plugin is in `package.json` dependencies
- Check `netlify.toml` has plugin listed BEFORE `@netlify/plugin-nextjs`
- Plugin order matters!

### Environment Variables Not Working?

- Make sure variables are set in Netlify dashboard
- Variables prefixed with `NEXT_PUBLIC_` are available in browser
- Other variables are server-side only
- Redeploy after adding variables

### Firebase Errors?

- Verify all Firebase config variables are set
- Check Firebase project settings
- Ensure authorized domains include your Netlify URL

## Quick Reference

**Repository:** https://github.com/mikemacmadeit/wildlife-auction  
**Netlify Dashboard:** https://app.netlify.com  
**Your Site:** https://[your-site-name].netlify.app

## Next Steps After Deployment

1. **Update Firebase Authorized Domains**
   - Go to Firebase Console → Authentication → Settings → Authorized domains
   - Add your Netlify domain

2. **Test Production Build**
   - Test all major features
   - Check mobile responsiveness
   - Verify authentication flow

3. **Set Up Custom Domain** (optional)
   - Configure DNS settings
   - Enable HTTPS (automatic with Netlify)

4. **Monitor Deployments**
   - Netlify auto-deploys on every push to `main` branch
   - Check deploy logs if issues arise
