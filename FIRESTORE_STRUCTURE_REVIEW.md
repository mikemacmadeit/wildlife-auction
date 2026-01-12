# Firestore Structure Review & Optimization Plan
## Wildlife Exchange Marketplace

**Date:** Current  
**Status:** 🔴 **CRITICAL GAPS IDENTIFIED**  
**Priority:** High - Required for production

---

## Executive Summary

The application has **NOT** been properly wired to Firestore for data persistence. Key findings:

1. ❌ **Listing creation is NOT connected to Firestore** - Only logs to console
2. ❌ **No listing status/state management** - Missing active/draft/sold/expired states
3. ❌ **Seller data is embedded instead of referenced** - Should use userId references
4. ❌ **Missing critical collections** - bids, orders, transactions, messages, analytics
5. ❌ **No audit trail** - Missing createdBy, updatedBy, timestamps
6. ❌ **Insufficient analytics fields** - Views, favorites, conversion tracking
7. ❌ **No safety/security fields** - Missing fraud detection, verification status

---

## Current State Analysis

### ✅ What's Working

1. **User Profile Storage** (`/users/{userId}`)
   - ✅ User documents are created on registration
   - ✅ Profile completion modal updates Firestore
   - ✅ Basic user data structure exists

2. **Firestore Utilities** (`lib/firebase/firestore.ts`)
   - ✅ Generic CRUD functions implemented
   - ✅ Helper functions for queries

3. **Type Definitions** (`lib/types.ts`)
   - ✅ Basic Listing interface exists
   - ✅ UserProfile interface exists
   - ⚠️ Bid interface is incomplete
   - ❌ No Order/Transaction interfaces

### ❌ Critical Issues

#### 1. Listing Creation NOT Connected
**Location:** `app/dashboard/listings/new/page.tsx`

```typescript
const handleComplete = (data: Record<string, unknown>) => {
  // Mock: Save listing
  console.log('Listing created:', { ...formData, ...data });
  alert('Listing created successfully! (Mock)');
  router.push('/dashboard');
};
```

**Problem:** Listings are NOT saved to Firestore. They only log to console.

#### 2. Missing Listing Status Management
Current `Listing` interface has NO status field:
- ❌ No `status: 'draft' | 'active' | 'sold' | 'expired' | 'cancelled'`
- ❌ No way to track listing lifecycle
- ❌ Cannot differentiate between active and completed listings

#### 3. Seller Data Structure Issue
Current structure embeds seller info:
```typescript
seller: {
  id: string;        // ⚠️ Using email, should be Firebase UID
  name: string;      // ⚠️ Duplicated data (should reference user)
  rating: number;    // ⚠️ Should be calculated/denormalized
  responseTime: string;
  verified: boolean;
}
```

**Problem:** 
- Data duplication
- Seller info can become stale
- Hard to query by seller
- Should reference `/users/{userId}` and denormalize only essential fields

#### 4. Missing Collections

The following collections are NOT implemented:

- ❌ **`listings`** - Not connected (mock data only)
- ❌ **`bids`** - No collection, incomplete type definition
- ❌ **`orders`** - No collection, no type definition
- ❌ **`transactions`** - No collection, no payment tracking
- ❌ **`messages`** - No collection (UI exists but no backend)
- ❌ **`watchlist/favorites`** - No collection
- ❌ **`analytics/events`** - No collection for tracking
- ❌ **`reviews/ratings`** - No collection
- ❌ **`reports/flags`** - No safety/reporting system

#### 5. Missing Analytics Fields

No fields for tracking:
- ❌ View count
- ❌ Unique viewers
- ❌ Favorite/watchlist count
- ❌ Inquiry count
- ❌ Conversion rate
- ❌ Search impressions
- ❌ Click-through rate

#### 6. Missing Safety/Audit Fields

No fields for:
- ❌ Created by (userId)
- ❌ Updated by (userId)
- ❌ Last modified timestamp
- ❌ IP address (for fraud detection)
- ❌ Device fingerprint
- ❌ Flag count
- ❌ Reported by users
- ❌ Admin review status
- ❌ Verification status

---

## Recommended Optimized Firestore Structure

### Collection: `listings`

