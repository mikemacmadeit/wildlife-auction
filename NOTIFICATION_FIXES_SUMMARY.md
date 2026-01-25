# Notification System Fixes - January 24, 2026

## Summary

Fixed missing notifications for post-purchase order status updates and ensured all users start with all notifications enabled by default.

## Issues Found

### 1. Missing Order Status Notifications
- **Order.Delivered**: No notification sent to buyer when seller marks order as delivered
- **Order.Accepted**: No notification sent to seller when buyer accepts order

### 2. Notification Preferences Initialization
- New users were created with legacy notification preferences in `users/{uid}/profile/notifications`
- The new system uses `users/{uid}/notificationPreferences/default`
- New users didn't automatically get the canonical preferences doc, causing notifications to be suppressed

## Fixes Implemented

### 1. Added Missing Notification Types

**Files Modified:**
- `lib/notifications/types.ts`: Added `Order.Delivered` and `Order.Accepted` to event types and payloads
- `lib/notifications/schemas.ts`: Added Zod schemas for new notification types
- `lib/notifications/rules.ts`: Added rules for new notification types (all channels enabled, no quiet hours)
- `lib/notifications/inApp.ts`: Added in-app notification builders
- `lib/notifications/processEvent.ts`: Added email template mappings

### 2. Added Email Templates

**Files Modified:**
- `lib/email/templates.ts`: Added `getOrderDeliveredEmail()` and `getOrderAcceptedEmail()` functions
- `lib/email/index.ts`: Registered new email templates with schemas

### 3. Updated Order Status Endpoints

**Files Modified:**
- `app/api/orders/[orderId]/mark-delivered/route.ts`: Now emits `Order.Delivered` notification to buyer
- `app/api/orders/[orderId]/accept/route.ts`: Now emits `Order.Accepted` notification to seller

### 4. Fixed Notification Preferences Initialization

**Files Modified:**
- `lib/firebase/users.ts`: Now automatically creates canonical notification preferences doc (`users/{uid}/notificationPreferences/default`) with all notifications enabled when a new user is created

### 5. Updated Category Rules

**Files Modified:**
- `lib/notifications/rules.ts`: Updated `decideChannels()` to handle `Order.Preparing`, `Order.InTransit`, `Order.Delivered`, and `Order.Accepted` in the orders category check

## Complete Order Status Notification Flow

Now all order status updates trigger notifications:

1. **Order.Confirmed** → Buyer (payment received)
2. **Order.Received** → Seller (new sale)
3. **Order.Preparing** → Buyer (seller preparing delivery)
4. **Order.InTransit** → Buyer (order in transit)
5. **Order.Delivered** → Buyer (seller marked delivered) ✅ NEW
6. **Order.Accepted** → Seller (buyer accepted order) ✅ NEW
7. **Order.DeliveryConfirmed** → Buyer (admin confirmed delivery)
8. **Order.DeliveryCheckIn** → Buyer (follow-up check-in)
9. **Payout.Released** → Seller (funds released)

## Why Some Notifications Were Not Firing

### 1. Missing Notification Types
- `Order.Delivered` and `Order.Accepted` didn't exist, so no notifications were sent

### 2. Missing Preferences Doc
- New users didn't have `users/{uid}/notificationPreferences/default` doc
- The system falls back to legacy preferences or defaults, but the migration happens lazily
- This could cause notifications to be suppressed if preferences weren't properly initialized

### 3. Category Preferences
- Some order notifications weren't properly mapped in the category check
- Fixed by adding all order status types to the orders category check

### 4. Quiet Hours (Not an Issue)
- All order notifications have `allowDuringQuietHours: true`, so they're not delayed

### 5. Rate Limits (Not an Issue)
- Rate limits are per-user, per-hour/per-day
- They prevent spam but don't block legitimate notifications

## Default Notification Settings

All new users now start with:
- **Email**: Enabled ✅
- **Push**: Disabled (opt-in)
- **SMS**: Disabled (opt-in)
- **All Categories**: Enabled ✅
  - Auctions: All enabled
  - Orders: All enabled
  - Messages: Enabled
  - Onboarding: Enabled
  - Marketing: Disabled (opt-in)
  - Admin: Enabled (for admins)
- **Quiet Hours**: Disabled ✅

## Testing Recommendations

1. Test order flow end-to-end:
   - Create order → Check buyer receives `Order.Confirmed`
   - Seller marks preparing → Check buyer receives `Order.Preparing`
   - Seller marks in transit → Check buyer receives `Order.InTransit`
   - Seller marks delivered → Check buyer receives `Order.Delivered` ✅
   - Buyer accepts → Check seller receives `Order.Accepted` ✅

2. Test new user registration:
   - Create new user → Verify `users/{uid}/notificationPreferences/default` exists
   - Verify all categories are enabled by default

3. Check notification preferences:
   - Verify existing users can still access preferences
   - Verify legacy users get migrated properly

## Next Steps

1. Monitor notification delivery rates
2. Consider adding push notifications for critical order updates
3. Add analytics to track notification engagement
4. Consider SMS notifications for high-value orders
