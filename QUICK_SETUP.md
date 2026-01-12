# Quick Setup: Enable AI Firestore Operations

## One-Time Setup (2 minutes)

### Step 1: Get Service Account Key

1. **Go to:** https://console.firebase.google.com/project/wildlife-exchange/settings/serviceaccounts/adminsdk
2. Click **"Generate New Private Key"**
3. Click **"Generate Key"** in popup
4. **Rename** the downloaded file to: `serviceAccountKey.json`
5. **Move it to:** `project/serviceAccountKey.json` (same folder as `package.json`)

That's it! ✅

## What This Enables

Once you have `serviceAccountKey.json` in place, I can:
- ✅ Create/update/delete Firestore documents
- ✅ Query collections
- ✅ Update listings, users, etc.
- ✅ Perform batch operations
- ✅ All without you needing to click anything!

## Test It

After placing the file, just ask me:
- "Can you check if the service account is working?"
- "List all listings in Firestore"
- "Update listing X with..."

I'll use the Admin SDK to do it automatically! 🚀

## Security

- ✅ `serviceAccountKey.json` is in `.gitignore` (won't be committed)
- ✅ Only you have access to your Firebase project
- ✅ I can only do what the service account allows
