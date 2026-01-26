# Int32 Serialization Error Fix Guide

## Problem

The error `serialize binary: invalid int 32: 4294967295 [internal]` occurs when:
- A value of `-1` is converted to an unsigned 32-bit integer (becomes `4294967295`)
- Invalid Firestore Timestamp nanoseconds (outside `[0..999,999,999]`)
- Negative countdown values being serialized
- Invalid `.limit()` or `.offset()` values in Firestore queries

## Solution Overview

This fix includes:
1. **Diagnostic scripts** to find bad data in Firestore
2. **Repair scripts** to fix existing bad data
3. **Permanent guardrails** to prevent future bad writes
4. **Comprehensive sanitization** wrapper for all Firestore operations

## Step 1: Find Bad Documents

Run the diagnostic script to scan Firestore for documents with bad int32 values:

```bash
npx ts-node scripts/find-bad-int32.ts
```

This will:
- Scan `orders`, `events`, `emailJobs`, and `orderReminders` collections
- Report any documents with `nanoseconds: -1` or `_nanoseconds: -1`
- Show the exact field paths where bad values are found

## Step 2: Repair Bad Documents

Once you've identified bad documents, run the repair script:

```bash
# Dry run (no changes)
npx ts-node scripts/repair-bad-int32.ts

# Actually repair (modifies Firestore)
npx ts-node scripts/repair-bad-int32.ts --execute
```

This will:
- Convert bad timestamp objects to valid Firestore Timestamps
- Remove corrupted fields that can't be repaired
- Update documents in place

## Step 3: Use Sanitization Wrapper (Prevention)

All Firestore write operations should use the sanitization wrapper:

```typescript
import { sanitizedUpdate, sanitizedSet } from '@/lib/firebase/sanitizePayload';

// Instead of:
await docRef.update({ field: value });

// Use:
await sanitizedUpdate(docRef, { field: value });
```

The sanitizer automatically:
- Converts timestamp-like objects to valid Firestore Timestamps
- Clamps negative countdown values to 0
- Removes `-1` sentinel values
- Validates int32 ranges for numeric fields
- Handles limit/offset/pageSize fields

## Step 4: Use Safe Timestamp Conversion

Always use `toAdminTimestamp()` when converting timestamps:

```typescript
import { toAdminTimestamp } from '@/lib/firebase/toTimestamp';

const safeTimestamp = toAdminTimestamp(value);
```

This ensures nanoseconds are always in valid range `[0..999,999,999]`.

## Step 5: Use Int32 Tripwires

Add tripwires before Firestore operations to catch invalid values early:

```typescript
import { assertInt32 } from '@/lib/debug/int32Tripwire';

// Before Firestore query
const limit = 25;
assertInt32(limit, 'Firestore.limit');

// Before writing calculated values
const hoursRemaining = Math.max(0, calculatedHours);
assertInt32(hoursRemaining, 'hoursRemaining');
```

## Common Patterns Fixed

### 1. Timestamp Creation
❌ **Bad:**
```typescript
new Timestamp(seconds, -1); // Invalid nanoseconds
```

✅ **Good:**
```typescript
Timestamp.fromMillis(millis);
Timestamp.fromDate(date);
toAdminTimestamp(value);
```

### 2. Countdown Calculations
❌ **Bad:**
```typescript
const remaining = deadline - Date.now(); // Can be negative
```

✅ **Good:**
```typescript
const remaining = Math.max(0, deadline - Date.now());
assertInt32(Math.floor(remaining / 1000), 'remainingSeconds');
```

### 3. Firestore Query Limits
❌ **Bad:**
```typescript
query.limit(limit); // limit could be -1
```

✅ **Good:**
```typescript
const safeLimit = limit && limit > 0 ? limit : 25;
assertInt32(safeLimit, 'Firestore.limit');
query.limit(safeLimit);
```

### 4. Sentinel Values
❌ **Bad:**
```typescript
const status = map[input] ?? -1; // -1 sentinel
```

✅ **Good:**
```typescript
const status = map[input] ?? null; // Use null instead
```

## Files Changed

### New Files
- `scripts/find-bad-int32.ts` - Diagnostic script
- `scripts/repair-bad-int32.ts` - Repair script
- `lib/firebase/sanitizePayload.ts` - Sanitization wrapper
- `lib/debug/int32Tripwire.ts` - Assertion helpers (already exists)
- `lib/firebase/toTimestamp.ts` - Safe timestamp conversion (already exists)

### Updated Files
- `netlify/functions/checkFulfillmentReminders.ts` - Added compliance reminders with int32 guards
- `lib/orders/completion-policies.ts` - Added compliance reminder constants

## Testing

After applying fixes:

1. Run the diagnostic script to verify no bad documents remain
2. Test order creation/updates to ensure no new bad data is created
3. Monitor logs for any `assertInt32` errors (these will show the exact call site)

## If Error Persists

If you still see the error after applying all fixes:

1. **Check where the error occurs:**
   - Browser console? → Likely reading bad data from Firestore
   - Terminal/Netlify logs? → Likely writing bad data
   - Specific orders? → Those orders may have bad data

2. **Run diagnostic script again** to find any remaining bad documents

3. **Check for new code paths** that might be creating timestamps manually

4. **Add more tripwires** around suspected code paths

## Prevention Checklist

- [ ] All Firestore writes use `sanitizedUpdate` or `sanitizedSet`
- [ ] All timestamp conversions use `toAdminTimestamp`
- [ ] All countdown calculations are clamped to `>= 0`
- [ ] All Firestore query limits are validated with `assertInt32`
- [ ] No `-1` sentinel values are stored in Firestore
- [ ] All time calculations are validated before serialization
