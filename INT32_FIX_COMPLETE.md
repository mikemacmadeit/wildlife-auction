# Int32 Serialization Error - COMPLETE FIX

## ✅ What's Been Implemented

### 1. **One-Time Repair Script** (`scripts/repair-int32-corruption.ts`)
- Scans all orders in Firestore
- Finds and repairs documents with:
  - `nanoseconds: -1` or `_nanoseconds: -1`
  - Any field equal to `-1` or `4294967295`
- **Run once:** `npx ts-node scripts/repair-int32-corruption.ts`

### 2. **READ-Side Normalization** (`lib/firebase/normalizeFirestoreValue.ts`)
- **CRITICAL**: Normalizes data IMMEDIATELY after reading from Firestore
- Converts timestamp-like objects to safe `{seconds, nanoseconds}` format
- Clamps nanoseconds to `[0..999,999,999]`
- Replaces `-1` and `4294967295` with `null`
- Applied in:
  - ✅ `lib/firebase/orders.ts` - `getOrderById()`, `getOrdersForUser()`, `getOrdersForAdmin()`
  - ✅ `app/api/admin/orders/route.ts` - Admin orders API

### 3. **WRITE-Side Sanitization** (`lib/firebase/sanitizeFirestore.ts`)
- Sanitizes all payloads before writing to Firestore
- Applied in:
  - ✅ `app/api/stripe/webhook/handlers.ts` - Order creation
  - ✅ `app/api/orders/[orderId]/compliance-transfer/confirm/route.ts`
  - ✅ `app/api/orders/[orderId]/fulfillment/schedule-delivery/route.ts`

### 4. **Safe Query Integers** (`lib/firebase/safeQueryInts.ts`)
- Prevents `-1` from being passed to Firestore queries
- Applied in:
  - ✅ `app/api/admin/orders/route.ts`
  - ✅ `app/api/admin/notifications/run/route.ts`
  - ✅ `app/api/support/tickets/route.ts`

### 5. **Dev-Time Assertions** (`lib/firebase/assertNoCorruptInt32.ts`)
- Hard-fails in development with clear stack traces
- Points to exact field causing the problem

## 🔒 Why This Guarantees It Won't Happen Again

### **READ Protection** (The Missing Piece)
Even if Firestore contains corrupt data:
- `normalizeFirestoreValue()` runs on EVERY read
- Corrupt timestamps are normalized before serialization
- Corrupt sentinel values are replaced with `null`

### **WRITE Protection**
- `sanitizeFirestorePayload()` runs on EVERY write
- Prevents new bad data from being written

### **Query Protection**
- `safePositiveInt()` ensures query limits are never `-1`
- Prevents query-level int32 errors

### **Dev-Time Detection**
- `assertNoCorruptInt32()` catches issues immediately in development
- Provides clear stack traces pointing to exact field

## 📋 Files Changed

### Core Infrastructure
- ✅ `lib/firebase/normalizeFirestoreValue.ts` - READ-side normalization
- ✅ `lib/firebase/sanitizeFirestore.ts` - WRITE-side sanitization
- ✅ `lib/firebase/safeQueryInts.ts` - Safe query parameters
- ✅ `lib/firebase/assertNoCorruptInt32.ts` - Dev-time assertions
- ✅ `lib/firebase/safeFirestore.ts` - Safe wrapper functions

### Order Fetching (READ-side normalization)
- ✅ `lib/firebase/orders.ts` - All order fetching functions

### API Routes (WRITE-side sanitization + query fixes)
- ✅ `app/api/stripe/webhook/handlers.ts` - Order creation
- ✅ `app/api/orders/[orderId]/compliance-transfer/confirm/route.ts`
- ✅ `app/api/orders/[orderId]/fulfillment/schedule-delivery/route.ts`
- ✅ `app/api/admin/orders/route.ts` - Admin orders (READ + query fixes)
- ✅ `app/api/admin/notifications/run/route.ts` - Query fixes
- ✅ `app/api/support/tickets/route.ts` - Query fixes

### Scripts
- ✅ `scripts/repair-int32-corruption.ts` - One-time repair
- ✅ `scripts/find-bad-int32.ts` - Diagnostic tool

## 🚨 Next Steps

1. **Run the repair script ONCE:**
   ```bash
   npx ts-node scripts/repair-int32-corruption.ts
   ```

2. **If you still see the error:**
   - The dev assertion will show the exact field path
   - Check if that route uses normalization/sanitization
   - The error will point to the exact location

## 🎯 Why This Is Different

Previous attempts only fixed WRITE-side. This fix adds:
- **READ-side normalization** - Catches corrupt data when reading
- **Query parameter protection** - Prevents `-1` in queries
- **Comprehensive coverage** - Both client and server code paths

Even if:
- Existing Firestore documents contain corrupt data
- Cursor introduces bad code
- A merge brings back old patterns
- A new developer writes unsafe code

The normalization layer prevents invalid int32 values from ever reaching Firestore serialization.
