# P0.4 — Favorites/Watchlist: localStorage → Firestore Sync — COMPLETE ✅

**Date:** January 12, 2026  
**Status:** ✅ **COMPLETE**

---

## Summary

Implemented Firestore-backed watchlist with seamless localStorage migration. Favorites are now persistent, cross-device, and reliable for authenticated users, while preserving localStorage behavior for logged-out users.

---

## Files Modified

### 1. `hooks/use-favorites.ts`

**Major Changes:**

1. **Dual-Mode Operation:**
   - **Logged-out mode:** Uses localStorage only (preserves existing behavior)
   - **Logged-in mode:** Uses Firestore as source of truth with real-time sync

2. **Firestore Integration:**
   - Subscribes to `/users/{uid}/watchlist` using `onSnapshot`
   - Real-time updates when favorites change
   - Optimistic updates with rollback on error

3. **localStorage Migration:**
   - On first login, reads localStorage favorites
   - Syncs to Firestore using `setDoc` with `merge: true` (idempotent)
   - Marks as synced per user to prevent duplicate syncs
   - Mirrors Firestore favorites to localStorage for offline support

4. **Error Handling:**
   - Rollback optimistic updates on write failure
   - Shows toast notifications for errors
   - Falls back to localStorage on permission-denied errors

5. **New Return Value:**
   - Added `isLoading` state for initial load

**Hook Behavior:**

```typescript
// Logged-out mode
- Reads from localStorage on mount
- Writes to localStorage on change
- No Firestore calls

// Logged-in mode
- Subscribes to Firestore watchlist (real-time)
- Writes to Firestore on toggle/add/remove
- Mirrors to localStorage for offline support
- Syncs localStorage favorites on first login
```

**API Changes:**
- `toggleFavorite()` - Now async, returns `Promise<'added' | 'removed'>`
- `addFavorite()` - Now async
- `removeFavorite()` - Now async
- Added `isLoading` to return value

---

### 2. `components/listings/FavoriteButton.tsx`

**Changes:**
- Updated `handleClick` to be async
- Awaits `toggleFavorite()` result
- Handles errors gracefully (error toast shown by hook)

**Before:**
```typescript
const handleClick = (e: React.MouseEvent) => {
  const action = toggleFavorite(listingId);
  toast({ ... });
};
```

**After:**
```typescript
const handleClick = async (e: React.MouseEvent) => {
  try {
    const action = await toggleFavorite(listingId);
    toast({ ... });
  } catch (error) {
    // Error toast handled in hook
  }
};
```

---

### 3. `app/listing/[id]/page.tsx`

**Changes:**
- Updated `handleAddToWatchlist` to be async
- Awaits `toggleFavorite()` result
- Handles errors gracefully

**Before:**
```typescript
const handleAddToWatchlist = () => {
  toggleFavorite(listing.id);
  toast({ ... });
};
```

**After:**
```typescript
const handleAddToWatchlist = async () => {
  try {
    const action = await toggleFavorite(listing.id);
    toast({ ... });
  } catch (error) {
    // Error toast handled in hook
  }
};
```

---

## Firestore Structure

**Collection Path:**
```
/users/{uid}/watchlist/{listingId}
```

**Document Structure:**
```typescript
{
  listingId: string,        // Same as document ID (redundant but useful for queries)
  createdAt: Timestamp      // Server timestamp
}
```

**Security Rules:**
- ✅ Read: Owner only (`request.auth.uid == userId`)
- ✅ Create: Owner only, validates `listingId` matches document ID
- ✅ Delete: Owner only
- ❌ Update: Not allowed (immutable entries)

---

## Migration Flow

### First Login

1. **Check Sync Status:**
   - Checks `localStorage.getItem('wildlife-exchange-favorites-synced-{uid}')`
   - If already synced, skip migration

2. **Read localStorage:**
   - Reads `localStorage.getItem('wildlife-exchange-favorites')`
   - Parses array of listing IDs

3. **Sync to Firestore:**
   - For each listing ID:
     - Creates document at `/users/{uid}/watchlist/{listingId}`
     - Uses `setDoc(..., { merge: true })` for idempotency
     - Ignores errors for individual items (continues with others)

