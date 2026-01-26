# Int32 Serialization Error Fix

## Error
`serialize binary: invalid int 32: 4294967295 [internal]`

This error occurs when -1 or negative values are serialized to Firestore/Protobuf, which converts -1 to unsigned 32-bit (4294967295 = 2³² - 1).

## Root Causes Fixed

### 1. Firestore Query Limits
**Files Fixed:**
- `app/api/admin/orders/route.ts` - Added clamp to ensure limit >= 1
- `lib/audit/logger.ts` - Added clamp for all limit parameters
- `app/api/admin/notifications/run/route.ts` - Added clamp (zod validation already ensures >= 1, but added extra safety)
- `lib/firebase/messages.ts` - Added clamp for pageSize parameters
- `netlify/functions/checkFulfillmentReminders.ts` - Already using constant 100, added logging

**Fix Applied:**
```typescript
// Before
const limit = parseInt(searchParams.get('limit') || '100', 10);
query.limit(limit);

// After
const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 100;
query.limit(limit);
```

### 2. Negative Countdown Values
**Files Fixed:**
- `netlify/functions/checkFulfillmentReminders.ts` - All hoursRemaining, hoursOverdue, daysSinceDelivery clamped to >= 0
- `app/api/admin/orders/[orderId]/send-reminder/route.ts` - All countdown values clamped
- `lib/notifications/processEvent.ts` - Added clampInt32() helper and applied to all numeric payload fields

**Fix Applied:**
```typescript
// Before
const hoursRemaining = Math.floor((deadline - now) / (1000 * 60 * 60));

// After
const hoursRemaining = Math.max(0, Math.floor((deadline - now) / (1000 * 60 * 60)));
```

### 3. Reminder Count
**Files Fixed:**
- `netlify/functions/checkFulfillmentReminders.ts` - reminderCount clamped in updateReminderRecord()

**Fix Applied:**
```typescript
const safeReminderCount = Math.max(0, record.reminderCount || 0);
```

### 4. Timestamp Construction
**Status:** ✅ All Timestamp usage is safe
- All uses `Timestamp.fromDate()`, `Timestamp.fromMillis()`, or `Timestamp.now()`
- No manual construction with seconds/nanoseconds found

## Temporary Logging Added

Logging added to identify the exact source:
- `app/api/admin/orders/route.ts` - Logs limit value
- `lib/audit/logger.ts` - Logs limit values in all three functions
- `lib/firebase/messages.ts` - Logs pageSize values
- `netlify/functions/checkFulfillmentReminders.ts` - Logs limit and reminderCount
- `lib/notifications/processEvent.ts` - Logs via clampInt32() (if needed)

## Files Changed

1. `app/api/admin/orders/route.ts` - Added limit validation
2. `lib/audit/logger.ts` - Added limit validation to all three functions
3. `app/api/admin/notifications/run/route.ts` - Added limit validation
4. `lib/firebase/messages.ts` - Added pageSize validation
5. `netlify/functions/checkFulfillmentReminders.ts` - Added logging and reminderCount clamp
6. `app/api/admin/orders/[orderId]/send-reminder/route.ts` - Already fixed (clamped countdowns)
7. `lib/notifications/processEvent.ts` - Added clampInt32() helper and applied to all numeric fields

## Next Steps

1. Deploy and monitor logs to identify exact source if error persists
2. Remove temporary logging after confirming fix
3. Add unit tests for limit validation if needed
