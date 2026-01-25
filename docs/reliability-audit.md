# Next.js App Reliability Audit
**Date:** January 23, 2026  
**Auditor:** Senior Next.js App Reliability Engineer  
**Scope:** Pages mounting but not visible, blank content, layout collapse, auth gates, error boundaries, routing, scroll patterns, hydration, z-index, Tailwind misuse

---

## P0 MUST FIX (Production Breaking)

### 1. RequireAuth Returns Null - Blank Page Risk
**File:** `components/auth/RequireAuth.tsx:63`  
**Code:**
```tsx
if (!user) {
  return null; // Will redirect via useEffect
}
```
**Why Risky:** 
- Component returns `null` while redirect is pending, causing blank page flash
- If redirect fails or is slow, user sees nothing
- React hydration mismatch risk if server renders differently

**Symptom:** Blank page when navigating to protected routes, especially on slow networks  
**Reproduce:** Navigate to `/dashboard/*` while logged out or during auth state transition

**Fix:** Always render a loading/redirecting state instead of null:
```tsx
if (!user) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    </div>
  );
}
```

---

### 2. SiteGateClient Returns Null During Check - Blank Page Risk
**File:** `components/site/SiteGateClient.tsx:34-36`  
**Code:**
```tsx
if (allowed === null) {
  // Show nothing while checking
  return null;
}
```
**Why Risky:**
- Entire app renders nothing while checking cookie
- Causes blank page on initial load
- No visual feedback to user

**Symptom:** Blank page on first visit when site gate is enabled  
**Reproduce:** Enable `SITE_GATE_ENABLED` and visit site

**Fix:** Show loading state:
```tsx
if (allowed === null) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
```

---

### 3. Dashboard Layout Fixed Sidebar + Margin Hack - Layout Collapse Risk
**File:** `app/dashboard/layout.tsx:406, 928`  
**Code:**
```tsx
// Sidebar
'hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:left-0 md:z-40'

// Main content
'md:ml-64' // Margin left hack
```
**Why Risky:**
- Fixed sidebar + margin-left creates fragile layout
- If sidebar width changes, margin breaks
- Can cause content to be hidden or overlap
- Not responsive to sidebar collapse state properly

**Symptom:** Content hidden behind sidebar, or content shifts unexpectedly  
**Reproduce:** Toggle sidebar collapse, resize window, or change sidebar width

**Fix:** Use proper flex layout without fixed positioning:
```tsx
<div className="min-h-screen bg-background flex flex-col md:flex-row">
  {/* Sidebar - in flow, not fixed */}
  <aside className="hidden md:flex md:flex-col md:w-64 md:flex-shrink-0 border-r border-border/50 bg-card">
    {/* sidebar content */}
  </aside>
  
  {/* Main content - flex-1 takes remaining space */}
  <div className="flex-1 flex flex-col min-w-0">
    <main className="flex-1 overflow-y-auto min-h-0">
      {children}
    </main>
  </div>
</div>
```

---

### 4. Main Content Area Missing min-h-0 - Scroll Container Collapse
**File:** `app/dashboard/layout.tsx:933`  
**Code:**
```tsx
<main className="flex-1 overflow-y-auto">
  <ProductionErrorBoundary>
    {children}
  </ProductionErrorBoundary>
</main>
```
**Why Risky:**
- Flex child with `overflow-y-auto` needs `min-h-0` to prevent flex from giving it intrinsic height
- Without `min-h-0`, flex child can grow beyond container, breaking scroll
- Can cause content to be cut off or not scrollable

**Symptom:** Content doesn't scroll, or scrolls entire page instead of main area  
**Reproduce:** Navigate to long content page like messages or orders

**Fix:**
```tsx
<main className="flex-1 overflow-y-auto min-h-0">
  <ProductionErrorBoundary>
    {children}
  </ProductionErrorBoundary>
</main>
```

---

### 5. ProductionErrorBoundary May Swallow Errors Silently
**File:** `components/error-boundary/ProductionErrorBoundary.tsx:29-32`  
**Code:**
```tsx
componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
  console.error('[ProductionErrorBoundary] Component error:', error, errorInfo);
  this.props.onError?.(error);
}
```
**Why Risky:**
- Only logs to console - no external error tracking visible
- If console is closed, errors are invisible
- No guarantee error is reported to monitoring service

**Symptom:** Errors occur but are not visible or tracked  
**Reproduce:** Cause a render error in a page component

**Fix:** Add Sentry/error tracking integration:
```tsx
componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
  console.error('[ProductionErrorBoundary] Component error:', error, errorInfo);
  // Send to error tracking service
  if (typeof window !== 'undefined' && window.Sentry) {
    window.Sentry.captureException(error, { contexts: { react: errorInfo } });
  }
  this.props.onError?.(error);
}
```

---

