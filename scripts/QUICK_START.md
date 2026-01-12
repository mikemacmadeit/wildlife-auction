# Quick Start: Seed Mock Listings

## The Problem
The seed script is blocked by Firestore security rules. You need to either:
1. Use Admin SDK (bypasses rules) - **EASIEST**
2. Temporarily allow writes in security rules

## Solution: Use Admin SDK (5 minutes)

### Step 1: Get Service Account Key (2 minutes)

1. Open: https://console.firebase.google.com/project/wildlife-exchange/settings/serviceaccounts/adminsdk
2. Click **"Generate New Private Key"**
3. Click **"Generate Key"** in the popup
4. A JSON file will download - **rename it to `serviceAccountKey.json`**
5. Move it to: `project/serviceAccountKey.json`

### Step 2: Run the Script (1 minute)

```bash
cd project
npx tsx scripts/seed-listings-admin.ts
```

### Step 3: Create the Index (2 minutes)

After the script runs, create the required index:

**Click this link to create it automatically:**
https://console.firebase.google.com/v1/r/project/wildlife-exchange/firestore/indexes?create_composite=ClJwcm9qZWN0cy93aWxkbGlmZS1leGNoYW5nZS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvbGlzdGluZ3MvaW5kZXhlcy9fEAEaCgoGc3RhdHVzEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg

Or manually:
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click **"Create Index"**
3. Collection: `listings`
4. Add field: `status` (Ascending)
5. Add field: `createdAt` (Descending)
6. Click **"Create"**

## That's It! ✅

Your listings should now be in Firestore and the index error should be resolved.

## Troubleshooting

**"User not found" error?**
- Make sure `usalandspecialist@gmail.com` exists in Firebase Auth
- Make sure there's a user document in Firestore `users` collection with that email

**"Cannot find module firebase-admin" error?**
- Run: `cd project && npm install`

**Still having issues?**
- See `SEED_INSTRUCTIONS.md` for detailed troubleshooting
