# Anti-Circumvention Protection Implementation Summary

## Overview
Implemented minimum viable anti-circumvention protections to keep deals on-platform through messaging, contact masking, payment enforcement, reputation tracking, and UX notices.

## Files Changed

### Core Safety & Messaging
1. **`lib/safety/sanitizeMessage.ts`** (NEW)
   - Message sanitization utility
   - Redacts phone numbers, emails, and payment keywords
   - Returns sanitized text and violation detection

2. **`lib/firebase/messages.ts`** (NEW)
   - Message thread and message management
   - `getOrCreateThread()` - Creates or retrieves thread
   - `sendMessage()` - Sends message with sanitization
   - `getThreadMessages()` - Fetches messages
   - `getUserThreads()` - Gets user's threads
   - `flagThread()` - Flags thread for admin review

3. **`lib/firebase/sellerStats.ts`** (NEW)
   - Seller stats management
   - `getSellerStats()` - Fetches completed sales count
   - Tracks on-platform completed transactions

4. **`lib/types.ts`**
   - Added `MessageThread` and `Message` interfaces
   - Added seller stats fields to `UserProfile`: `completedSalesCount`, `verifiedTransactionsCount`, `completionRate`

### API Routes
5. **`app/api/messages/send/route.ts`** (NEW)
   - Server-side message sending endpoint
   - Performs sanitization before storing
   - Checks order status to determine if contact should be allowed
   - Rate limited

### Payment Enforcement
6. **`lib/firebase/listings.ts`**
   - Updated `markListingSold()` to require paid transaction
   - Checks for order with status 'paid' or 'completed' before allowing sold status
   - Throws descriptive error if no payment found

7. **`app/api/stripe/transfers/release/route.ts`**
   - Added seller stats increment when payment is released
   - Updates `completedSalesCount` and `verifiedTransactionsCount`

### UI Components
8. **`components/messaging/MessageThread.tsx`** (NEW)
   - Message thread UI component
   - Shows safety notice when payment not completed
   - Displays redaction warnings
   - Includes report button

9. **`app/dashboard/messages/page.tsx`** (NEW)
   - Buyer messaging page
   - Creates/loads thread for listing
   - Integrates with MessageThread component

10. **`app/dashboard/admin/messages/page.tsx`** (NEW)
    - Admin view for flagged threads
    - Shows violation counts
    - Lists threads needing review

11. **`app/listing/[id]/page.tsx`**
    - Updated `handleContactSeller()` to navigate to messaging
    - Prevents self-messaging

12. **`components/listing/EnhancedSellerProfile.tsx`**
    - Fetches and displays seller stats
    - Shows completed sales count
    - Shows completion rate

13. **`app/dashboard/layout.tsx`**
    - Added "Flagged Messages" to admin nav

### Security Rules
14. **`firestore.rules`**
    - Added `messageThreads` collection rules
    - Only participants (buyer/seller) can read/write
    - Admin can read flagged threads
    - Messages subcollection rules

## Message Thread Schema

**Collection:** `messageThreads/{threadId}`

```typescript
{
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  buyerUnreadCount: number;
  sellerUnreadCount: number;
  flagged: boolean;
  violationCount: number;
  archived: boolean;
}
```

**Subcollection:** `messageThreads/{threadId}/messages/{messageId}`

```typescript
{
  id: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  listingId: string;
  body: string; // Sanitized version (what user sees)
  createdAt: Date;
  readAt?: Date;
  flagged?: boolean;
  wasRedacted: boolean;
  violationCount: number;
  detectedViolations: {
    phone: boolean;
    email: boolean;
    paymentKeywords: string[];
  };
}
```

## Sanitization Rules

### Contact Info Redaction (Before Payment)
- **Phone Numbers**: All formats (123-456-7890, (123) 456-7890, +1-123-456-7890, etc.)
- **Email Addresses**: Standard email regex pattern
- **Replacement**: `[REDACTED]`

### Payment Keywords (Always Redacted)
Keywords that trigger redaction:
- zelle, venmo, cashapp, cash app
- wire transfer, wire, ach
- paypal, pay pal
- text me, call me, email me, dm me, direct message
- off platform, off-platform, outside platform
- cash, check, money order
- western union, moneygram
- bitcoin, crypto, cryptocurrency, ethereum, btc, eth

