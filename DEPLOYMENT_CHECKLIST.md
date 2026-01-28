# Deployment Checklist - Chatbot Improvements

## ✅ Pre-Deployment Status

- ✅ All code committed and pushed to GitHub
- ✅ Latest commits include:
  - Comprehensive chatbot improvements
  - User role detection
  - Conversation memory
  - Suggested follow-up questions
  - Better error handling
  - Context-aware responses
  - Enhanced KB articles

## 🚀 Deployment Steps

### Step 1: Verify Netlify Auto-Deployment

Since Netlify is connected to GitHub, it should **automatically deploy** when you push to `main`. 

**Check deployment status:**
1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Find your site: `wildlife-auction` (or your site name)
3. Check the **Deploys** tab
4. Look for the latest deploy (should show "Published" or "Building")

**If deployment is in progress:**
- Wait for it to complete (usually 3-5 minutes)
- Check build logs for any errors

**If deployment hasn't started:**
- Go to **Deploys** tab
- Click **"Trigger deploy"** → **"Clear cache and deploy site"**

**To trigger "clear cache and deploy" from the repo** (e.g. for users seeing an old cached experience):
- Set `NETLIFY_BUILD_HOOK_URL` to your build hook URL (Site configuration > Build & deploy > Build hooks), then run: `npm run deploy:clear-cache`

### Step 2: Verify Environment Variables

Make sure these environment variables are set in Netlify:

**Required for Chatbot:**
- ✅ `OPENAI_API_KEY` - For AI chat responses
- ✅ `AI_HELP_CHAT_ENABLED=true` - Enable the chatbot feature
- ✅ `AI_ADMIN_SUMMARY_ENABLED=true` - (Optional) For admin summaries
- ✅ `AI_ADMIN_DRAFT_ENABLED=true` - (Optional) For admin draft responses

**Firebase Variables:**
- ✅ `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- ✅ `NEXT_PUBLIC_FIREBASE_API_KEY`
- ✅ `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- ✅ `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- ✅ `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- ✅ `NEXT_PUBLIC_FIREBASE_APP_ID`
- ✅ `FIREBASE_PROJECT_ID`
- ✅ `FIREBASE_CLIENT_EMAIL`
- ✅ `FIREBASE_PRIVATE_KEY`

**To add/verify variables:**
1. Go to **Site settings** → **Environment variables**
2. Check that all required variables are present
3. If missing, click **"Add a variable"** and add them

### Step 3: Sync Knowledge Base to Firestore

**IMPORTANT:** After deployment, you need to sync the KB articles to Firestore.

**Option A: Run locally and push to Firestore**
```bash
# From project directory
npx tsx scripts/syncKnowledgeBaseToFirestore.ts
```

**Option B: Use Firebase Admin Console**
- Go to Firebase Console
- Navigate to Firestore Database
- Manually create/update articles in `knowledgeBaseArticles` collection

**Option C: Create a one-time deployment script**
- Add a script that runs on first deployment
- Or use Firebase Admin SDK to seed the KB

### Step 4: Test the Deployment

After deployment completes, test these features:

**Chatbot Features:**
1. ✅ Open Help panel (bottom-right button)
2. ✅ Click "Ask" tab
3. ✅ Try asking: "How do I sign in?"
4. ✅ Verify conversation history works (ask follow-up)
5. ✅ Check that sources are clickable
6. ✅ Verify suggested questions appear
7. ✅ Test on different pages (should use context)

**User Role Detection:**
1. ✅ Sign in as a buyer - verify buyer-specific responses
2. ✅ Sign in as a seller - verify seller-specific responses
3. ✅ Test as anonymous user - should work too

**Error Handling:**
1. ✅ Test with slow network (should timeout gracefully)
2. ✅ Test with invalid questions (should get helpful fallback)

### Step 5: Monitor Deployment

**Check build logs:**
1. Go to **Deploys** tab in Netlify
2. Click on the latest deploy
3. Review build logs for:
   - ✅ Build completed successfully
   - ✅ No TypeScript errors
   - ✅ No missing dependencies
   - ✅ KB check script ran (or was skipped gracefully)

**Common Issues to Watch For:**
- ❌ Missing environment variables
- ❌ TypeScript compilation errors
- ❌ Missing dependencies
- ❌ Build timeout (shouldn't happen with current setup)

## 🔧 Post-Deployment Tasks

### 1. Sync Knowledge Base

Run the KB sync script to populate Firestore:

```bash
npx tsx scripts/syncKnowledgeBaseToFirestore.ts
```

This will:
- Read all `.md` files from `knowledge_base/` directory
- Parse frontmatter
- Upsert articles to Firestore `knowledgeBaseArticles` collection
- Update versions and timestamps

### 2. Verify KB Articles in Firestore

1. Go to Firebase Console
2. Navigate to Firestore Database
3. Check `knowledgeBaseArticles` collection
4. Verify articles are present and `enabled: true`

### 3. Test Chatbot with Real KB

1. Ask questions that should match KB articles
2. Verify responses reference the KB
3. Check that sources are displayed correctly
4. Test conversation memory across multiple messages

## 📊 Deployment Verification

**Quick Test Checklist:**
- [ ] Site loads without errors
- [ ] Help button appears (bottom-right)
- [ ] Chat tab works
- [ ] Can ask questions and get responses
- [ ] Sources are clickable
- [ ] Suggested questions appear
- [ ] Conversation history persists
- [ ] User role detection works
- [ ] Context-aware responses work

## 🐛 Troubleshooting

### If chatbot doesn't work:

1. **Check environment variables:**
   - `OPENAI_API_KEY` is set
   - `AI_HELP_CHAT_ENABLED=true`

2. **Check KB articles:**
   - Run sync script
   - Verify articles in Firestore
   - Check `enabled: true` on articles

3. **Check browser console:**
   - Look for JavaScript errors
   - Check network requests to `/api/help/chat`

4. **Check Netlify function logs:**
   - Go to **Functions** tab in Netlify
   - Check for errors in API route

### If deployment fails:

1. **Check build logs** for specific errors
2. **Verify all dependencies** are in `package.json`
3. **Check TypeScript errors** - run `npm run typecheck` locally
4. **Verify `netlify.toml`** is correct

## ✅ Success Criteria

Deployment is successful when:
- ✅ Site builds without errors
- ✅ All pages load correctly
- ✅ Chatbot is accessible and functional
- ✅ KB articles are synced to Firestore
- ✅ User can ask questions and get helpful responses
- ✅ All new features work as expected

## 📝 Next Steps After Deployment

1. **Monitor usage** - Check how users interact with chatbot
2. **Gather feedback** - See what questions users ask most
3. **Update KB** - Add more articles based on common questions
4. **Optimize** - Fine-tune responses based on user feedback

---

**Deployment Status:** Ready to deploy  
**Last Commit:** `55e5004` - fix: Add suggestedQuestions to API response  
**GitHub:** https://github.com/mikemacmadeit/wildlife-auction  
**Netlify:** Check dashboard for deployment status
