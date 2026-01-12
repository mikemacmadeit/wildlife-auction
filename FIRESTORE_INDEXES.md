# Firestore Composite Indexes Required for Browse Queries

**Last Updated:** January 12, 2026

This document lists all Firestore composite indexes required for the browse page queries implemented in P0.3.

---

## Overview

The browse page uses `queryListingsForBrowse()` which supports:
- **Filters:** status, type, category, location.state, minPrice, maxPrice, featured
- **Sorting:** newest, oldest, priceAsc, priceDesc, endingSoon

Firestore requires composite indexes when:
- Using multiple `where` clauses
- Using `where` + `orderBy` on different fields
- Using range queries (`>=`, `<=`) with `orderBy`

---

## Required Indexes

### 1. Base Query: Status + CreatedAt (Newest)

**Query Pattern:**
```javascript
where('status', '==', 'active')
orderBy('createdAt', 'desc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `createdAt` (Descending)

**Status:** ✅ Already exists (from P0.1)

---

### 2. Status + Type + CreatedAt

**Query Pattern:**
```javascript
where('status', '==', 'active')
where('type', '==', 'auction')
orderBy('createdAt', 'desc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `type` (Ascending)
  - `createdAt` (Descending)

**Create Index:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - `status` → Ascending
   - `type` → Ascending
   - `createdAt` → Descending
5. Click "Create"

---

### 3. Status + Category + CreatedAt

**Query Pattern:**
```javascript
where('status', '==', 'active')
where('category', '==', 'cattle')
orderBy('createdAt', 'desc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `category` (Ascending)
  - `createdAt` (Descending)

**Create Index:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - `status` → Ascending
   - `category` → Ascending
   - `createdAt` → Descending
5. Click "Create"

---

### 4. Status + Type + Category + CreatedAt

**Query Pattern:**
```javascript
where('status', '==', 'active')
where('type', '==', 'auction')
where('category', '==', 'cattle')
orderBy('createdAt', 'desc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `type` (Ascending)
  - `category` (Ascending)
  - `createdAt` (Descending)

**Create Index:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - `status` → Ascending
   - `type` → Ascending
   - `category` → Ascending
   - `createdAt` → Descending
5. Click "Create"

---

### 5. Status + Location.State + CreatedAt

**Query Pattern:**
```javascript
where('status', '==', 'active')
where('location.state', '==', 'TX')
orderBy('createdAt', 'desc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `location.state` (Ascending)
  - `createdAt` (Descending)

**Create Index:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - `status` → Ascending
   - `location.state` (nested field) → Ascending
   - `createdAt` → Descending
5. Click "Create"

---

### 6. Status + Type + Location.State + CreatedAt

**Query Pattern:**
```javascript
where('status', '==', 'active')
where('type', '==', 'auction')
where('location.state', '==', 'TX')
orderBy('createdAt', 'desc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `type` (Ascending)
  - `location.state` (Ascending)
  - `createdAt` (Descending)

**Create Index:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - `status` → Ascending
   - `type` → Ascending
   - `location.state` (nested field) → Ascending
   - `createdAt` → Descending
5. Click "Create"

---

### 7. Status + Price (Ascending) - Price Low to High

**Query Pattern:**
```javascript
where('status', '==', 'active')
orderBy('price', 'asc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `price` (Ascending)

**Create Index:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - `status` → Ascending
   - `price` → Ascending
5. Click "Create"

---

### 8. Status + Price (Descending) - Price High to Low

**Query Pattern:**
```javascript
where('status', '==', 'active')
orderBy('price', 'desc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `price` (Descending)

**Create Index:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - `status` → Ascending
   - `price` → Descending
5. Click "Create"

---

### 9. Status + Price Range (MaxPrice) + Price Sort

**Query Pattern:**
```javascript
where('status', '==', 'active')
where('price', '<=', 10000)
orderBy('price', 'asc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `price` (Ascending)

**Note:** Same as index #7 (Status + Price Ascending). Range queries on the same field as orderBy don't require a separate index.

---

### 10. Status + Price Range (MinPrice) + Price Sort

**Query Pattern:**
```javascript
where('status', '==', 'active')
where('price', '>=', 1000)
orderBy('price', 'asc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `price` (Ascending)

**Note:** Same as index #7. Range queries on the same field as orderBy don't require a separate index.

---

### 11. Status + Type + Price (Ascending)

**Query Pattern:**
```javascript
where('status', '==', 'active')
where('type', '==', 'auction')
orderBy('price', 'asc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `type` (Ascending)
  - `price` (Ascending)

**Create Index:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - `status` → Ascending
   - `type` → Ascending
   - `price` → Ascending
5. Click "Create"

---

### 12. Status + Type + Price (Descending)

**Query Pattern:**
```javascript
where('status', '==', 'active')
where('type', '==', 'auction')
orderBy('price', 'desc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `type` (Ascending)
  - `price` (Descending)

**Create Index:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - `status` → Ascending
   - `type` → Ascending
   - `price` → Descending
5. Click "Create"

---

### 13. Status + Type (Auction) + EndsAt (Ending Soon)

**Query Pattern:**
```javascript
where('status', '==', 'active')
where('type', '==', 'auction')
orderBy('endsAt', 'asc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `type` (Ascending)
  - `endsAt` (Ascending)

**Create Index:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - `status` → Ascending
   - `type` → Ascending
   - `endsAt` → Ascending
5. Click "Create"

---

### 14. Status + Featured + CreatedAt

**Query Pattern:**
```javascript
where('status', '==', 'active')
where('featured', '==', true)
orderBy('createdAt', 'desc')
```

**Index:**
- Collection: `listings`
- Fields:
  - `status` (Ascending)
  - `featured` (Ascending)
  - `createdAt` (Descending)

**Create Index:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Collection ID: `listings`
4. Add fields:
   - `status` → Ascending
   - `featured` → Ascending
   - `createdAt` → Descending
5. Click "Create"

---

## Firestore Limitations

### 1. Price Range Queries

**Limitation:** Firestore can only use range queries (`>=`, `<=`) on the same field as `orderBy`.

**Current Implementation:**
- ✅ `maxPrice` with `orderBy('price')` - Works (uses `where('price', '<=', maxPrice)`)
- ✅ `minPrice` with `orderBy('price')` - Works (uses `where('price', '>=', minPrice)`)
- ⚠️ `minPrice` without `orderBy('price')` - Filtered client-side (fallback)

**Workaround:** When both `minPrice` and `maxPrice` are provided without price sort, we use `maxPrice` server-side and filter `minPrice` client-side.

---

### 2. Full-Text Search

**Limitation:** Firestore does not support full-text search.

**Current Implementation:**
- Search is performed client-side on loaded results
- Only searches within the current page of results
- Message shown: "Search currently filters loaded results; full search coming soon."

**Future Enhancement (P1+):**
- Integrate Algolia or Elasticsearch for full-text search
- Or use Firestore Extensions for search

---

### 3. City-Level Location Filtering

**Limitation:** Firestore can only efficiently filter on top-level fields or simple nested fields.

**Current Implementation:**
- `location.state` - Filtered server-side ✅
- `location.city` - Filtered client-side ⚠️

**Workaround:** City filtering is done client-side on loaded results.

---

### 4. Metadata Fields

**Limitation:** Nested metadata fields (breed, age, healthStatus, papers, quantity) are not indexed.

**Current Implementation:**
- All metadata filters are applied client-side
- Only filters on indexed fields (status, type, category, location.state, price, featured) are server-side

**Future Enhancement (P1+):**
- Add metadata fields to Firestore indexes if needed
- Or use a search service (Algolia) for complex metadata queries

---

## Quick Index Creation

### Using Firebase Console (Recommended)

1. Navigate to: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes
2. Click "Create Index"
3. Follow the prompts for each index above

### Using Firebase CLI

If you prefer using the CLI, update `firestore.indexes.json`:

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
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
    // ... add all other indexes
  ]
}
```

Then deploy:
```bash
firebase deploy --only firestore:indexes
```

---

## Testing Indexes

After creating indexes:

1. **Wait for Index Build:** Indexes can take a few minutes to build
2. **Test Queries:** Use the browse page and try different filter combinations
3. **Check Errors:** If you see "index required" errors, check the Firebase Console for the exact index needed

---

## Index Status

- ✅ **Index #1 (Status + CreatedAt):** Already exists
- ⏳ **Indexes #2-14:** Need to be created

**Priority:** Create indexes #2, #3, #7, #8, #13 first (most common queries)

---

## Notes

- Indexes are **free** but take time to build
- Indexes are **required** - queries will fail without them
- Indexes are **automatic** - Firestore will suggest missing indexes via error messages
- Indexes are **permanent** - once created, they persist until deleted

---

**Last Updated:** January 12, 2026  
**Related:** P0.3 Implementation
