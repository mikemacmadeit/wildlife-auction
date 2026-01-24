# Blank Page Diagnostics - Implementation Summary

## What Was Done

### 1. Error Boundaries Added ✅
- **`app/dashboard/error.tsx`** - Catches errors in dashboard routes, displays error message + stack (dev)
- **`app/dashboard/admin/error.tsx`** - Catches errors in admin routes, displays error message + stack (dev)

These will now surface any errors that were previously causing blank pages.

### 2. Diagnostic Logging Added ✅

#### Dashboard Layout (`app/dashboard/layout.tsx`)
- Added `useEffect` that logs auth state on every change:
  - pathname, userId, email, authLoading, adminLoading, isAdmin, isSuperAdmin, role, showAdminNav
- Added **debug banner** (dev mode only) showing:
  - Current pathname
  - Auth status (user email or loading/None)
  - Role status (role value or loading/None)
  - Admin/Super admin flags
  - Show admin nav flag
  - Timestamp

#### useAdmin Hook (`hooks/use-admin.ts`)
- Enhanced logging throughout the role-checking process:
  - Logs when checkAdminStatus starts
  - Logs token claims check and results
  - Logs Firestore profile fetch and results
  - Logs final role determination
  - All logs prefixed with `[useAdmin]` for easy filtering

#### Admin Compliance Page (`app/dashboard/admin/compliance/page.tsx`)
- Added `useEffect` logging page state (userId, email, adminLoading, isAdmin)
- Enhanced loading spinner to show user email
- Enhanced access denied page to show diagnostic info in dev mode
- Added console logs before rendering main content

### 3. Build Verification ✅
- Production build completed successfully
- All routes compile without errors
- No TypeScript errors

## Next Steps - Testing & Evidence Collection

### 1. Start Production Server
```bash
npm run build
npm run start
```

### 2. Navigate to Blank Routes
Test these routes and capture:
- `/dashboard/admin/compliance`
- `/dashboard/admin/users`
- `/dashboard/admin/listings`
- Any other admin routes that blank

### 3. Check Browser Console
Look for logs prefixed with:
- `[DASHBOARD LAYOUT]` - Layout auth state
- `[useAdmin]` - Role checking process
- `[ADMIN COMPLIANCE PAGE]` - Page render state

### 4. Check Network Tab
- Look for failed API calls (401/403/500)
- Check if `/api/auth/bootstrap-user` exists and is called
- Check Firebase Auth token refresh calls

### 5. Check Server Terminal
- Look for any server-side errors
- Check for unhandled promise rejections
- Look for Firebase/Firestore errors

## Expected Root Causes (Based on Code Analysis)

### Hypothesis 1: `adminLoading` Stuck as `true`
**Symptoms:**
- Page shows loading spinner indefinitely
- Console shows `[useAdmin]` logs but never "Finished checkAdminStatus"
- No error in console

**Likely Cause:**
- `getUserProfile()` hanging or throwing unhandled error
- Firebase Auth `getIdTokenResult()` hanging
- Network timeout

**Fix:**
- Add timeout to `getUserProfile()` call
- Add error boundary around token claims check
- Verify Firebase config is correct

### Hypothesis 2: `isAdmin` is `false` when it should be `true`
**Symptoms:**
- Page shows "Access Denied"
- Console shows `[useAdmin]` logs with role='user' or role=null
- User object exists with correct email

**Likely Cause:**
- Role not set in Firestore user profile
- Token claims not set (if using custom claims)
- Firestore query failing silently

**Fix:**
- Verify user profile in Firestore has `role: 'super_admin'` or `superAdmin: true`
- Check Firebase Auth custom claims (if using)
- Verify Firestore rules allow reading user profile

### Hypothesis 3: Silent Error in Page Component
**Symptoms:**
- Page is completely blank (no loading, no access denied)
- Error boundary should catch it (check if error.tsx renders)
- Console may show error

**Likely Cause:**
- Component throws error during render
- Error is caught by error boundary but not displayed
- Missing dependency causing undefined access

**Fix:**
- Error boundaries will now show the error
- Check error message in error boundary UI

## Diagnostic Banner

The yellow debug banner at the top of dashboard pages (dev mode only) shows:
- **Path:** Current route
- **Auth:** User email or loading/None status
- **Role:** Role value or loading/None, plus Admin/Super flags
- **Show Admin Nav:** Whether admin nav is visible

If the banner shows:
- `Role: None` and `Admin: ✗` → Role not loading correctly
- `Role: Loading...` indefinitely → `adminLoading` stuck
- `Role: user` but user should be admin → Role not set in Firestore

## Files Modified

1. `app/dashboard/error.tsx` (NEW) - Dashboard error boundary
2. `app/dashboard/admin/error.tsx` (NEW) - Admin error boundary
3. `app/dashboard/layout.tsx` - Added diagnostic logging + banner
4. `hooks/use-admin.ts` - Enhanced logging throughout
5. `app/dashboard/admin/compliance/page.tsx` - Added diagnostic logging

## Removing Diagnostics

After identifying and fixing the root cause:
1. Remove debug banner from `app/dashboard/layout.tsx` (search for "DIAGNOSTIC BANNER")
2. Remove console.log statements (search for `[DASHBOARD LAYOUT]`, `[useAdmin]`, `[ADMIN COMPLIANCE PAGE]`)
3. Keep error boundaries - they're production-ready and useful

## Testing Checklist

- [ ] Start production server (`npm run start`)
- [ ] Navigate to `/dashboard/admin/compliance`
- [ ] Check browser console for diagnostic logs
- [ ] Check network tab for failed requests
- [ ] Check server terminal for errors
- [ ] Verify debug banner shows correct state
- [ ] Test with user that has `role: 'super_admin'` in Firestore
- [ ] Test with user that has `superAdmin: true` in Firestore
- [ ] Test with user that has custom claims set
- [ ] Capture all evidence (console logs, network requests, server errors)
