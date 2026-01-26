# Int32 Serialization Error - Audit Report

## 🔍 Audit Findings

### ✅ What's Already Protected

1. **READ-side normalization** - Applied in:
   - ✅ `lib/firebase/orders.ts` - `getOrderById()`, `getOrdersForUser()`, `getOrdersForAdmin()`
   - ✅ `app/api/admin/orders/route.ts` - Admin orders API (line 162-176)

2. **WRITE-side sanitization** - Applied in:
   - ✅ `app/api/stripe/webhook/handlers.ts` - Order creation (line 593-598)
   - ✅ `app/api/orders/[orderId]/compliance-transfer/confirm/route.ts`
   - ✅ `app/api/orders/[orderId]/fulfillment/schedule-delivery/route.ts`

3. **Query parameter protection** - Applied in:
   - ✅ `app/api/admin/orders/route.ts` - Uses `safePositiveInt()`
   - ✅ `app/api/admin/notifications/run/route.ts` - Uses `safePositiveInt()`
   - ✅ `app/api/support/tickets/route.ts` - Uses `safePositiveInt()`

### ❌ CRITICAL GAPS FOUND

#### 1. **Webhook Handler - Multiple Unprotected Writes**

**File:** `app/api/stripe/webhook/handlers.ts`

**Lines with unprotected Firestore writes:**
- Line 315: `await refundedOrderRef.set({...})` - NO sanitization
- Line 682: `await offerRef.set({...})` - NO sanitization
- Line 768: `await listingRef.set({...})` - NO sanitization
- Line 798: `await listingRef.update(listingUpdates)` - NO sanitization
- Line 803: `await listingRef.set({...})` - NO sanitization
- Line 839: `await listingRef.set(listingUpdates, { merge: true })` - NO sanitization
- Line 1043: `await orderDoc.ref.set({...})` - NO sanitization
- Line 1141: `await listingRef.set(listingSoldUpdate, { merge: true })` - NO sanitization
- Line 1150: `await listingRef.set({...})` - NO sanitization
- Line 1181: `await listingRef.set(listingSoldUpdate, { merge: true })` - NO sanitization
- Line 1268: `await orderDoc.ref.set({...})` - NO sanitization
- Line 1317: `await listingRef.set({...})` - NO sanitization
- Line 1390: `await orderDoc.ref.set({ status: 'cancelled', updatedAt: now }, { merge: true })` - NO sanitization
- Line 1527: `await (orderDoc.ref as any).set({...})` - NO sanitization
- Line 1630: `await listingRef.set(listingSoldUpdate, { merge: true })` - NO sanitization
- Line 1639: `await listingRef.set({...})` - NO sanitization
- Line 1669: `await listingRef.set(listingSoldUpdate, { merge: true })` - NO sanitization
- Line 1743: `await orderDoc.ref.set({ status: 'cancelled', updatedAt: now }, { merge: true })` - NO sanitization
- Line 1776: `await listingRef.set({...})` - NO sanitization
- Line 1819: `await chargebackRef.set({...})` - NO sanitization
- Line 1999: `await chargebackRef.update({...})` - NO sanitization
- Line 2034: `await chargebackRef.update({...})` - NO sanitization
- Line 2069: `await chargebackRef.update({...})` - NO sanitization

**RISK:** These writes can introduce corrupt timestamps or -1 values directly into Firestore.

#### 2. **Admin Orders API - Timestamp Conversion Without Normalization**

**File:** `app/api/admin/orders/route.ts`

**Line 238-270:** Orders are serialized to JSON, converting Timestamps to ISO strings. However:
- The data is normalized at line 162-176
- BUT: If the normalization doesn't catch all cases, or if there are nested timestamp objects in `listingSnapshot`, `sellerSnapshot`, or `timeline`, they could still contain corrupt nanoseconds.

**RISK:** Nested timestamp objects in snapshots might not be fully normalized.

#### 3. **Client-Side Order Reads - No Normalization**

**Files:**
- `app/dashboard/orders/[orderId]/page.tsx` - Uses `getOrderById()` (✅ protected)
- `app/seller/orders/[orderId]/page.tsx` - Uses `getOrderById()` (✅ protected)
- `app/dashboard/admin/ops/page.tsx` - Uses `getAdminOrders()` API (✅ protected server-side)

**STATUS:** These are protected because they use the normalized functions.

