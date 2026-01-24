# LAYOUT FIX PLAN - PRODUCTION RESTORATION

## ROOT CAUSE IDENTIFIED:

**THE PROBLEM:**
1. Dashboard layout includes `/seller/overview` link → causes layout switch
2. When `/dashboard` loads, it might be showing seller layout initially (hydration issue)
3. Navigation items might be conditionally hidden based on state that only initializes after navigation

## FIX STRATEGY:

### STEP 1: Remove Cross-Layout Navigation
- Remove `/seller/overview` from dashboard navigation
- Dashboard layout should ONLY link to `/dashboard/*` routes
- Seller layout should ONLY link to `/seller/*` routes

### STEP 2: Fix Dashboard Overview
- `/dashboard` should show a proper dashboard overview (not redirect)
- OR redirect to a dashboard route (not seller route)

### STEP 3: Ensure Navigation Always Renders
- Remove any conditional rendering that hides navigation
- Ensure baseNavItems always render regardless of loading state
- Fix admin nav to not wait for loading

### STEP 4: Fix Active State Logic
- Ensure `isActive` doesn't conflict between layouts
- Make sure active states are layout-specific

## IMPLEMENTATION:
