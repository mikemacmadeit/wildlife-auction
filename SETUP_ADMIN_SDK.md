# Setup Firebase Admin SDK for Automated Firestore Updates

Once you set this up, I'll be able to perform Firestore operations for you automatically!

## Step 1: Get Service Account Key (2 minutes)

1. Go to: https://console.firebase.google.com/project/wildlife-exchange/settings/serviceaccounts/adminsdk
2. Click **"Generate New Private Key"**
3. Click **"Generate Key"** in the popup
4. A JSON file will download
5. **Rename it to `serviceAccountKey.json`**
6. **Move it to:** `project/serviceAccountKey.json` (same folder as `package.json`)

⚠️ **Security Note:** This file is already in `.gitignore` so it won't be committed to git.

## Step 2: Verify Setup

Run this to test:
```bash
cd project
node -e "const admin = require('./lib/firebase/admin-helper.ts'); console.log('✅ Admin SDK ready!')"
```

Or I can test it for you by running a simple Firestore operation.

## What I Can Do Once Setup

With the service account key, I can:
- ✅ Create/update/delete documents in any collection
- ✅ Query Firestore data
- ✅ Perform batch operations
- ✅ Update listings, users, etc.
- ✅ Bypass security rules (for admin operations)

## Usage

Once setup, just ask me things like:
- "Update listing X with new data"
- "Create a new listing"
- "Query all active listings"
- "Delete listing Y"

I'll use the Admin SDK helper to do it automatically!