**Structure:**
```typescript
/listings/{listingId}
{
  // Core Listing Data
  title: string;
  description: string;
  type: 'auction' | 'fixed' | 'classified';
  category: 'cattle' | 'horses' | 'wildlife' | 'equipment' | 'land' | 'other';
  status: 'draft' | 'active' | 'sold' | 'expired' | 'cancelled' | 'flagged';
  
  // Pricing (type-specific)
  price?: number;              // Fixed price listings
  startingBid?: number;        // Auction listings
  reservePrice?: number;       // Auction listings
  currentBid?: number;         // Auction listings (denormalized from bids collection)
  buyNowPrice?: number;        // Optional buy-now for auctions
  
  // Media
  images: string[];            // Firebase Storage URLs
  videos?: string[];           // Optional videos
  
  // Location
  location: {
    city: string;
    state: string;
    zip?: string;
    country: string;           // Default: 'US'
    coordinates?: {            // For map features
      latitude: number;
      longitude: number;
    };
  };
  
  // Seller Reference (IMPORTANT: Use userId, not email)
  sellerId: string;            // Firebase Auth UID - REFERENCES /users/{sellerId}
  
  // Denormalized Seller Data (for performance - update on user change)
  seller: {
    name: string;              // From user profile
    verified: boolean;         // From user.seller.verified
    rating: number;            // Calculated from reviews
    responseTime: string;      // From user.seller.responseTime
    totalSales: number;        // From user.seller.totalSales
  };
  
  // Trust/Safety Flags
  trust: {
    verified: boolean;
    insuranceAvailable: boolean;
    transportReady: boolean;
    healthCertificate: boolean;
    papersIncluded: boolean;
  };
  
  // Metadata (searchable fields)
  metadata: {
    quantity: number;
    breed?: string;
    species?: string;
    age?: string;
    gender?: 'male' | 'female' | 'mixed';
    weight?: number;
    healthStatus?: 'excellent' | 'good' | 'fair' | 'poor';
    papers?: boolean;
    registered?: boolean;
    breedingStatus?: string;
    tags?: string[];           // For custom tagging/search
  };
  
  // Auction-specific
  endsAt?: Timestamp;          // Auction end time
  bidCount?: number;           // Denormalized count from bids collection
  watchers?: number;           // Denormalized count from watchlist
  
  // Featured/Promotion
  featured: boolean;
  featuredUntil?: Timestamp;
  promoted?: boolean;
  promotedUntil?: Timestamp;
  
  // Analytics (updated via Cloud Functions or client)
  analytics: {
    views: number;
    uniqueViews: number;       // Requires user tracking
    favorites: number;          // Denormalized from watchlist
    inquiries: number;          // Count of messages
    shares: number;
    impressions: number;        // Search/listing views
  };
  
  // Audit Trail
  createdBy: string;           // userId
  createdAt: Timestamp;
  updatedBy?: string;          // userId
  updatedAt: Timestamp;
  publishedAt?: Timestamp;     // When status changed to 'active'
  soldAt?: Timestamp;          // When status changed to 'sold'
  
  // Safety/Moderation
  flagged: boolean;
  flagCount: number;
  flaggedBy?: string[];        // Array of userIds who flagged
  adminReviewed: boolean;
  adminReviewedBy?: string;    // Admin userId
  adminReviewedAt?: Timestamp;
  
  // Soft delete
  deleted: boolean;
  deletedAt?: Timestamp;
  deletedBy?: string;
}
```

**Indexes Required:**
- `status` + `createdAt` (desc)
- `sellerId` + `status` + `createdAt` (desc)
- `category` + `status` + `createdAt` (desc)
- `location.state` + `status` + `createdAt` (desc)
- `type` + `status` + `endsAt` (asc) - for ending soon auctions
- `featured` + `status` + `createdAt` (desc)
- `metadata.breed` + `status` - for breed filtering
- `analytics.views` (desc) - for popular listings

---

### Collection: `bids`

**Structure:**
```typescript
/bids/{bidId}
{
  listingId: string;           // REFERENCES /listings/{listingId}
  bidderId: string;            // Firebase Auth UID - REFERENCES /users/{bidderId}
  
  // Denormalized data (for performance)
  listingTitle: string;        // For display in user's bid history
  sellerId: string;            // For seller to see all bids on their listings
  
  // Bid data
  amount: number;
  maxBid?: number;             // For proxy bidding (hidden from other bidders)
  isWinning: boolean;          // Denormalized - true if highest bid
  isOutbid: boolean;           // Updated when outbid
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt?: Timestamp;       // If bid is updated/cancelled
  
  // Retraction/Cancellation
  retracted: boolean;
  retractedAt?: Timestamp;
  retractionReason?: string;
  
  // Auto-bid settings
  autoBid?: {
    enabled: boolean;
    maxAmount: number;
    incrementAmount: number;
  };
}
```

