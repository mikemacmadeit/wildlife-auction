# How to Seed Mock Listings into Firestore

This guide explains how to create mock listings in Firestore for the `usalandspecialist` account.

## Option 1: Using Firebase Admin SDK (Recommended)

The Admin SDK bypasses Firestore security rules, making it the best option for seeding data.

### Step 1: Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `wildlife-exchange`
3. Go to **Project Settings** (gear icon) > **Service Accounts**
4. Click **Generate New Private Key**
5. Save the JSON file as `project/serviceAccountKey.json`
   - ⚠️ **IMPORTANT**: This file contains sensitive credentials. Never commit it to git!
   - It's already added to `.gitignore`

### Step 2: Run the Seed Script

```bash
cd project
npx tsx scripts/seed-listings-admin.ts
```

The script will:
- Find the user `usalandspecialist@gmail.com` in Firestore
- Create all mock listings from `lib/mock-data.ts`
- Link them to the user's UID
- Set status to `active` (published)

### Step 3: Create Required Firestore Index

After seeding, you **must** create the Firestore index for queries:

**Index Details:**
- Collection: `listings`
- Fields: 
  - `status` (Ascending)
  - `createdAt` (Descending)

**Create it here:**
https://console.firebase.google.com/v1/r/project/wildlife-exchange/firestore/indexes?create_composite=ClJwcm9qZWN0cy93aWxkbGlmZS1leGNoYW5nZS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvbGlzdGluZ3MvaW5kZXhlcy9fEAEaCgoGc3RhdHVzEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg

Or manually:
1. Go to Firebase Console > Firestore Database > Indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - Field: `status`, Order: Ascending
   - Field: `createdAt`, Order: Descending
5. Click "Create"

## Option 2: Using Client SDK (Alternative)

If you can't use Admin SDK, you can temporarily adjust Firestore security rules:

### Step 1: Temporarily Allow Writes

In Firebase Console > Firestore Database > Rules, temporarily allow writes:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // TEMPORARY: Allow writes for seeding (REMOVE AFTER SEEDING!)
    match /listings/{listingId} {
      allow read, write: if true;
    }
    match /users/{userId} {
      allow read: if true;
    }
  }
}
```

⚠️ **WARNING**: Remove these permissive rules after seeding!

### Step 2: Run Client SDK Script

```bash
cd project
npx tsx scripts/seed-listings.ts
```

### Step 3: Restore Security Rules

After seeding, restore your original security rules from `FIRESTORE_SECURITY_RULES.md`.

## Troubleshooting

### "User not found" Error

Make sure:
1. The user `usalandspecialist@gmail.com` exists in Firebase Auth
2. A user document exists in Firestore `users` collection
3. The document has an `email` field matching `usalandspecialist@gmail.com`
4. The document ID matches the Firebase Auth UID

### "Permission denied" Error

- If using Admin SDK: Make sure `serviceAccountKey.json` exists and is valid
- If using Client SDK: Make sure security rules allow writes (see Option 2)

### "Index required" Error

After creating listings, you'll need the index for queries. See Step 3 in Option 1.

## What Gets Created

The script creates listings with:
- All data from `lib/mock-data.ts` (5 listings)
- Status: `active` (published)
- Linked to `usalandspecialist` user via `sellerId`
- Proper Firestore Timestamps for dates
- Seller snapshot with display name and verified status
- Metrics initialized to 0

## Verification

After seeding, verify in Firebase Console:
1. Go to Firestore Database
2. Check `listings` collection - should have 5 documents
3. Check that all listings have `status: 'active'`
4. Check that all listings have `sellerId` matching the user's UID

## Removing Stripe-risky test listings

If a test user created listings that are problematic for payment-processor review (e.g. Lion, zebra), use the one-off cleanup script:

```bash
npx tsx scripts/delete-stripe-risky-listings.ts --dry-run   # preview only
npx tsx scripts/delete-stripe-risky-listings.ts             # delete matches
```

Same Firebase Admin prerequisites as `seed-listings-admin.ts`. The script deletes listings whose **title** is exactly "Lion" or "Frank the Zebro". To remove other titles or by species, edit `TITLES_TO_DELETE` in the script.
