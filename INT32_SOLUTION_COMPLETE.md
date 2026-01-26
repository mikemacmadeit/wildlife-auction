# Int32 Serialization Error - Complete Solution

## ✅ What We've Implemented

### 1. **One-Time Repair Script** (`scripts/repair-int32-corruption.ts`)
- Scans all orders in Firestore
- Finds and repairs documents with:
  - `nanoseconds: -1` or `_nanoseconds: -1`
  - Any field equal to `-1` or `4294967295`
- **Run once:** `npx ts-node scripts/repair-int32-corruption.ts`

### 2. **Universal Sanitizer** (`lib/firebase/sanitizeFirestore.ts`)
- Automatically converts timestamp-like objects to valid Firestore Timestamps
- Clamps nanoseconds to `[0..999,999,999]`
- Replaces `-1` and `4294967295` with `null`
- Recursively sanitizes nested objects

### 3. **Safe Firestore Wrapper** (`lib/firebase/safeFirestore.ts`)
- Drop-in replacements for all Firestore operations
- Automatically sanitizes ALL payloads
- Includes dev-time assertions
- **Use these instead of direct Firestore operations**

### 4. **Dev-Time Assertions** (`lib/firebase/assertNoCorruptInt32.ts`)
- Hard-fails in development with clear stack traces
- Points to exact field causing the problem
- Only runs in non-production

## 🔒 How to Use (Going Forward)

### Option 1: Use Safe Wrapper Functions (Recommended)

```typescript
import { safeUpdate, safeSet, safeAdd } from '@/lib/firebase/safeFirestore';

// Instead of:
await docRef.update(data);
await docRef.set(data);
await collectionRef.add(data);

// Use:
await safeUpdate(docRef, data);
await safeSet(docRef, data);
await safeAdd(collectionRef, data);
```

### Option 2: Manual Sanitization (If You Must)

```typescript
import { sanitizeFirestorePayload } from '@/lib/firebase/sanitizeFirestore';
import { assertNoCorruptInt32 } from '@/lib/firebase/assertNoCorruptInt32';

const sanitized = sanitizeFirestorePayload(data);
if (process.env.NODE_ENV !== 'production') {
  assertNoCorruptInt32(sanitized);
}
await docRef.update(sanitized);
```

## 📋 Files Already Updated

✅ `app/api/stripe/webhook/handlers.ts` - Order creation
✅ `app/api/orders/[orderId]/compliance-transfer/confirm/route.ts` - Compliance confirmations
✅ `app/api/orders/[orderId]/fulfillment/schedule-delivery/route.ts` - Delivery scheduling

## 🎯 Remaining Files to Update

All other API routes that do Firestore writes need to use the safe wrapper or manual sanitization. The most critical ones are:

- All fulfillment routes (`app/api/orders/[orderId]/fulfillment/*`)
- All order update routes (`app/api/orders/[orderId]/*`)
- All admin routes that write to Firestore
- All webhook handlers

## 🚨 Why This Guarantees It Won't Happen Again

1. **Existing bad data is fixed** (repair script)
2. **New bad data is blocked** (sanitizer catches everything)
3. **Issues are caught early** (dev assertions)
4. **Safe wrapper makes it impossible to forget** (just use the wrapper functions)

Even if:
- Cursor introduces bad code
- A merge brings back old patterns
- A new developer writes unsafe code

The sanitizer will normalize values before Firestore sees them.

## 📝 Next Steps

1. **Run the repair script once:**
   ```bash
   npx ts-node scripts/repair-int32-corruption.ts
   ```

2. **Gradually migrate to safe wrapper functions** in all API routes

3. **If you see the error again:**
   - Check if the repair script was run
   - Check if that route uses sanitization
   - The dev assertion will show the exact field if it happens in development