**Subcollection Alternative (if bids are very frequent):**
```
/listings/{listingId}/bids/{bidId}
```
- Pro: Better organization, easier to query bids for a listing
- Con: Harder to query all bids by a user (requires collection group query)

**Recommended:** Use top-level collection with indexes for flexibility.

**Indexes Required:**
- `listingId` + `createdAt` (desc) - get bids for a listing
- `bidderId` + `createdAt` (desc) - get user's bid history
- `listingId` + `amount` (desc) - get highest bid
- `listingId` + `isWinning` + `createdAt` (desc)

---

### Collection: `orders`

**Structure:**
```typescript
/orders/{orderId}
{
  // Order identification
  orderNumber: string;         // Human-readable: ORD-2024-001234
  status: 'pending' | 'confirmed' | 'paid' | 'shipping' | 'completed' | 'cancelled' | 'refunded';
  
  // Parties
  buyerId: string;             // REFERENCES /users/{buyerId}
  sellerId: string;            // REFERENCES /users/{sellerId}
  listingId: string;           // REFERENCES /listings/{listingId}
  
  // Denormalized listing data (snapshot at time of purchase)
  listingSnapshot: {
    title: string;
    images: string[];
    type: string;
    category: string;
  };
  
  // Pricing
  subtotal: number;
  fees: {
    platformFee: number;
    paymentProcessingFee: number;
    shippingFee?: number;
  };
  total: number;
  currency: string;            // Default: 'USD'
  
  // Payment
  paymentMethod?: string;      // 'credit_card' | 'bank_transfer' | 'escrow'
  paymentStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  paymentId?: string;          // Reference to payment processor
  paidAt?: Timestamp;
  
  // Shipping/Delivery (for physical items)
  shipping?: {
    address: {
      name: string;
      street: string;
      city: string;
      state: string;
      zip: string;
      country: string;
    };
    method: string;
    trackingNumber?: string;
    carrier?: string;
    estimatedDelivery?: Timestamp;
    deliveredAt?: Timestamp;
  };
  
  // Timestamps
  createdAt: Timestamp;
  confirmedAt?: Timestamp;
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;
  
  // Cancellation/Refund
  cancellationReason?: string;
  refundAmount?: number;
  refundedAt?: Timestamp;
  
  // Notes
  buyerNotes?: string;
  sellerNotes?: string;
  adminNotes?: string;
}
```

**Indexes Required:**
- `buyerId` + `createdAt` (desc)
- `sellerId` + `createdAt` (desc)
- `status` + `createdAt` (desc)
- `listingId` + `status`
- `orderNumber` (unique)

---

### Collection: `transactions`

**Structure:**
```typescript
/transactions/{transactionId}
{
  orderId: string;             // REFERENCES /orders/{orderId}
  type: 'sale' | 'refund' | 'fee' | 'payout';
  
  // Parties
  fromUserId?: string;         // Who paid (for sales/fees)
  toUserId?: string;           // Who received (for sales/payouts)
  
  // Amount
  amount: number;
  currency: string;
  fees?: number;
  netAmount: number;           // amount - fees
  
  // Payment processor
  processor: 'stripe' | 'paypal' | 'square' | 'internal';
  processorTransactionId?: string;
  
  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  
  // Timestamps
  createdAt: Timestamp;
  processedAt?: Timestamp;
  completedAt?: Timestamp;
  
  // Metadata
  description?: string;
  metadata?: Record<string, any>;
}
```

---

### Collection: `watchlist` (User Favorites)

**Structure:**
```typescript
/watchlist/{watchlistId}
{
  userId: string;              // REFERENCES /users/{userId}
  listingId: string;           // REFERENCES /listings/{listingId}
  
  // Denormalized for quick display
  listingTitle: string;
  listingImage: string;
  listingPrice?: number;
  listingCurrentBid?: number;
  listingEndsAt?: Timestamp;
  listingStatus: string;
  
  createdAt: Timestamp;
  
  // Notification preferences
  notifyOnPriceDrop: boolean;
  notifyOnEnding: boolean;
  notifyOnNewBid: boolean;
}
```

