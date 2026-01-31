# Firestore Security Rules - Deployment Guide

**Status:** ✅ Ready to Deploy  
**Priority:** 🔴 **P0 - CRITICAL - Deploy Before Launch**

---

## Quick Deploy (Firebase Console)

### Method 1: Firebase Console (Recommended for First Deploy)

1. **Go to Firebase Console:**
   - https://console.firebase.google.com/project/wildlife-exchange/firestore/rules

2. **Copy Rules:**
   - Open `firestore.rules` file from this repository
   - Copy ALL contents (entire file)

3. **Paste in Console:**
   - In Firebase Console Rules tab, paste the rules
   - Click **"Publish"** button

4. **Verify:**
   - Rules should show "Published" status
   - Check for any syntax errors (should be none)

---

## Deploy via Firebase CLI (Recommended for Updates)

### Prerequisites

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in project (if not already done)
cd project
firebase init firestore
# Select: Use existing firestore.rules file
```

### Deploy Rules

```bash
# From project directory
firebase deploy --only firestore:rules
```

### Verify Deployment

```bash
# Check rules status
firebase firestore:rules:get
```

---

## Testing Rules in Rules Playground

### Access Rules Playground

1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/rules
2. Click **"Rules Playground"** tab (or use Simulator)

### Test Cases

#### ✅ Users Collection Tests

**Test 1: User reads own profile**
- **Location:** `/users/{userId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Read
- **Expected:** ✅ Allow

**Test 2: User reads another user's profile**
- **Location:** `/users/{otherUserId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Read
- **Expected:** ✅ Allow (for profile display)

**Test 3: User creates own profile**
- **Location:** `/users/{userId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Create
- **Data:** `{ userId: auth.uid, email: "test@example.com", ... }`
- **Expected:** ✅ Allow

**Test 4: User tries to create another user's profile**
- **Location:** `/users/{otherUserId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Create
- **Expected:** ❌ Deny

**Test 5: User updates own profile**
- **Location:** `/users/{userId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Update
- **Expected:** ✅ Allow

**Test 6: User tries to update another user's profile**
- **Location:** `/users/{otherUserId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Update
- **Expected:** ❌ Deny

#### ✅ Listings Collection Tests

**Test 7: Authenticated user reads active listing**
- **Location:** `/listings/{listingId}`
- **Auth:** Authenticated
- **Operation:** Read
- **Data:** `{ status: "active", sellerId: "otherUserId", ... }`
- **Expected:** ✅ Allow

**Test 8: Authenticated user reads draft listing (not owner)**
- **Location:** `/listings/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Read
- **Data:** `{ status: "draft", sellerId: "otherUserId", ... }`
- **Expected:** ❌ Deny

**Test 9: Seller reads own draft listing**
- **Location:** `/listings/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Read
- **Data:** `{ status: "draft", sellerId: "userId", ... }`
- **Expected:** ✅ Allow

**Test 10: User creates listing with own sellerId**
- **Location:** `/listings/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Create
- **Data:** `{ sellerId: "userId", createdBy: "userId", status: "draft", title: "Test", description: "Test", type: "fixed", category: "cattle", createdAt: request.time, updatedAt: request.time }`
- **Expected:** ✅ Allow

**Test 11: User creates listing with different sellerId**
- **Location:** `/listings/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Create
- **Data:** `{ sellerId: "otherUserId", createdBy: "userId", status: "draft", ... }`
- **Expected:** ❌ Deny

**Test 12: User creates listing with status != 'draft'**
- **Location:** `/listings/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Create
- **Data:** `{ sellerId: "userId", createdBy: "userId", status: "active", ... }`
- **Expected:** ❌ Deny (must create as draft)

**Test 13: Seller updates own listing**
- **Location:** `/listings/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Update
- **Resource Data:** `{ sellerId: "userId", createdBy: "userId", ... }`
- **Request Data:** `{ ...existing fields..., updatedAt: request.time }`
- **Expected:** ✅ Allow

**Test 14: User tries to update listing they don't own**
- **Location:** `/listings/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Update
- **Resource Data:** `{ sellerId: "otherUserId", ... }`
- **Expected:** ❌ Deny

**Test 15: Seller tries to change sellerId on update**
- **Location:** `/listings/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Update
- **Resource Data:** `{ sellerId: "userId", ... }`
- **Request Data:** `{ sellerId: "otherUserId", ... }`
- **Expected:** ❌ Deny (sellerId cannot be changed)

**Test 16: Seller deletes own listing**
- **Location:** `/listings/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Delete
- **Resource Data:** `{ sellerId: "userId", ... }`
- **Expected:** ✅ Allow

**Test 17: User tries to delete listing they don't own**
- **Location:** `/listings/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Delete
- **Resource Data:** `{ sellerId: "otherUserId", ... }`
- **Expected:** ❌ Deny

#### ✅ Watchlist Collection Tests

**Test 18: User reads own watchlist**
- **Location:** `/users/{userId}/watchlist/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Read
- **Expected:** ✅ Allow

**Test 19: User reads another user's watchlist**
- **Location:** `/users/{otherUserId}/watchlist/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Read
- **Expected:** ❌ Deny

**Test 20: User adds to own watchlist**
- **Location:** `/users/{userId}/watchlist/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Create
- **Data:** `{ listingId: "listingId", createdAt: request.time }`
- **Expected:** ✅ Allow

**Test 21: User removes from own watchlist**
- **Location:** `/users/{userId}/watchlist/{listingId}`
- **Auth:** Authenticated as `userId`
- **Operation:** Delete
- **Expected:** ✅ Allow

---

## Verification Checklist

After deploying rules, verify:

- [ ] Rules published successfully (no syntax errors)
- [ ] Test cases 1-21 pass in Rules Playground
- [ ] App still loads listings (authenticated users)
- [ ] Users can create listings (as drafts)
- [ ] Users can update their own listings
- [ ] Users cannot update other users' listings
- [ ] Draft listings are hidden from non-owners
- [ ] Active listings are visible to all authenticated users

---

## Rollback Plan

If rules break the app:

1. **Quick Fix:** Go to Firebase Console → Firestore → Rules
2. **Temporary Permissive Rules:**
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
3. **Publish** (temporary - fix proper rules immediately)
4. **Debug:** Check Rules Playground for failing test cases
5. **Fix:** Update `firestore.rules` and redeploy

---

## Next Steps After Deployment

1. ✅ Rules deployed
2. ⏭️ P0.2: Add error boundaries
3. ⏭️ P0.3: Implement server-side filtering
4. ⏭️ P0.4: Migrate favorites to Firestore
5. ⏭️ P0.5: Remove mock data

---

## Troubleshooting

### Error: "Missing or insufficient permissions"

**Cause:** Rules too restrictive, rules not deployed, or user not authenticated.

**Common case – Set delivery address (HEB-style):** The set-delivery flow (saved addresses, Google Places Autocomplete, map with draggable pin) reads/writes `users/{uid}/addresses` and `users/{uid}/checkout`. Ensure your `firestore.rules` includes the blocks for those paths (they are in the repo) and deploy. See [HEB Delivery Address Implementation](docs/HEB_DELIVERY_ADDRESS_IMPLEMENTATION.md).

```bash
firebase deploy --only firestore:rules
```

**Other fixes:**
- Verify user is authenticated (`request.auth != null`); have the user sign out and sign back in
- Check Rules Playground to see which rule is failing
- Verify `sellerId` matches `auth.uid` for listing operations

### Error: "The query requires an index"

**Cause:** Composite index missing for query

**Fix:**
- See `FIRESTORE_INDEXES.md` for required indexes
- Create index via Firebase Console link or CLI

### Rules Not Taking Effect

**Cause:** Cache or deployment delay

**Fix:**
- Wait 1-2 minutes after publishing
- Clear browser cache
- Check Firebase Console shows "Published" status

---

**Last Updated:** January 12, 2026
