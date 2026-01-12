# Seed Listings Script

This script migrates mock listings from `lib/mock-data.ts` into Firestore, linking them to the user `usalandspecialist@gmail.com`.

## Prerequisites

1. **Create the required Firestore index** (if you haven't already):
   - The script will create listings with `status: 'active'` and `createdAt` fields
   - Make sure the index for `status` (Ascending) + `createdAt` (Descending) exists
   - Create it here: https://console.firebase.google.com/v1/r/project/wildlife-exchange/firestore/indexes?create_composite=ClJwcm9qZWN0cy93aWxkbGlmZS1leGNoYW5nZS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvbGlzdGluZ3MvaW5kZXhlcy9fEAEaCgoGc3RhdHVzEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg

2. Make sure you have the user `usalandspecialist@gmail.com`:
   - Created in Firebase Auth
   - Has a user document in Firestore `users` collection with matching email
   - The document ID should match the Firebase Auth UID

3. Ensure your `.env.local` file has the Firebase configuration (or the script will use defaults)

## Running the Script

### Option 1: Using Firebase Admin SDK (Recommended - Bypasses Security Rules)

**Step 1:** Get Firebase Service Account Key
1. Go to [Firebase Console](https://console.firebase.google.com/) > Project Settings > Service Accounts
2. Click "Generate New Private Key"
3. Save the JSON file as `project/serviceAccountKey.json`

**Step 2:** Run the Admin SDK script:
```bash
npx tsx scripts/seed-listings-admin.ts
```

This script bypasses Firestore security rules, so it's the easiest option.

### Option 2: Using Client SDK (Requires Permissive Security Rules)

**Note:** This requires temporarily allowing writes in Firestore security rules.

Run:
```bash
npx tsx scripts/seed-listings.ts
```

⚠️ **Warning:** You'll need to temporarily adjust Firestore security rules to allow writes. See `SEED_INSTRUCTIONS.md` for details.

### Option 2: Using ts-node

Install ts-node if you haven't already:
```bash
npm install -D ts-node
```

Then run:
```bash
npx ts-node scripts/seed-listings.ts
```

## What the Script Does

1. Connects to your Firebase project
2. Finds the user `usalandspecialist@gmail.com` in Firestore users collection
3. Converts all mock listings from `lib/mock-data.ts` to the new Firestore format:
   - Uses `sellerId` (user UID) instead of deprecated `seller` object
   - Creates `sellerSnapshot` with displayName and verified status
   - Converts dates to Firestore Timestamps
   - Sets status to 'active' (published)
4. Stores each listing in the `listings` collection with:
   - All listing data (title, description, images, location, etc.)
   - Proper date conversion (JavaScript Date → Firestore Timestamp)
   - Seller information via `sellerId` and `sellerSnapshot`
   - All metadata preserved
   - Metrics initialized to 0

## Notes

- The script creates listings with `status: 'active'` (published)
- Date fields are automatically converted to Firestore Timestamps
- All listings will be linked to the `usalandspecialist@gmail.com` user via `sellerId`
- If you get permission errors, you may need to use Firebase Admin SDK instead
- The script uses the client SDK, so Firestore security rules apply

## After Running

Once the script completes successfully:
- All listings will be in the `listings` collection in Firestore
- You can query them by `sellerId` to get listings for the user
- Listings will appear on the homepage, browse page, and seller dashboard
- Make sure the required Firestore indexes are created (see Prerequisites)
