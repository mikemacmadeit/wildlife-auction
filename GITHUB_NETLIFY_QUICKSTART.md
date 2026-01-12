# Quick Start: GitHub & Netlify Setup

## ✅ What's Already Done
- ✅ Git repository initialized
- ✅ Initial commit created
- ✅ Netlify plugin installed
- ✅ `.gitignore` configured (sensitive files excluded)

## 🚀 Next Steps

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `wildlife-auction` (or your choice)
3. Description: "Wildlife Auction Marketplace"
4. Choose Public or Private
5. **DO NOT** check "Initialize with README" (we already have files)
6. Click **"Create repository"**

### Step 2: Connect & Push to GitHub

After creating the repo, GitHub will show you commands. Use these (replace `YOUR_USERNAME`):

```powershell
cd "C:\Users\micha\OneDrive\Desktop\Wildlife Auction\project"

# Add GitHub remote
git remote add origin https://github.com/YOUR_USERNAME/wildlife-auction.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

**If you get authentication errors:**
- Use a Personal Access Token instead of password
- Or use SSH: `git remote add origin git@github.com:YOUR_USERNAME/wildlife-auction.git`

### Step 3: Connect to Netlify

1. Go to https://app.netlify.com
2. Click **"Add new site"** → **"Import an existing project"**
3. Click **"Deploy with GitHub"**
4. Authorize Netlify (if prompted)
5. Select your repository: `wildlife-auction`
6. Netlify will auto-detect settings (should show):
   - Build command: `npm run build`
   - Publish directory: `.next`
7. Click **"Deploy site"**

### Step 4: Add Environment Variables

**IMPORTANT:** Before deployment completes, add your environment variables:

1. In Netlify dashboard, go to: **Site settings** → **Environment variables**
2. Click **"Add a variable"**
3. Add all variables from your `.env` file. Key ones:
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (keep the newlines!)
   - Any other variables you use

4. After adding variables, go to **Deploys** tab
5. Click **"Trigger deploy"** → **"Clear cache and deploy site"**

### Step 5: Verify Deployment

1. Wait for build to complete (check Deploy log)
2. Visit your site URL (Netlify provides it)
3. Test the site:
   - Homepage loads
   - Can browse listings
   - Authentication works

## 🔧 Troubleshooting

### Build Fails?
- Check **Deploy log** for errors
- Verify all environment variables are set
- Make sure `netlify.toml` is in the repo

### 4KB Env Var Limit Error?
- The plugin should handle this automatically
- Verify `netlify-plugin-inline-functions-env` is in `package.json`
- Check `netlify.toml` has the plugin listed BEFORE `@netlify/plugin-nextjs`

### Authentication Issues?
- Use GitHub Personal Access Token (Settings → Developer settings → Personal access tokens)
- Or set up SSH keys for GitHub

## 📝 Future Updates

After making changes:

```powershell
cd "C:\Users\micha\OneDrive\Desktop\Wildlife Auction\project"

# Stage changes
git add .

# Commit
git commit -m "Your commit message"

# Push to GitHub (Netlify will auto-deploy)
git push origin main
```

Netlify will automatically deploy when you push to the `main` branch!

## 🎯 Quick Reference

**GitHub Repo:** https://github.com/YOUR_USERNAME/wildlife-auction  
**Netlify Dashboard:** https://app.netlify.com  
**Your Site:** https://your-site-name.netlify.app (after deployment)