## P1 SHOULD FIX (User Experience Issues)

### 6. ProfileCompletionGate Returns Null - No Visual Feedback
**File:** `components/auth/ProfileCompletionGate.tsx:86-88`  
**Code:**
```tsx
if (!isAuthedArea) return null;
if (!initialized || loading) return null;
if (!user) return null;
```
**Why Risky:**
- Returns null silently, no indication gate is checking
- User might think nothing is happening

**Symptom:** No feedback while profile completion is being checked  
**Reproduce:** Navigate to dashboard with incomplete profile

**Fix:** Show subtle loading indicator or ensure modal appears quickly

---

### 7. Nested Scroll Containers in Messages Page
**File:** `app/dashboard/messages/page.tsx:404, 439`  
**Code:**
```tsx
<div className="lg:hidden relative" style={{ height: 'calc(100dvh - 280px)', minHeight: '400px' }}>
  <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
```
**Why Risky:**
- Nested scroll areas can trap scroll on mobile
- Complex height calculations can break on different viewports
- `100dvh` may not be supported in all browsers

**Symptom:** Scroll feels trapped or doesn't work on mobile  
**Reproduce:** Open messages page on mobile device

**Fix:** Simplify scroll container hierarchy, use single scroll area where possible

---

### 8. Dashboard Layout Special Case for /dashboard/listings/new
**File:** `app/dashboard/layout.tsx:384-392`  
**Code:**
```tsx
if (pathname === '/dashboard/listings/new') {
  return (
    <RequireAuth>
      <ProfileCompletionGate />
      {children}
    </RequireAuth>
  );
}
```
**Why Risky:**
- Special case breaks layout consistency
- This route doesn't get sidebar/navigation
- If route changes, this check might break

**Symptom:** Inconsistent layout for listing creation page  
**Reproduce:** Navigate to `/dashboard/listings/new`

**Fix:** Use route groups or handle in page component instead of layout

---

## P2 NICE TO HAVE (Optimizations)

### 9. Multiple Return Null in Helper Functions
**Files:** Various page components  
**Why Risky:**
- Not critical, but makes code harder to debug
- Some helper functions return null when they could return empty fragment

**Fix:** Review and standardize - use `<>` or `null` consistently based on use case

---

### 10. Z-Index Stacking Context Issues
**File:** `app/dashboard/layout.tsx:406, 940`  
**Code:**
```tsx
'md:fixed md:inset-y-0 md:left-0 md:z-40' // Sidebar
'z-50' // Mobile bottom nav
```
**Why Risky:**
- Z-index values not organized in a system
- Can cause stacking issues with modals/dialogs

**Fix:** Create z-index scale and document usage

---

## Summary

**P0 Issues:** 5 critical issues that can cause blank pages or broken layouts  
**P1 Issues:** 3 UX issues that degrade user experience  
**P2 Issues:** 2 optimization opportunities

**Total Issues Found:** 10  
**Estimated Fix Time:** 2-3 hours for P0, 1 hour for P1

---

## Implementation Status

### ✅ P0 Fixes Implemented

1. **RequireAuth** - Now shows loading state instead of null ✅
2. **SiteGateClient** - Now shows loading state instead of null ✅
3. **Dashboard Layout** - Converted from fixed sidebar + margin to proper flex layout ✅
4. **Seller Layout** - Converted from fixed sidebar + margin to proper flex layout ✅
5. **Main Content Area** - Added `min-h-0` to prevent scroll container collapse ✅
6. **Error Boundary** - Enhanced with Sentry integration and custom event dispatch ✅

### ✅ Diagnostic Tools Added

1. **VisibilityDiagnostics** - Dev-only utility to detect 0x0 elements, collapsed parents, overflow clipping ✅
2. **AppShellGuard** - Component that guarantees something always renders ✅
3. **/dev/diagnostics** - Test page showing layout tree, container rects, error boundary state ✅

### 📝 P1 Fixes (Recommended but not critical)

1. **ProfileCompletionGate** - Returns null but this is acceptable (it's just a modal overlay)
2. **Nested Scroll Containers** - Messages page has complex scroll - monitor for mobile issues
3. **Special Case Route** - `/dashboard/listings/new` special case documented with TODO

---

## Testing Recommendations

1. **Test all sidebar navigation** - Click every tab, verify all pages render
2. **Test auth flow** - Log out, try to access protected routes, verify loading states
3. **Test error scenarios** - Cause render errors, verify error boundary works
4. **Test mobile** - Verify layout works on mobile viewports
5. **Visit /dev/diagnostics** - Check container rects and visibility diagnostics
6. **Test slow network** - Throttle network in DevTools, verify loading states appear

---

## Monitoring

- Visibility diagnostics run automatically in dev mode
- Error boundary now sends to Sentry if available
- Custom error events dispatched for external monitoring
- All fixes maintain backward compatibility
