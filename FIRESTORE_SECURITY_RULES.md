# Firestore Security Rules
## Wildlife Exchange Marketplace

**Date:** Current  
**Status:** Implementation Guide  
**Priority:** CRITICAL - Must be deployed before production

---

## Overview

This document provides the Firestore security rules required for the Wildlife Exchange marketplace application. These rules ensure that:

1. Users can only read/write their own user documents
2. Listings can be read by all authenticated users (active listings) or by the seller (draft/other statuses)
3. Only authenticated users can create listings
4. Only listing owners can update/delete their listings

---

## Required Rules

Copy these rules into your Firebase Console → Firestore Database → Rules tab:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to check if user owns a document
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    // ============================================
    // USERS COLLECTION
    // ============================================
    match /users/{userId} {
      // Allow read: if authenticated (any user can read any user profile)
      allow read: if isAuthenticated();
      
      // Allow create: if authenticated and creating own document
      allow create: if isAuthenticated() && request.auth.uid == userId;
      
      // Allow update: if authenticated and updating own document
      allow update: if isAuthenticated() && request.auth.uid == userId;
      
      // Allow delete: if authenticated and deleting own document (or admin - implement admin check if needed)
      allow delete: if isAuthenticated() && request.auth.uid == userId;
    }
    
    // ============================================
    // LISTINGS COLLECTION
    // ============================================
    match /listings/{listingId} {
      // Allow read:
      //   - If listing status is 'active' (anyone authenticated can see active listings)
      //   - OR if user is the seller (seller can see their own listings regardless of status)
      allow read: if isAuthenticated() && (
        resource.data.status == 'active' ||
        resource.data.sellerId == request.auth.uid
      );
      
      // Allow create: if authenticated and sellerId matches the authenticated user
      allow create: if isAuthenticated() && 
        request.resource.data.sellerId == request.auth.uid &&
        request.resource.data.createdBy == request.auth.uid &&
        request.resource.data.status == 'draft';
      
      // Allow update: if authenticated and user is the seller
      allow update: if isAuthenticated() && 
        resource.data.sellerId == request.auth.uid &&
        request.resource.data.sellerId == resource.data.sellerId; // Prevent changing sellerId
      
      // Allow delete: if authenticated and user is the seller
      allow delete: if isAuthenticated() && resource.data.sellerId == request.auth.uid;
    }
    
    // ============================================
    // FUTURE COLLECTIONS (Not implemented yet)
    // ============================================
    
    // BIDS COLLECTION (Future)
    // match /bids/{bidId} {
    //   allow read: if isAuthenticated() && (
    //     resource.data.bidderId == request.auth.uid ||
    //     resource.data.listingId in get(/databases/$(database)/documents/listings/$(resource.data.listingId)).data.sellerId == request.auth.uid
    //   );
    //   allow create: if isAuthenticated() && request.resource.data.bidderId == request.auth.uid;
    //   allow update: if false; // Bids should not be updated
    //   allow delete: if false; // Bids should not be deleted (use retraction flag instead)
    // }
    
    // ORDERS COLLECTION (Future)
    // match /orders/{orderId} {
    //   allow read: if isAuthenticated() && (
    //     resource.data.buyerId == request.auth.uid ||
    //     resource.data.sellerId == request.auth.uid
    //   );
    //   allow create: if isAuthenticated();
    //   allow update: if isAuthenticated() && (
    //     resource.data.buyerId == request.auth.uid ||
    //     resource.data.sellerId == request.auth.uid
    //   );
    // }
    
    // WATCHLIST COLLECTION (Future)
    // match /watchlist/{watchlistId} {
    //   allow read: if isAuthenticated() && resource.data.userId == request.auth.uid;
    //   allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
    //   allow update: if isAuthenticated() && resource.data.userId == request.auth.uid;
    //   allow delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
    // }
    
    // MESSAGES COLLECTION (Future)
    // match /messages/{messageId} {
    //   allow read: if isAuthenticated() && (
    //     resource.data.fromUserId == request.auth.uid ||
    //     resource.data.toUserId == request.auth.uid
    //   );
    //   allow create: if isAuthenticated() && request.resource.data.fromUserId == request.auth.uid;
    //   allow update: if isAuthenticated() && (
    //     resource.data.fromUserId == request.auth.uid ||
    //     resource.data.toUserId == request.auth.uid
    //   );
    // }
    
    // Deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## Deployment Instructions

1. **Go to Firebase Console**: https://console.firebase.google.com
2. **Select your project**: `wildlife-exchange`
3. **Navigate to**: Firestore Database → Rules tab
4. **Copy and paste** the rules above (uncomment future collections when ready)
5. **Click "Publish"**
6. **Test the rules** using the Rules Playground in Firebase Console

---

## Testing the Rules

Use the Firebase Console Rules Playground to test:

### Test Cases:

1. **User reads own user document**: ✅ Should allow
2. **User reads another user's document**: ✅ Should allow (for profile display)
3. **User creates own user document**: ✅ Should allow
4. **User updates own user document**: ✅ Should allow
5. **User tries to update another user's document**: ❌ Should deny
6. **Authenticated user reads active listing**: ✅ Should allow
7. **Authenticated user reads draft listing (not owner)**: ❌ Should deny
8. **Seller reads own draft listing**: ✅ Should allow
9. **Authenticated user creates listing with own sellerId**: ✅ Should allow
10. **User creates listing with different sellerId**: ❌ Should deny
11. **Seller updates own listing**: ✅ Should allow
12. **User tries to update listing they don't own**: ❌ Should deny

---

## Important Notes

1. **All rules require authentication** - Anonymous access is not allowed
2. **ServerTimestamp() is not validated in rules** - Firebase handles this automatically
3. **Indexes are required** - See `FIRESTORE_INDEXES.md` for required composite indexes
4. **Security rules are not a substitute for client-side validation** - Always validate on the client for UX, but rely on rules for security

---

## Future Enhancements

When implementing additional collections, uncomment and customize the rules for:
- `bids` - Bid placement and viewing
- `orders` - Order management
- `watchlist` - User favorites
- `messages` - User messaging
- `reviews` - Review/rating system
- `reports` - Content moderation
