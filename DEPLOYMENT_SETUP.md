# GitHub & Netlify Deployment Setup Guide

## Step 1: Create Initial Commit (Already Done)
✅ Git repository initialized
✅ Files staged

## Step 2: Create GitHub Repository

### Option A: Using GitHub Website (Recommended)
1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **"+"** icon in the top right → **"New repository"**
3. Repository settings:
   - **Repository name**: `wildlife-auction` (or your preferred name)
   - **Description**: "Wildlife Auction Marketplace - Next.js Application"
   - **Visibility**: Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
4. Click **"Create repository"**

### Option B: Using GitHub CLI (if installed)
```bash
gh repo create wildlife-auction --public --source=. --remote=origin --push
```

## Step 3: Connect Local Repository to GitHub

After creating the repository on GitHub, you'll see instructions. Run these commands:

```bash
cd "C:\Users\micha\OneDrive\Desktop\Wildlife Auction\project"

# Create initial commit (if not done)
git commit -m "Initial commit: Wildlife Auction Marketplace"

# Add GitHub remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/wildlife-auction.git

# Or if using SSH:
# git remote add origin git@github.com:YOUR_USERNAME/wildlife-auction.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 4: Connect to Netlify

### Via Netlify Dashboard:
1. Go to [Netlify.com](https://netlify.com) and sign in
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **"Deploy with GitHub"**
4. Authorize Netlify to access your GitHub account
5. Select your repository: `wildlife-auction`
6. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
   - **Base directory**: Leave empty (or `project` if deploying from subdirectory)
7. Click **"Deploy site"**

### Environment Variables Setup:
1. In Netlify dashboard, go to **Site settings** → **Environment variables**
2. Add all your environment variables from `.env.example`:
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - And any other variables you need

### Important: Netlify Configuration
The `netlify.toml` file is already configured with:
- ✅ Build command: `npx next build`
- ✅ Publish directory: `.next`
- ✅ Next.js plugin configured
- ✅ Environment variable inlining plugin (to bypass 4KB limit)

## Step 5: Verify Deployment

1. After deployment completes, check the **Deploy log** for any errors
2. Visit your site URL (provided by Netlify)
3. Test key functionality:
   - Homepage loads
   - Authentication works
   - Listings display correctly

## Troubleshooting

### If deployment fails:
1. **Check build logs** in Netlify dashboard
2. **Verify environment variables** are all set correctly
3. **Check `netlify.toml`** configuration
4. **Review error messages** - common issues:
   - Missing environment variables
   - Build command errors
   - Plugin configuration issues

### If 4KB env var limit error persists:
- The `netlify-plugin-inline-functions-env` plugin should handle this
- Verify plugin is listed BEFORE `@netlify/plugin-nextjs` in `netlify.toml`
- Check that plugin is installed: `npm install netlify-plugin-inline-functions-env`

## Next Steps After Deployment

1. **Set up custom domain** (optional) in Netlify dashboard
2. **Configure Firebase** for production:
   - Update authorized domains in Firebase Console
   - Configure production Firestore rules
   - Set up production storage rules
3. **Enable analytics** (optional) in Netlify
4. **Set up CI/CD** - automatic deployments on push to main branch

## Quick Reference Commands

```bash
# Check git status
git status

# Add all changes
git add .

# Commit changes
git commit -m "Your commit message"

# Push to GitHub
git push origin main

# Check remote
git remote -v

# View deployment logs (in Netlify dashboard)
# Site settings → Deploys → Click on deploy → View logs
```
