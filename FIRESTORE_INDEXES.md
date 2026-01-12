# Firestore Composite Indexes Required
## Wildlife Exchange Marketplace

**Date:** Current  
**Status:** Implementation Guide  
**Priority:** HIGH - Required for queries to work

---

## Overview

Firestore requires composite indexes for queries that filter or order by multiple fields. This document lists all required indexes for the current implementation.

---

## Required Indexes

### 1. Listings: Active Listings by Creation Date

**Collection:** `listings`  
**Fields:**
- `status` (Ascending)
- `createdAt` (Descending)

**Used by:**
- `listActiveListings()` - Query active listings ordered by creation date

**Firebase Console Setup:**
1. Go to Firestore Database → Indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Fields:
   - Field: `status`, Order: Ascending
   - Field: `createdAt`, Order: Descending
5. Query scope: Collection
6. Click "Create"

**Alternative CLI Command:**
```bash
firebase deploy --only firestore:indexes
```

With `firestore.indexes.json`:
```json
{
  "indexes": [
    {
      "collectionGroup": "listings",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    }
  ]
}
```

---

### 2. Listings: Seller Listings by Creation Date

**Collection:** `listings`  
**Fields:**
- `sellerId` (Ascending)
- `createdAt` (Descending)

**Used by:**
- `listSellerListings(uid)` - Query all listings for a seller

**Firebase Console Setup:**
1. Collection ID: `listings`
2. Fields:
   - Field: `sellerId`, Order: Ascending
   - Field: `createdAt`, Order: Descending
3. Click "Create"

---

### 3. Listings: Seller Listings by Status and Creation Date (Optional)

**Collection:** `listings`  
**Fields:**
- `sellerId` (Ascending)
- `status` (Ascending)
- `createdAt` (Descending)

**Used by:**
- `listSellerListings(uid, status)` - Query seller listings filtered by status

**Note:** This index is only needed if you filter by status when calling `listSellerListings`. If you filter in-memory after fetching, you can skip this index.

---

## Future Indexes (Not Required Yet)

The following indexes will be needed when implementing additional features:

### Category + Status + CreatedAt
- **Collection:** `listings`
- **Fields:** `category`, `status`, `createdAt`
- **Used by:** Browse page filtering by category

### Location State + Status + CreatedAt
- **Collection:** `listings`
- **Fields:** `location.state`, `status`, `createdAt`
- **Used by:** Location-based filtering

### Type + Status + CreatedAt
- **Collection:** `listings`
- **Fields:** `type`, `status`, `createdAt`
- **Used by:** Filtering by listing type (auction/fixed/classified)

### Bids: Listing + CreatedAt
- **Collection:** `bids`
- **Fields:** `listingId`, `createdAt`
- **Used by:** Fetching bids for a listing

### Bids: Bidder + CreatedAt
- **Collection:** `bids`
- **Fields:** `bidderId`, `createdAt`
- **Used by:** User's bid history

---

## Deployment

### Option 1: Firebase Console (Recommended for Testing)

1. Navigate to Firebase Console → Firestore Database → Indexes
2. Click "Create Index" for each index above
3. Wait for indexes to build (can take a few minutes)

### Option 2: Firebase CLI (Recommended for Production)

1. Create `firestore.indexes.json` in your project root:
```json
{
  "indexes": [
    {
      "collectionGroup": "listings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "listings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "sellerId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "listings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "sellerId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

2. Deploy:
```bash
firebase deploy --only firestore:indexes
```

---

## Error Messages

If you see this error in the browser console:
```
FirebaseError: The query requires an index. You can create it here: [URL]
```

1. Click the URL in the error message
2. Firebase Console will open with the index pre-configured
3. Click "Create Index"
4. Wait for the index to build

---

## Index Building Time

- **Small collections (< 1,000 docs)**: Usually builds in 1-2 minutes
- **Medium collections (1,000 - 100,000 docs)**: 5-15 minutes
- **Large collections (> 100,000 docs)**: 30+ minutes

You can monitor index build status in Firebase Console → Firestore Database → Indexes.

---

## Notes

1. **Single-field indexes are automatic** - You don't need to create indexes for single fields
2. **Array fields require special handling** - If you query array-contains, you may need array indexes
3. **Indexes consume storage** - Monitor your Firestore storage usage
4. **Indexes have limits** - Maximum 200 composite indexes per database (plenty for this app)