#### 4. **Transaction/Batch Operations - No Sanitization**

**File:** `app/api/stripe/webhook/handlers.ts`

**Lines with transaction operations:**
- Line 1284: `tx.set({...})` - NO sanitization
- Line 1295: `tx.set({...})` - NO sanitization
- Line 1402: `tx.set({...})` - NO sanitization
- Line 1412: `tx.set({...})` - NO sanitization
- Line 1751: `tx.set({...})` - NO sanitization
- Line 1761: `tx.set({...})` - NO sanitization

**RISK:** Transaction writes bypass sanitization.

#### 5. **Query Limits - Some Still Unprotected**

**Files with unprotected query limits:**
- `app/api/stripe/webhook/handlers.ts` - Lines 297, 456, 1004, 1015, 1280, 1400, 1518, 1771, 1875, 1969 - All use `.limit(1)` which is safe, but not using `safePositiveInt()`
- `app/api/stripe/wire/create-intent/route.ts` - Line 270: `.limit(1)` - Safe but not protected
- `app/api/listings/update-seller-snapshots/route.ts` - Lines 100, 111, 125, 138 - Uses hardcoded limits (1000, 500) - Safe but not protected
- `app/api/offers/create/route.ts` - Line 130: `.limit(200)` - Safe but not protected
- `app/api/messages/send/route.ts` - Line 163: `.limit(1)` - Safe but not protected
- `app/api/admin/support/tickets/[ticketId]/ai-draft/route.ts` - Line 98: `.limit(5)` - Safe but not protected
- `app/api/admin/ai-summary/route.ts` - Line 86: `.limit(5)` - Safe but not protected

**RISK:** Low (hardcoded positive values), but should use `safePositiveInt()` for consistency.

## 🎯 ROOT CAUSE ANALYSIS

### Most Likely Source of Current Error

Based on the audit, the error is most likely coming from:

1. **Webhook handler writes** (HIGHEST RISK)
   - 20+ unprotected `.set()` and `.update()` calls
   - These write directly to Firestore without sanitization
   - If any of these payloads contain timestamp objects with `nanoseconds: -1`, they will be written to Firestore
   - When those documents are later read and serialized (e.g., in API responses), the error occurs

2. **Transaction writes** (MEDIUM RISK)
   - 6+ transaction operations without sanitization
   - Transaction payloads can contain corrupt timestamps

3. **Nested timestamp objects** (MEDIUM RISK)
   - `listingSnapshot`, `sellerSnapshot`, `timeline` arrays may contain timestamp objects
   - Normalization may not fully recurse into all nested structures
   - When these are serialized to JSON in API responses, corrupt nanoseconds cause the error

### Exact Error Path

```
1. Webhook handler writes order with corrupt timestamp (nanoseconds: -1)
   ↓
2. Document stored in Firestore with corrupt data
   ↓
3. Order is read via API (admin orders, buyer order detail, etc.)
   ↓
4. Data is normalized, BUT nested objects might be missed
   ↓
5. Data is serialized to JSON for API response
   ↓
6. Firestore SDK tries to serialize corrupt nanoseconds
   ↓
7. ERROR: serialize binary: invalid int 32: 4294967295
```

## 📊 Summary

### Files with Unprotected Writes (CRITICAL)
- `app/api/stripe/webhook/handlers.ts` - **20+ unprotected writes**
- All other fulfillment routes - Need audit

### Files with Unprotected Reads (MEDIUM)
- None found - all order reads use normalized functions

### Files with Unprotected Query Limits (LOW)
- Multiple files with hardcoded limits (safe, but should use `safePositiveInt()`)

## 🚨 Immediate Action Required

1. **Wrap ALL webhook handler writes** with `sanitizeFirestorePayload()`
2. **Wrap ALL transaction writes** with `sanitizeFirestorePayload()`
3. **Verify normalization recurses into nested objects** (listingSnapshot, sellerSnapshot, timeline)
4. **Run repair script** to fix existing corrupt data

## 🔍 How to Find the Exact Offending Document

If the error persists after fixes:

1. Add logging in `normalizeFirestoreValue()` to log any corrupt values found
2. Add logging in `sanitizeFirestorePayload()` to log any corrupt values being written
3. The dev assertion (`assertNoCorruptInt32`) will show the exact field path if it triggers
