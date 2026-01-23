# Knowledge Base Sync - Explained

## What is "Sync KB"?

**"Sync KB"** means copying your Knowledge Base articles from your code repository into Firestore (your database) so the chatbot can use them.

## The Problem

Your Knowledge Base articles exist in **two places**:

1. **In your code** (`/knowledge_base/` folder) - These are markdown files like:
   - `knowledge_base/getting-started/how-to-sign-up.md`
   - `knowledge_base/troubleshooting/cant-sign-in.md`
   - etc.

2. **In Firestore database** (`knowledgeBaseArticles` collection) - This is where the chatbot actually reads from

## Why Two Places?

- **Markdown files in repo**: Easy to edit, version control, can be reviewed in pull requests
- **Firestore database**: Fast to query, can be filtered/searched, accessible to the chatbot API

## What the Sync Script Does

The sync script (`scripts/syncKnowledgeBaseToFirestore.ts`) does this:

1. **Reads** all `.md` files from `/knowledge_base/` directory
2. **Parses** the frontmatter (title, slug, category, tags, etc.)
3. **Uploads** each article to Firestore `knowledgeBaseArticles` collection
4. **Updates** existing articles if they already exist (by slug)
5. **Sets** timestamps and versions

## When Do You Need to Run It?

Run the sync script when:

- ✅ **After deployment** - To populate Firestore with all your KB articles
- ✅ **After adding new articles** - To add them to Firestore
- ✅ **After updating articles** - To update them in Firestore
- ✅ **After changing article metadata** - To update tags, categories, etc.

## How to Run It

### Step 1: Make sure you're in the project directory

```bash
cd "C:\dev\Wildlife Auction\project"
```

### Step 2: Make sure environment variables are set

The script needs Firebase credentials. Check your `.env.local` file has:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

### Step 3: Run the sync script

```bash
npx tsx scripts/syncKnowledgeBaseToFirestore.ts
```

### What You'll See

The script will:
1. Find all markdown files in `/knowledge_base/`
2. Parse each file
3. Upload/update each article in Firestore
4. Show you progress like:

```
🚀 Starting Knowledge Base sync...

📄 Found 80 markdown files
📝 Processing: getting-started/how-to-sign-up.md
✅ Synced: How to Sign Up (slug: how-to-sign-up)
📝 Processing: troubleshooting/cant-sign-in.md
✅ Synced: Can't Sign In (slug: cant-sign-in)
...

✨ Sync complete! 80 articles synced to Firestore.
```

## What Happens After Syncing?

Once articles are in Firestore:

1. ✅ **Chatbot can find them** - When users ask questions, the chatbot searches Firestore
2. ✅ **Articles are searchable** - The chatbot can match user questions to articles
3. ✅ **Responses are grounded** - AI responses are based on your KB articles
4. ✅ **Sources are available** - Users can click source links to see full articles

## Verify It Worked

After running the sync:

1. **Check Firestore Console:**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project
   - Go to **Firestore Database**
   - Look for `knowledgeBaseArticles` collection
   - You should see all your articles there

2. **Test the Chatbot:**
   - Open your app
   - Click Help button (bottom-right)
   - Click "Ask" tab
   - Ask a question like "How do I sign in?"
   - The chatbot should find relevant articles and respond

## Common Questions

### Do I need to run this every time I deploy?

**Yes, if you've added or changed KB articles.** The sync script is safe to run multiple times - it updates existing articles rather than creating duplicates.

### Can I run this from Netlify?

**Not directly**, but you could:
- Add it to your build process (but it would run on every deploy)
- Create a one-time script that runs after first deployment
- Run it manually from your local machine (recommended)

### What if I forget to sync?

**The chatbot will still work**, but:
- It won't have access to new/updated articles
- It will only use articles that are already in Firestore
- Users might get less accurate responses

### Can I sync just one article?

**Not with the current script** - it syncs all articles. But you can:
- Edit the article in Firestore directly (via Firebase Console)
- Or run the full sync (it's fast, only updates what changed)

## Summary

**"Sync KB"** = Copy markdown files from your repo → Upload to Firestore database

**Why?** So the chatbot can read and use your Knowledge Base articles

**When?** After deployment, after adding/updating articles

**How?** Run: `npx tsx scripts/syncKnowledgeBaseToFirestore.ts`

That's it! 🎉