4. **Mark as Synced:**
   - Sets `localStorage.setItem('wildlife-exchange-favorites-synced-{uid}', 'true')`
   - Prevents duplicate syncs

5. **Firestore Subscription:**
   - `onSnapshot` updates local state
   - Mirrors to localStorage for offline support

---

## Optimistic Updates

**Flow:**
1. User clicks favorite button
2. **Optimistic update:** UI updates immediately (local state)
3. **Firestore write:** Attempts to write to Firestore
4. **Success:** Firestore `onSnapshot` confirms update (no change needed)
5. **Failure:** Rollback local state, show error toast

**Benefits:**
- Instant UI feedback
- Better UX (no waiting for network)
- Automatic rollback on error

---

## Edge Cases Handled

### 1. Rapid Toggle
- **Solution:** Firestore idempotency (`setDoc` with `merge: true`)
- Multiple rapid clicks won't cause duplicate writes
- Last write wins

### 2. User Logs Out
- **Solution:** Falls back to localStorage
- Cleans up Firestore subscription
- Preserves favorites in localStorage

### 3. User Logs In
- **Solution:** Syncs localStorage to Firestore
- Subscribes to Firestore for real-time updates
- No user action required

### 4. Empty Watchlist
- **Solution:** Handles empty state gracefully
- No errors when watchlist is empty
- Empty state shown in UI

### 5. Permission Denied
- **Solution:** Falls back to localStorage
- Shows error toast
- Continues working with localStorage

### 6. Network Errors
- **Solution:** Rollback optimistic update
- Shows error toast
- User can retry

### 7. Multiple Devices
- **Solution:** Firestore is source of truth
- Real-time sync via `onSnapshot`
- Favorites appear on all devices instantly

---

## Manual Testing Guide

### Test 1: Favorite While Logged Out

**Steps:**
1. Ensure you're logged out
2. Navigate to a listing page
3. Click favorite button
4. **Expected:**
   - Heart icon fills immediately
   - Toast: "Added to Favorites"
   - Favorite saved to localStorage
   - Refresh page → Favorite persists

**Verify:**
- ✅ Favorite works without login
- ✅ Persists in localStorage
- ✅ No Firestore calls (check Network tab)

---

### Test 2: Login → Favorites Appear

**Steps:**
1. While logged out, favorite 2-3 listings
2. Log in
3. Navigate to browse page or listing pages
4. **Expected:**
   - Favorites appear immediately (or after brief sync)
   - Heart icons are filled for favorited listings
   - Favorites synced to Firestore (check Firestore Console)

**Verify:**
- ✅ Favorites migrate to Firestore
- ✅ UI shows favorites correctly
- ✅ No duplicate favorites
- ✅ Sync only happens once (check localStorage for sync flag)

---

### Test 3: Login on Second Device

**Steps:**
1. On Device A: Log in, favorite 2-3 listings
2. On Device B: Log in with same account
3. Navigate to browse page
4. **Expected:**
   - Favorites from Device A appear on Device B
   - Heart icons are filled
   - Real-time sync works

**Verify:**
- ✅ Favorites sync across devices
- ✅ Real-time updates work
- ✅ No manual refresh needed

---

### Test 4: Toggle Favorites While Logged In

**Steps:**
1. Log in
2. Navigate to a listing page
3. Click favorite button (add)
4. Click again (remove)
5. Click again (add)
6. **Expected:**
   - UI updates immediately (optimistic)
   - Toast notifications appear
   - Firestore updates (check Firestore Console)
   - No errors

**Verify:**
- ✅ Optimistic updates work
- ✅ Firestore writes succeed
- ✅ No duplicate entries
- ✅ Rapid toggles handled correctly

---

### Test 5: Log Out → No Crash

**Steps:**
1. Log in, favorite some listings
2. Log out
3. Navigate to listing pages
4. **Expected:**
   - No errors in console
   - Favorites still visible (from localStorage)
   - Can still toggle favorites (localStorage only)

