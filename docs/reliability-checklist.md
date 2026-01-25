# Reliability Checklist for New Features

Use this checklist when adding new layouts, routes, auth gates, or scroll containers.

## Layout & Route Checklist

### ✅ Layout Structure
- [ ] Layout always renders something (never returns `null`)
- [ ] Layout uses flex or grid, not fixed positioning + margins
- [ ] If using sidebar, use flex layout: `flex flex-row` with sidebar as `flex-shrink-0`
- [ ] Main content area uses `flex-1 min-w-0` to prevent overflow issues
- [ ] No `md:ml-*` margin hacks - use proper flex layout instead

### ✅ Scroll Containers
- [ ] Flex child with `overflow-y-auto` must have `min-h-0` or `min-w-0`
- [ ] Avoid nested scroll containers when possible
- [ ] Test scroll behavior on mobile devices
- [ ] Use `100dvh` carefully (check browser support)

### ✅ Page Components
- [ ] Page always renders something (never returns `null` from root)
- [ ] Page uses consistent container structure:
  ```tsx
  <div className="min-h-screen bg-background pb-20 md:pb-6">
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
      {/* content */}
    </div>
  </div>
  ```
- [ ] Loading states show UI, not blank
- [ ] Error states show UI, not blank

## Auth & Guards Checklist

### ✅ Auth Gates
- [ ] Never return `null` - always show loading/redirecting state
- [ ] Loading state is visible and informative
- [ ] Redirect happens after showing feedback
- [ ] Gate doesn't block initial render unnecessarily

### ✅ Error Boundaries
- [ ] Error boundary always renders fallback UI
- [ ] Errors are logged to console AND error tracking service
- [ ] Fallback UI is user-friendly and actionable
- [ ] Error boundary doesn't hide errors silently

## Routing Checklist

### ✅ Route Groups
- [ ] Use route groups for layout variations, not conditional logic in layout
- [ ] Avoid special-case pathname checks in layouts
- [ ] Keep route structure predictable

### ✅ Navigation
- [ ] Sidebar navigation uses consistent active state logic
- [ ] Mobile navigation doesn't conflict with desktop
- [ ] Navigation state persists correctly on route changes

## Testing Checklist

### ✅ Visual Testing
- [ ] Test on mobile viewport (< 768px)
- [ ] Test on tablet viewport (768px - 1024px)
- [ ] Test on desktop viewport (> 1024px)
- [ ] Test with sidebar collapsed/expanded
- [ ] Test with slow network (throttle in DevTools)

### ✅ Functional Testing
- [ ] Navigate between all sidebar tabs - all render correctly
- [ ] Test auth flow: logged out → login → dashboard
- [ ] Test error scenarios: cause render error, verify boundary works
- [ ] Test loading states: verify UI shows during async operations

### ✅ Browser Testing
- [ ] Test in Chrome/Edge
- [ ] Test in Firefox
- [ ] Test in Safari (if possible)
- [ ] Test on iOS Safari (if possible)
- [ ] Test on Android Chrome (if possible)

## Code Review Checklist

### ✅ Before Merging
- [ ] No `return null` in layouts or auth gates
- [ ] No fixed positioning + margin hacks
- [ ] All scroll containers have proper `min-h-0`/`min-w-0`
- [ ] Error boundaries have proper error tracking
- [ ] Loading states are visible
- [ ] Mobile experience is tested

## Red Flags (Don't Merge)

❌ Layout returns `null`  
❌ Auth gate returns `null`  
❌ Using `md:ml-*` with fixed sidebar  
❌ Flex child with `overflow-y-auto` missing `min-h-0`  
❌ Error boundary only logs to console  
❌ No loading state for async operations  
❌ Special-case pathname checks in layout  
❌ Nested scroll containers without testing