### Unlock Rule
Contact info (phone/email) is unlocked when:
- Order status is `'paid'` or `'completed'`
- Payment method keywords remain redacted even after payment

### Violation Detection
- Messages with 2+ violations are automatically flagged
- Threads with 3+ total violations are flagged for admin review
- Violation count is tracked per thread

## Payment Status Check

Payment status is checked in:
1. **`lib/firebase/messages.ts`** - `sendMessage()` function
   - Queries orders collection for listing
   - Checks if order status is 'paid' or 'completed'
   - Passes status to sanitization function

2. **`app/api/messages/send/route.ts`** - Server-side endpoint
   - Queries orders before sanitization
   - Uses order status to determine `isPaid` flag

3. **`components/messaging/MessageThread.tsx`** - UI component
   - Receives `orderStatus` prop
   - Shows/hides safety notice based on payment status
   - Updates UI when payment is completed

## Guards Added to Prevent Off-Platform Completion

### Listing Status Guards
1. **`markListingSold()` in `lib/firebase/listings.ts`**
   - **Before**: Could mark listing as sold without payment
   - **After**: Requires order with status 'paid' or 'completed'
   - **Error Message**: "Cannot mark listing as sold without an on-platform payment"

2. **Webhook Handler** (`app/api/stripe/webhook/route.ts`)
   - Already marks listing as sold when payment completes
   - This is the correct flow - no manual "sold" without payment

### Order Status Flow
- **'pending'**: Payment not yet completed
- **'paid'**: Payment completed, funds held for delayed payout release (contact info unlocks)
- **'completed'**: Admin released funds to seller (full completion)

## Seller Stats Tracking

### Fields Added to UserProfile
- `completedSalesCount`: Incremented when order status becomes 'completed'
- `verifiedTransactionsCount`: Same as completedSalesCount
- `completionRate`: Calculated as (completedSalesCount / totalListingsCount) * 100

### Increment Logic
- **Location**: `app/api/stripe/transfers/release/route.ts`
- **Trigger**: When admin releases payment (order status → 'completed')
- **Method**: Uses Firestore `increment()` to avoid race conditions

### Display
- **Listing Pages**: Shows completed sales count in seller profile
- **Seller Dashboard**: Can be added to reputation/overview pages

## UX Notices & Reporting

### Safety Notices
1. **Pre-Payment Notice** (in MessageThread component):
   - "For your safety: Keep communication and payment on Wildlife Exchange. Contact info unlocks after payment is completed."

2. **Redaction Warning**:
   - "Contact details are hidden until payment is completed."
   - Shown when message is redacted

3. **Input Hint**:
   - Below message input: "Contact details are hidden until payment is completed."

### Reporting
1. **Report Button**: In MessageThread component header
2. **Admin View**: `/dashboard/admin/messages`
   - Lists all flagged threads
   - Shows violation counts
   - Displays last message preview

## Rate Limiting

- **Messages API**: 60 requests per minute (default limit)
- **Implementation**: Uses `rateLimitMiddleware` from `lib/rate-limit.ts`

## Security Rules Summary

### MessageThreads Collection
- **Read**: Buyer, seller, or admin
- **Create**: Buyer or seller (must be participant)
- **Update**: Buyer, seller, or admin
- **Delete**: Admin only

### Messages Subcollection
- **Read**: Sender, recipient, or admin
- **Create**: Sender only (must match auth.uid)
- **Update**: Admin only (for flagging)
- **Delete**: Not allowed

## Testing Checklist

- [ ] Send message before payment - contact info should be redacted
- [ ] Send message after payment - contact info should be visible
- [ ] Payment keywords always redacted
- [ ] Try to mark listing as sold without payment - should fail
- [ ] Mark listing as sold after payment - should succeed
- [ ] Seller stats increment when payment released
- [ ] Flagged threads appear in admin view
- [ ] Report button flags thread
- [ ] Safety notices display correctly

## Notes

- **Original messages are NOT stored** - only sanitized versions are saved
- **Payment method keywords remain redacted** even after payment (optional but implemented)
- **Violation tracking** is automatic and flags threads for review
- **Seller stats** are updated server-side to ensure accuracy
- **Backward compatible** - existing listings/orders work as before
