# Comprehensive Firebase Authentication & Firestore Setup Review
## Wildlife Exchange Marketplace Application

**Date:** Current  
**Framework:** Next.js 14 (App Router)  
**Database:** Firebase Firestore  
**Authentication:** Firebase Auth  
**Storage:** Firebase Storage  

---

## Table of Contents
1. [Current Authentication Setup](#current-authentication-setup)
2. [Data Structures & Type Definitions](#data-structures--type-definitions)
3. [Firestore Collections Required](#firestore-collections-required)
4. [User Profile & Seller Information](#user-profile--seller-information)
5. [Implementation Gaps & Recommendations](#implementation-gaps--recommendations)
6. [Security Rules Requirements](#security-rules-requirements)
7. [Migration Strategy](#migration-strategy)

---

## 1. Current Authentication Setup

### 1.1 Firebase Configuration
- **Location:** `project/lib/firebase/config.ts`
- **Status:** ✅ Configured with project credentials
- **Services Initialized:**
  - Firebase App
  - Authentication
  - Firestore Database
  - Storage
  - Analytics (client-side only)

### 1.2 Authentication Functions
**Location:** `project/lib/firebase/auth.ts`

**Available Functions:**
```typescript
✅ signUp(email, password, displayName?) - Creates user, sends email verification
✅ signIn(email, password) - Signs in user
✅ signOutUser() - Signs out current user
✅ resetPassword(email) - Sends password reset email
✅ updateUserPassword(newPassword) - Updates user password
✅ updateUserProfile({displayName?, photoURL?}) - Updates profile
✅ getCurrentUser() - Gets current authenticated user
✅ onAuthStateChange(callback) - Listens to auth state changes
```

### 1.3 Current UI Implementation Status

#### Registration Page
- **Location:** `project/app/register/page.tsx`
- **Status:** ⚠️ UI Complete, **NOT Connected to Firebase**
- **Current Behavior:** Form validation only, no actual registration
- **Data Collected:**
  - Full Name
  - Email
  - Phone
  - Password + Confirm Password
  - Business Name (optional)
  - Location (City, State, ZIP)
  - Terms Agreement
  - Newsletter Subscription

#### Sign In Page
- **Status:** ❌ **Not Implemented** - Only link in navbar (`/dashboard/account`)
- **Current:** Account page exists but no dedicated sign-in flow

#### User Menu in Navbar
- **Location:** `project/components/navigation/Navbar.tsx`
- **Status:** ⚠️ Links exist but **no authentication state checks**
- **Links:**
  - Sign Up → `/register`
  - Sign In → `/dashboard/account`
  - Dashboard → `/dashboard`
  - Seller Portal → `/seller/overview`
  - My Orders → `/dashboard/orders`

### 1.4 Authentication State Management
- **Status:** ❌ **Not Implemented**
- **Missing:**
  - No Auth Context Provider
  - No hooks for checking auth state
  - No protected route middleware
  - No redirects for authenticated/unauthenticated users

---

## 2. Data Structures & Type Definitions

### 2.1 Core Types
**Location:** `project/lib/types.ts`

#### Listing Type
```typescript
interface Listing {
  id: string;
  title: string;
  description: string;
  type: 'auction' | 'fixed' | 'classified';
  category: 'cattle' | 'horses' | 'wildlife' | 'equipment' | 'land' | 'other';
  price?: number; // For fixed price
  currentBid?: number; // For auctions
  reservePrice?: number; // For auctions
  startingBid?: number; // For auctions
  images: string[]; // Array of image URLs (Firebase Storage URLs)
  location: {
    city: string;
    state: string;
    zip?: string;
  };
  endsAt?: Date; // For auctions
  createdAt: Date;
  updatedAt?: Date; // MISSING - should be added
  status?: 'draft' | 'active' | 'ending_soon' | 'sold' | 'archived'; // MISSING
  featured?: boolean;
  featuredUntil?: Date;
  seller: {
    id: string; // Will reference userId in Firestore
    name: string;
    rating: number;
    responseTime: string; // e.g., "2 hours"
    verified: boolean;
  };
  trust: {
    verified: boolean; // Listing verification
    insuranceAvailable: boolean;
    transportReady: boolean;
  };
  metadata?: {
    quantity?: number;
    breed?: string;
    age?: string;
    healthStatus?: string;
    papers?: boolean;
  };
}
```

#### Bid Type
```typescript
interface Bid {
  id: string;
  listingId: string; // References listing document
  amount: number;
  bidderName: string; // Should be bidderId + lookup user data
  bidderId?: string; // MISSING - should reference userId
  timestamp: Date;
  isAutoBid?: boolean; // MISSING - for auto-bidding
  maxBid?: number; // MISSING - for auto-bidding
}
```

### 2.2 Missing Type Definitions

The following types are used in mock data but **NOT defined in types.ts**:

```typescript
// MISSING: User Profile Type
interface User {
  id: string; // Firebase Auth UID
  email: string;
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Extended Profile Data (stored in Firestore)
  profile?: {
    fullName: string;
    businessName?: string;
    bio?: string;
    location: {
      city: string;
      state: string;
      zip: string;
      address?: string;
    };
    preferences: {
      verification: boolean;
      insurance: boolean;
      transport: boolean;
    };
    notifications: {
      email: boolean;
      sms: boolean;
      bids: boolean;
      messages: boolean;
      promotions: boolean;
    };
  };
  
  // Seller-Specific Data
  seller?: {
    verified: boolean;
    rating: number;
    totalSales: number;
    totalListings: number;
    responseTime: string;
    memberSince: Date;
    credentials?: {
      identityVerified: boolean;
      businessLicense?: string;
      taxId?: string;
    };
  };
}

// MISSING: Order/Purchase Type
interface Order {
  id: string;
  userId: string; // Buyer's Firebase Auth UID
  listingId: string;
  listingTitle: string;
  sellerId: string;
  type: 'auction' | 'fixed' | 'classified';
  amount: number; // Final purchase price
  fees: {
    platform: number; // 3% platform fee
    verification?: number; // $100 if selected
    insurance?: number; // Insurance tier price
    total: number;
  };
  status: 'pending_payment' | 'pending_verification' | 'in_transit' | 'completed' | 'cancelled';
  paymentStatus: 'pending' | 'completed' | 'refunded';
  insuranceStatus: 'available' | 'active' | 'not_selected';
  deliveryStatus: 'details_requested' | 'arranged_off_platform' | 'complete' | 'not_requested';
  createdAt: Date;
  completedAt?: Date;
  invoiceUrl?: string; // Link to generated invoice
}

// MISSING: Conversation/Message Type (exists in seller-mock-data.ts but not in types.ts)
interface Conversation {
  id: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  participants: {
    [userId: string]: {
      name: string;
      avatar?: string;
      lastRead?: Date;
    };
  };
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string; // Firebase Auth UID
  content: string;
  timestamp: Date;
  read: boolean;
}

// MISSING: Payout Type (for sellers)
interface Payout {
  id: string;
  sellerId: string;
  saleId: string;
  amount: number;
  fees: {
    transaction: number;
    subscription: number;
    services: number;
    total: number;
  };
  netAmount: number;
  status: 'available' | 'pending' | 'completed' | 'failed';
  scheduledDate?: Date;
  completedDate?: Date;
  paymentMethod?: string;
}

// MISSING: Watchlist/Favorites
interface Watchlist {
  userId: string;
  listingId: string;
  addedAt: Date;
}
```

---

## 3. Firestore Collections Required

### 3.1 Core Collections

#### `users` Collection
**Document ID:** Firebase Auth UID  
**Purpose:** Extended user profile data (separate from Firebase Auth)

```typescript
{
  userId: string; // Same as document ID (Firebase Auth UID)
  email: string; // Duplicated for queries
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  
  // Profile Information
  profile: {
    fullName: string;
    businessName?: string;
    bio?: string;
    location: {
      city: string;
      state: string;
      zip: string;
      address?: string;
    };
    preferences: {
      verification: boolean;
      insurance: boolean;
      transport: boolean;
    };
    notifications: {
      email: boolean;
      sms: boolean;
      bids: boolean;
      messages: boolean;
      promotions: boolean;
    };
  };
  
  // Seller Information (only if user is a seller)
  seller?: {
    verified: boolean;
    rating: number; // Calculated from reviews
    totalSales: number;
    totalListings: number;
    responseTime: string; // Average response time
    memberSince: Timestamp;
    credentials: {
      identityVerified: boolean;
      businessLicense?: string;
      taxId?: string;
    };
  };
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
}
```

#### `listings` Collection
**Document ID:** Auto-generated  
**Purpose:** All marketplace listings

```typescript
{
  id: string; // Document ID
  sellerId: string; // Reference to users collection
  title: string;
  description: string;
  type: 'auction' | 'fixed' | 'classified';
  category: 'cattle' | 'horses' | 'wildlife' | 'equipment' | 'land' | 'other';
  
  // Pricing
  price?: number; // For fixed price
  currentBid?: number; // For auctions
  reservePrice?: number; // For auctions
  startingBid?: number; // For auctions
  
  // Media
  images: string[]; // Firebase Storage URLs
  primaryImage?: string; // First image for thumbnails
  
  // Location
  location: {
    city: string;
    state: string;
    zip?: string;
    geoPoint?: GeoPoint; // For location-based queries
  };
  
  // Status & Visibility
  status: 'draft' | 'active' | 'ending_soon' | 'sold' | 'archived';
  featured: boolean;
  featuredUntil?: Timestamp;
  
  // Auction-specific
  endsAt?: Timestamp; // For auctions
  bidCount: number; // Number of bids (denormalized)
  
  // Trust & Verification
  trust: {
    verified: boolean;
    insuranceAvailable: boolean;
    transportReady: boolean;
  };
  
  // Metadata
  metadata?: {
    quantity?: number;
    breed?: string;
    age?: string;
    healthStatus?: string;
    papers?: boolean;
  };
  
  // Activity Metrics (denormalized for performance)
  metrics: {
    views: number;
    favorites: number;
    watchers: number;
    inquiries: number;
  };
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### `bids` Collection
**Document ID:** Auto-generated  
**Purpose:** All bids placed on auction listings

```typescript
{
  id: string; // Document ID
  listingId: string; // Reference to listings collection
  bidderId: string; // Reference to users collection (Firebase Auth UID)
  amount: number;
  isAutoBid: boolean;
  maxBid?: number; // For auto-bidding
  isWinningBid: boolean; // Current highest bid
  timestamp: Timestamp;
  
  // Denormalized data for display
  bidderName: string; // From users collection
  listingTitle: string; // From listings collection
}
```

**Subcollections/Queries:**
- Query by `listingId` to get all bids for a listing
- Query by `bidderId` to get all bids by a user
- Query by `isWinningBid == true` to find current highest bid

#### `orders` Collection
**Document ID:** Auto-generated  
**Purpose:** All completed purchases/orders

```typescript
{
  id: string; // Document ID
  userId: string; // Buyer's Firebase Auth UID
  listingId: string; // Reference to listings collection
  sellerId: string; // Reference to users collection
  
  // Order Details
  listingTitle: string; // Denormalized
  type: 'auction' | 'fixed' | 'classified';
  amount: number; // Final purchase price
  fees: {
    platform: number;
    verification?: number;
    insurance?: number;
    total: number;
  };
  
  // Status Tracking
  status: 'pending_payment' | 'pending_verification' | 'in_transit' | 'completed' | 'cancelled';
  paymentStatus: 'pending' | 'completed' | 'refunded';
  insuranceStatus: 'available' | 'active' | 'not_selected';
  deliveryStatus: 'details_requested' | 'arranged_off_platform' | 'complete' | 'not_requested';
  
  // Additional Info
  invoiceUrl?: string; // Firebase Storage URL
  paymentMethod?: string;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}
```

#### `watchlist` Collection
**Document ID:** Auto-generated  
**Purpose:** User's saved listings (favorites/watchlist)

```typescript
{
  id: string; // Document ID
  userId: string; // Firebase Auth UID
  listingId: string; // Reference to listings collection
  addedAt: Timestamp;
}
```

**Note:** Use composite index: `userId` + `addedAt` (descending)

#### `conversations` Collection
**Document ID:** Auto-generated  
**Purpose:** Messages between buyers and sellers

```typescript
{
  id: string; // Document ID
  listingId: string; // Reference to listings collection
  sellerId: string; // Reference to users collection
  buyerId: string; // Reference to users collection
  
  // Denormalized for display
  listingTitle: string;
  sellerName: string;
  buyerName: string;
  
  // Last message info (for conversation list)
  lastMessage: string;
  lastMessageTime: Timestamp;
  lastMessageSenderId: string;
  
  // Read status
  unreadCount: {
    [userId: string]: number; // Unread count per participant
  };
  lastRead: {
    [userId: string]: Timestamp; // Last read timestamp per participant
  };
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Subcollection:** `messages`
```typescript
// Path: conversations/{conversationId}/messages/{messageId}
{
  id: string; // Document ID
  senderId: string; // Firebase Auth UID
  content: string;
  timestamp: Timestamp;
  read: boolean;
  readAt?: Timestamp;
}
```

#### `payouts` Collection
**Document ID:** Auto-generated  
**Purpose:** Seller payouts from completed sales

```typescript
{
  id: string; // Document ID
  sellerId: string; // Reference to users collection
  orderId: string; // Reference to orders collection
  
  // Financial Details
  grossAmount: number; // Sale price
  fees: {
    transaction: number; // 3% platform fee
    subscription: number; // Monthly subscription fee (if applicable)
    services: number; // Verification, insurance, etc.
    total: number;
  };
  netAmount: number; // Amount paid to seller
  
  // Status
  status: 'available' | 'pending' | 'completed' | 'failed';
  
  // Payment Info
  paymentMethod?: string;
  scheduledDate?: Timestamp;
  completedDate?: Timestamp;
  transactionId?: string;
  
  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 3.2 Additional Collections to Consider

#### `reviews` Collection
**Purpose:** User reviews/ratings of sellers

```typescript
{
  id: string;
  sellerId: string;
  buyerId: string;
  orderId: string; // Reference to completed order
  rating: number; // 1-5
  comment?: string;
  createdAt: Timestamp;
}
```

#### `notifications` Collection
**Purpose:** User notifications (optional - can also use Firebase Cloud Messaging)

```typescript
{
  id: string;
  userId: string;
  type: 'bid' | 'message' | 'order' | 'system';
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: Timestamp;
}
```

#### `subscriptions` Collection
**Purpose:** Seller subscription tiers (Pro, Ranch/Broker)

```typescript
{
  id: string;
  userId: string;
  tier: 'starter' | 'pro' | 'ranch';
  status: 'active' | 'cancelled' | 'expired';
  startDate: Timestamp;
  endDate?: Timestamp;
  price: number;
  stripeSubscriptionId?: string; // If using Stripe
}
```

---

## 4. User Profile & Seller Information

### 4.1 Current Implementation Status

#### Account Page (`/dashboard/account`)
- **Location:** `project/app/dashboard/account/page.tsx`
- **Status:** ⚠️ UI Complete, **NOT Connected to Firestore**
- **Current Data Structure:**
```typescript
{
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  bio: string;
  location: {
    city: string;
    state: string;
    zip: string;
    address: string;
  };
  notifications: {
    email: boolean;
    sms: boolean;
    bids: boolean;
    messages: boolean;
    promotions: boolean;
  };
  preferences: {
    verification: boolean;
    insurance: boolean;
    transport: boolean;
  };
}
```

**Stats Displayed (Currently Mock):**
- Total Listings: 12
- Active Sales: 5
- Total Revenue: $45,000
- Response Rate: 92%

### 4.2 Seller Profile Data
**Location:** Used in `seller-mock-data.ts` and listing detail pages

**Seller Information Displayed:**
```typescript
{
  id: string;
  name: string;
  rating: number; // 0-5
  responseTime: string; // e.g., "1 hour", "2 hours"
  verified: boolean;
  memberSince: Date;
  totalListings: number;
  totalSales: number;
  location: string; // e.g., "Menard, TX"
  credentials?: {
    identityVerified: boolean;
  };
}
```

### 4.3 Data Flow Requirements

**On User Registration:**
1. Create Firebase Auth user
2. Create `users` document in Firestore with:
   - Basic profile info from registration form
   - Default preferences
   - Default notification settings
   - `createdAt` timestamp

**On Profile Update:**
1. Update Firebase Auth profile (displayName, photoURL)
2. Update `users/{userId}` document in Firestore

**On First Listing Creation:**
1. Set `seller` object in `users/{userId}` document
2. Initialize seller stats (rating: 0, totalSales: 0, etc.)

**On Listing View:**
1. Fetch seller data from `users/{sellerId}` document
2. Display seller profile with rating, response time, etc.

---

## 5. Implementation Gaps & Recommendations

### 5.1 Critical Missing Components

#### ❌ Authentication Context Provider
**Needed:** Create `contexts/AuthContext.tsx`
- Provides authentication state to entire app
- Manages user session
- Handles auth state changes
- Provides loading states

#### ❌ Protected Route Middleware
**Needed:** Create middleware or HOC for protected routes
- `/dashboard/*` - Requires authentication
- `/seller/*` - Requires authentication + seller status
- `/dashboard/listings/new` - Requires authentication

#### ❌ Sign In Page
**Needed:** Create `app/login/page.tsx` or integrate into `/register`
- Email/password sign-in form
- "Forgot Password" link
- Redirect to dashboard after sign-in
- Show error messages

#### ❌ User Data Hooks
**Needed:** Create custom hooks
- `useAuth()` - Get current user, auth state
- `useUserProfile()` - Get user profile from Firestore
- `useSellerProfile()` - Get seller-specific data

### 5.2 Data Integration Tasks

#### High Priority
1. **Connect Registration Form to Firebase Auth**
   - Use `signUp()` function from `lib/firebase/auth.ts`
   - Create Firestore user document after successful registration
   - Handle errors (email already exists, weak password, etc.)

2. **Create Sign In Flow**
   - Build sign-in page/form
   - Use `signIn()` function
   - Redirect based on user role (buyer/seller)

3. **Protect Dashboard Routes**
   - Check authentication state
   - Redirect to login if not authenticated
   - Show loading state during auth check

4. **Migrate Mock Listings to Firestore**
   - Create `listings` collection structure
   - Migrate current mock listings
   - Update listing fetch logic to use Firestore

5. **Implement User Profile CRUD**
   - Load user profile from Firestore on account page
   - Update profile function
   - Handle profile image upload to Storage

#### Medium Priority
1. **Bid System Integration**
   - Store bids in Firestore `bids` collection
   - Real-time bid updates using Firestore listeners
   - Bid validation (minimum bid amount, auction status)

2. **Orders/Purchases System**
   - Create order documents on purchase
   - Track order status
   - Generate invoices

3. **Watchlist/Favorites**
   - Save/remove favorites in Firestore
   - Sync with local storage hook (`use-favorites.ts`)

4. **Messaging System**
   - Create conversations collection
   - Real-time message updates
   - Unread count tracking

### 5.3 Type System Improvements

1. **Add Missing Types to `types.ts`:**
   - `User` interface
   - `Order` interface
   - `Conversation` and `Message` interfaces
   - `Payout` interface
   - `Watchlist` interface

2. **Update Existing Types:**
   - Add `status` field to `Listing`
   - Add `bidderId` to `Bid`
   - Add `updatedAt` to `Listing`

3. **Create Firestore-Specific Types:**
   - Types with `Timestamp` instead of `Date`
   - Conversion utilities (Timestamp ↔ Date)

### 5.4 Security Considerations

#### Firestore Security Rules (Required)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Listings collection
    match /listings/{listingId} {
      allow read: if true; // Public read
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && 
        request.resource.data.sellerId == request.auth.uid;
    }
    
    // Bids collection
    match /bids/{bidId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && 
        request.resource.data.bidderId == request.auth.uid;
      allow update, delete: if false; // Bids are immutable after creation
    }
    
    // Orders collection
    match /orders/{orderId} {
      allow read: if request.auth != null && 
        (resource.data.userId == request.auth.uid || 
         resource.data.sellerId == request.auth.uid);
      allow create: if request.auth != null;
      allow update: if request.auth != null && 
        (resource.data.userId == request.auth.uid || 
         resource.data.sellerId == request.auth.uid);
    }
    
    // Watchlist collection
    match /watchlist/{watchlistId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
    }
    
    // Conversations collection
    match /conversations/{conversationId} {
      allow read: if request.auth != null && 
        (resource.data.buyerId == request.auth.uid || 
         resource.data.sellerId == request.auth.uid);
      allow create: if request.auth != null;
      
      match /messages/{messageId} {
        allow read: if request.auth != null && 
          (get(/databases/$(database)/documents/conversations/$(conversationId)).data.buyerId == request.auth.uid ||
           get(/databases/$(database)/documents/conversations/$(conversationId)).data.sellerId == request.auth.uid);
        allow create: if request.auth != null;
        allow update: if request.auth != null && 
          resource.data.senderId == request.auth.uid;
      }
    }
    
    // Payouts collection
    match /payouts/{payoutId} {
      allow read: if request.auth != null && 
        resource.data.sellerId == request.auth.uid;
      allow create: if false; // Only server-side
      allow update: if false; // Only server-side
    }
  }
}
```

#### Storage Security Rules (Required)
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // User profile images
    match /users/{userId}/profile/{fileName} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Listing images
    match /listings/{listingId}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // Invoices (private)
    match /invoices/{invoiceId}/{fileName} {
      allow read: if request.auth != null;
      allow write: if false; // Only server-side
    }
  }
}
```

---

## 6. Migration Strategy

### Phase 1: Authentication Foundation (Week 1)
1. ✅ Firebase configuration (DONE)
2. Create AuthContext and Provider
3. Build Sign In page
4. Connect Registration form to Firebase
5. Implement protected routes
6. Add user menu with auth state

### Phase 2: User Profiles (Week 2)
1. Create `users` collection structure
2. Migrate registration to create Firestore user doc
3. Build user profile CRUD operations
4. Connect account page to Firestore
5. Implement profile image upload

### Phase 3: Listings Migration (Week 3)
1. Create `listings` collection structure
2. Migrate mock listings to Firestore
3. Update listing queries to use Firestore
4. Implement real-time listing updates
5. Add listing creation form submission

### Phase 4: Bidding System (Week 4)
1. Create `bids` collection
2. Implement bid placement with Firestore
3. Real-time bid updates on listing pages
4. Bid history display
5. Auto-bid functionality (if needed)

### Phase 5: Orders & Transactions (Week 5)
1. Create `orders` collection
2. Implement purchase flow
3. Order status tracking
4. Invoice generation
5. Seller payout calculations

### Phase 6: Additional Features (Week 6+)
1. Watchlist/Favorites
2. Messaging system
3. Notifications
4. Reviews/Ratings
5. Subscription management

---

## 7. Key Files to Modify/Create

### Files to Create
- `contexts/AuthContext.tsx` - Authentication state management
- `hooks/use-auth.ts` - Auth hook
- `hooks/use-user-profile.ts` - User profile hook
- `app/login/page.tsx` - Sign in page
- `middleware.ts` - Route protection (Next.js middleware)
- `lib/firebase/users.ts` - User CRUD operations
- `lib/firebase/listings.ts` - Listing CRUD operations
- `lib/firebase/bids.ts` - Bid operations
- `lib/types/firestore.ts` - Firestore-specific types

### Files to Modify
- `app/register/page.tsx` - Connect to Firebase Auth
- `app/dashboard/account/page.tsx` - Load/save from Firestore
- `app/dashboard/listings/new/page.tsx` - Save to Firestore
- `app/listing/[id]/page.tsx` - Load from Firestore, real-time updates
- `components/navigation/Navbar.tsx` - Add auth state checks
- `lib/types.ts` - Add missing types
- `lib/mock-data.ts` - Deprecate in favor of Firestore

---

## 8. Testing Checklist

### Authentication
- [ ] User can register with email/password
- [ ] Email verification is sent
- [ ] User can sign in
- [ ] User can sign out
- [ ] Protected routes redirect when not authenticated
- [ ] Auth state persists across page reloads

### User Profiles
- [ ] User document created on registration
- [ ] Profile data loads on account page
- [ ] Profile updates save to Firestore
- [ ] Profile image uploads to Storage

### Listings
- [ ] Listings load from Firestore
- [ ] Listing creation saves to Firestore
- [ ] Listing updates work correctly
- [ ] Real-time updates on listing pages

### Bids
- [ ] Bids can be placed (authenticated users only)
- [ ] Bid validation works (minimum amount)
- [ ] Real-time bid updates on listing page
- [ ] Bid history displays correctly

### Orders
- [ ] Orders created on purchase
- [ ] Order status updates correctly
- [ ] Both buyer and seller can view order

---

## Summary

**Current Status:**
- ✅ Firebase configured and initialized
- ✅ Authentication functions created
- ✅ Firestore helper functions created
- ⚠️ UI components exist but not connected
- ❌ No authentication state management
- ❌ No protected routes
- ❌ No data persistence

**Immediate Next Steps:**
1. Create AuthContext and integrate into app
2. Build sign-in page
3. Connect registration form to Firebase
4. Implement protected routes
5. Create user profile Firestore structure

**Estimated Development Time:**
- Minimum Viable Product (MVP): 4-6 weeks
- Full feature set: 8-12 weeks

---

**End of Review**