**Indexes Required:**
- `userId` + `createdAt` (desc)
- `listingId` + `userId` (unique) - prevent duplicates
- `listingId` - for counting watchers

---

### Collection: `messages`

**Structure:**
```typescript
/messages/{messageId}
{
  conversationId: string;      // Group messages between two users about a listing
  
  // Parties
  fromUserId: string;          // REFERENCES /users/{fromUserId}
  toUserId: string;            // REFERENCES /users/{toUserId}
  listingId?: string;          // REFERENCES /listings/{listingId} (if about a listing)
  
  // Message content
  content: string;
  type: 'text' | 'image' | 'system';
  attachments?: string[];      // Firebase Storage URLs
  
  // Status
  read: boolean;
  readAt?: Timestamp;
  
  // Timestamps
  createdAt: Timestamp;
  
  // Moderation
  flagged: boolean;
  deleted: boolean;
}
```

**Alternative: Subcollection approach**
```
/conversations/{conversationId}/messages/{messageId}
```

**Indexes Required:**
- `conversationId` + `createdAt` (asc)
- `fromUserId` + `createdAt` (desc)
- `toUserId` + `read` + `createdAt` (desc) - unread messages
- `listingId` + `createdAt` (desc)

---

### Collection: `analytics_events`

**Structure:**
```typescript
/analytics_events/{eventId}
{
  // Event identification
  eventType: 'view' | 'click' | 'favorite' | 'share' | 'inquiry' | 'bid' | 'purchase';
  userId?: string;             // Optional - for authenticated users
  sessionId: string;           // For anonymous tracking
  
  // Context
  listingId?: string;
  pagePath?: string;
  referrer?: string;
  
  // Device/Environment
  userAgent?: string;
  ipAddress?: string;          // Hash for privacy
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  browser?: string;
  os?: string;
  
  // Timestamp
  timestamp: Timestamp;
  
  // Additional data
  metadata?: Record<string, any>;
}
```

**Note:** For high-volume analytics, consider:
- BigQuery export from Firestore
- Cloud Functions to aggregate data
- Separate analytics service (Google Analytics, Mixpanel)

---

### Collection: `reviews`

**Structure:**
```typescript
/reviews/{reviewId}
{
  orderId: string;             // REFERENCES /orders/{orderId}
  listingId: string;           // REFERENCES /listings/{listingId}
  
  // Parties
  reviewerId: string;          // User who wrote review (buyer or seller)
  revieweeId: string;          // User being reviewed (seller or buyer)
  
  // Review content
  rating: number;              // 1-5 stars
  title?: string;
  comment: string;
  
  // Categories (for seller reviews)
  categories?: {
    communication: number;     // 1-5
    itemQuality: number;
    shipping: number;
    value: number;
  };
  
  // Status
  status: 'pending' | 'published' | 'flagged' | 'hidden';
  
  // Moderation
  flagged: boolean;
  adminReviewed: boolean;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  
  // Helpful votes
  helpfulCount: number;
  reportedCount: number;
}
```

**Indexes Required:**
- `revieweeId` + `status` + `createdAt` (desc)
- `listingId` + `status` + `createdAt` (desc)
- `orderId` (unique)

---

### Collection: `reports` (Safety/Moderation)

**Structure:**
```typescript
/reports/{reportId}
{
  // What's being reported
  type: 'listing' | 'user' | 'message' | 'review';
  targetId: string;            // ID of listing/user/message/review
  
  // Reporter
  reporterId: string;          // User who reported
  
  // Reason
  category: 'fraud' | 'scam' | 'inappropriate' | 'spam' | 'wrong_category' | 'other';
  reason: string;
  details?: string;
  
  // Status
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  reviewedBy?: string;         // Admin userId
  reviewedAt?: Timestamp;
  resolution?: string;
  
  // Timestamps
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
}
```

**Indexes Required:**
- `status` + `createdAt` (desc)
- `type` + `targetId`
- `reporterId` + `createdAt` (desc)

---

## User Profile Updates

### Enhanced `/users/{userId}` Structure

