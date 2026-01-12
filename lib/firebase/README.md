# Firebase Setup Guide

This directory contains the Firebase configuration and utilities for the Wildlife Exchange application.

## Initial Setup

1. **Create a Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Click "Add project"
   - Enter your project name (e.g., "wildlife-exchange")
   - Follow the setup wizard

2. **Enable Firebase Services**
   - **Authentication**: Go to Authentication > Get Started
     - Enable "Email/Password" sign-in method
   - **Firestore Database**: Go to Firestore Database > Create database
     - Start in test mode (or production mode with proper rules)
     - Choose a location closest to your users
   - **Storage**: Go to Storage > Get Started
     - Start in test mode (or production mode with proper rules)

3. **Get Your Firebase Config**
   - Go to Project Settings (gear icon) > General
   - Scroll down to "Your apps" section
   - Click the web icon (`</>`) to add a web app
   - Register your app and copy the config values

4. **Set Up Environment Variables**
   - Copy `.env.example` to `.env.local` in the project root
   - Fill in your Firebase config values:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

## Usage Examples

### Authentication

```typescript
import { signUp, signIn, signOutUser, onAuthStateChange } from '@/lib/firebase';

// Sign up
const userCredential = await signUp('user@example.com', 'password123', 'John Doe');

// Sign in
const userCredential = await signIn('user@example.com', 'password123');

// Sign out
await signOutUser();

// Listen to auth state changes
onAuthStateChange((user) => {
  if (user) {
    console.log('User is signed in:', user.uid);
  } else {
    console.log('User is signed out');
  }
});
```

### Firestore

```typescript
import { getDocument, createDocument, updateDocument, queryHelpers } from '@/lib/firebase';
import type { Listing } from '@/lib/types';

// Get a listing
const listing = await getDocument<Listing>('listings', 'listing-id-123');

// Create a listing
const listingId = await createDocument<Listing>('listings', {
  title: 'Exotic Animal',
  price: 5000,
  category: 'exotic',
  // ... other fields
});

// Update a listing
await updateDocument<Listing>('listings', listingId, {
  price: 5500,
});

// Query listings
import { getDocuments } from '@/lib/firebase';
const activeListings = await getDocuments<Listing>('listings', [
  queryHelpers.where('status', '==', 'active'),
  queryHelpers.orderBy('createdAt', 'desc'),
  queryHelpers.limit(10),
]);
```

### Storage

```typescript
import { uploadListingImage, getFileURL, deleteFile } from '@/lib/firebase';

// Upload listing image with progress
const imageUrl = await uploadListingImage(
  listingId,
  file,
  0, // image index
  (progress) => {
    console.log(`Upload progress: ${progress}%`);
  }
);

// Get file URL
const url = await getFileURL('listings/123/image-0.jpg');

// Delete file
await deleteFile('listings/123/image-0.jpg');
```

## Security Rules

Make sure to set up proper Firestore and Storage security rules in the Firebase Console.

### Example Firestore Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Listings collection
    match /listings/{listingId} {
      allow read: if true; // Public read
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && 
        resource.data.sellerId == request.auth.uid;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Example Storage Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /listings/{listingId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## File Structure

```
lib/firebase/
├── config.ts       # Firebase initialization and config
├── auth.ts         # Authentication utilities
├── firestore.ts    # Firestore database utilities
├── storage.ts      # Storage utilities
├── index.ts        # Centralized exports
└── README.md       # This file
```