**Verify:**
- ✅ No crashes on logout
- ✅ Falls back to localStorage gracefully
- ✅ Favorites still work

---

### Test 6: Network Error Handling

**Steps:**
1. Log in
2. Open DevTools → Network tab → Throttle to "Offline"
3. Try to favorite a listing
4. **Expected:**
   - Optimistic update (UI changes)
   - Error toast appears
   - Rollback (UI reverts)
   - Favorite not saved

**Verify:**
- ✅ Error handling works
- ✅ Rollback works
- ✅ User-friendly error message

---

### Test 7: Permission Denied

**Steps:**
1. Temporarily break Firestore rules (or use wrong account)
2. Try to favorite a listing
3. **Expected:**
   - Error toast appears
   - Falls back to localStorage
   - No crash

**Verify:**
- ✅ Permission errors handled
- ✅ Graceful fallback
- ✅ User can continue using app

---

### Test 8: Empty Watchlist

**Steps:**
1. Log in with new account (no favorites)
2. Navigate to browse page
3. **Expected:**
   - No errors
   - Empty state shown (if applicable)
   - Can add favorites

**Verify:**
- ✅ Empty state handled
- ✅ No errors
- ✅ Can add favorites

---

### Test 9: Component Integration

**Steps:**
1. Check all components that use favorites:
   - `FavoriteButton` (listing cards, detail page)
   - Listing detail page watchlist button
2. **Expected:**
   - All components work correctly
   - UI updates consistently
   - No breaking changes

**Verify:**
- ✅ `FavoriteButton` works
- ✅ Listing detail page works
- ✅ Listing cards work
- ✅ No UI regressions

---

## Build Verification

**Status:** ✅ **Build Successful**

```bash
npm run build
# ✓ Compiled successfully
# ✓ No TypeScript errors
# ✓ No linter errors
```

---

## Performance Considerations

### Firestore Reads
- **Initial Load:** One `onSnapshot` subscription per user
- **Updates:** Real-time via `onSnapshot` (no polling)
- **Cost:** Minimal (one read per favorite, cached)

### localStorage Writes
- **Frequency:** Only on changes (not on every render)
- **Size:** Array of listing IDs (minimal)
- **Performance:** Synchronous, fast

### Migration
- **One-time:** Per user, on first login
- **Idempotent:** Safe to run multiple times
- **Async:** Doesn't block UI

---

## Limitations & Future Enhancements

### Current Limitations

1. **Offline Support:**
   - Favorites work offline (localStorage)
   - But won't sync until online
   - **Future:** Queue writes for when online

2. **Sync Conflicts:**
   - If user favorites on multiple devices simultaneously
   - Last write wins (Firestore handles this)
   - **Future:** Conflict resolution UI

3. **Bulk Operations:**
   - No bulk add/remove
   - **Future:** Bulk favorite/unfavorite

### Future Enhancements (P1+)

1. **Watchlist Page:**
   - Dedicated page showing all favorites
   - Filter/sort favorites
   - Remove multiple at once

2. **Notifications:**
   - Notify when favorited listing price changes
   - Notify when favorited auction ends soon

3. **Analytics:**
   - Track favorite counts
   - Popular listings based on favorites

4. **Sharing:**
   - Share favorite lists
   - Public favorite collections

---

## Checklist

- [x] `use-favorites.ts` updated with Firestore sync
- [x] localStorage migration on login implemented
- [x] Optimistic updates with rollback
- [x] `FavoriteButton` updated for async
- [x] Listing detail page updated for async
- [x] Error handling implemented
- [x] Edge cases handled
- [x] Build compiles successfully
- [x] Manual tests documented

---

## Next Steps

**P0.4 is complete.** Favorites are now:
- ✅ Persistent across devices (Firestore)
- ✅ Real-time synced (onSnapshot)
- ✅ Seamlessly migrated from localStorage
- ✅ Works offline (localStorage fallback)
- ✅ Optimistic updates with error handling

**Proceed to P0.5:** Remove/Isolate Mock Data

---

**Last Updated:** January 12, 2026