```typescript
/users/{userId}
{
  // ... existing fields ...
  
  // Seller stats (updated via Cloud Functions)
  seller: {
    verified: boolean;
    rating: number;            // Average from reviews
    totalReviews: number;
    totalSales: number;
    totalListings: number;
    activeListings: number;
    completedListings: number;
    responseTime: string;      // Average response time
    memberSince: Timestamp;
    
    // Financial (for payouts)
    pendingPayout: number;
    totalEarnings: number;
    totalFees: number;
    
    // Credentials
    credentials?: {
      identityVerified: boolean;
      businessLicense?: string;
      taxId?: string;
      verifiedAt?: Timestamp;
    };
  };
  
  // Buyer stats
  buyer?: {
    totalPurchases: number;
    totalSpent: number;
    averageOrderValue: number;
  };
  
  // Analytics
  stats: {
    totalListingsViewed: number;
    totalListingsFavorited: number;
    totalBidsPlaced: number;
    totalMessagesSent: number;
  };
  
  // Safety/Moderation
  moderation: {
    warningCount: number;
    flagCount: number;
    suspended: boolean;
    suspendedUntil?: Timestamp;
    suspendedReason?: string;
    banned: boolean;
  };
}
```

---

## Implementation Priority

### Phase 1: Critical (Week 1)
1. ✅ Connect listing creation to Firestore
2. ✅ Add status field to listings
3. ✅ Change seller.id to sellerId (use Firebase UID)
4. ✅ Add audit fields (createdBy, createdAt, updatedAt)
5. ✅ Create bids collection structure
6. ✅ Implement basic bid placement

### Phase 2: Essential (Week 2)
7. ✅ Create orders collection
8. ✅ Create watchlist collection
9. ✅ Add analytics fields to listings
10. ✅ Implement view tracking
11. ✅ Create messages collection (basic)

### Phase 3: Important (Week 3-4)
12. ✅ Create reviews collection
13. ✅ Create transactions collection
14. ✅ Create reports collection
15. ✅ Add Cloud Functions for denormalization
16. ✅ Implement safety/moderation fields

### Phase 4: Enhancement (Ongoing)
17. ✅ Analytics events collection
18. ✅ Advanced search indexes
19. ✅ Performance optimization
20. ✅ Data aggregation functions

---

## Security Rules Recommendations

See `FIRESTORE_SECURITY_RULES.md` for detailed rules. Key points:

1. **Listings:** Users can create/update their own listings. All users can read active listings.
2. **Bids:** Users can create bids. Can read bids on listings they bid on or own.
3. **Orders:** Users can read orders they're buyer or seller in.
4. **Messages:** Users can read messages in conversations they're part of.
5. **Watchlist:** Users can manage their own watchlist.
6. **Reviews:** Users can create reviews for their orders. Can read published reviews.

---

## Cloud Functions Needed

1. **Denormalization Functions:**
   - Update listing.seller when user profile changes
   - Update listing.currentBid when new bid placed
   - Update listing.bidCount when bids added/removed
   - Update user.seller stats when listing status changes
   - Update listing.analytics.favorites when watchlist changes

2. **Status Management:**
   - Auto-expire auctions when endsAt reached
   - Auto-cancel expired unpaid orders
   - Update listing status when order completed

3. **Analytics Aggregation:**
   - Daily/hourly aggregation of analytics events
   - Update listing.analytics fields
   - Update user.stats fields

4. **Safety/Moderation:**
   - Auto-flag listings with multiple reports
   - Send notifications for flagged content
   - Auto-suspend users with excessive flags

---

## Next Steps

1. **Review this document** and confirm structure
2. **Update TypeScript interfaces** in `lib/types.ts`
3. **Create Firestore helper functions** for each collection
4. **Connect listing creation form** to Firestore
5. **Implement security rules**
6. **Set up Cloud Functions** (if using)
7. **Create migration script** for existing mock data
8. **Add indexes** in Firebase Console
9. **Test data flow** end-to-end

---

## Questions to Resolve

1. **Payment Processing:** Which provider? (Stripe, PayPal, Square?)
2. **Shipping Integration:** Do we need carrier integration?
3. **Image Storage:** Confirm Firebase Storage structure?
4. **Analytics Service:** Use Firestore events or separate service?
5. **Email Notifications:** SendGrid, Firebase Functions, or other?
6. **Background Jobs:** Cloud Functions, Cloud Tasks, or other?
