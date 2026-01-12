/**
 * Script to seed mock listings into Firestore
 * 
 * This script migrates the mock listings from lib/mock-data.ts to Firestore,
 * linking them to the user with email usalandspecialist@gmail.com
 * 
 * Run with: npx tsx scripts/seed-listings.ts
 * 
 * Prerequisites:
 * - User must exist in Firebase Auth with email: usalandspecialist@gmail.com
 * - User document must exist in Firestore users collection
 * - You must be authenticated or use Firebase Admin SDK
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, setDoc, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { mockListings } from '../lib/mock-data';
import { CreateListingInput } from '../lib/firebase/listings';
import { ListingDoc } from '../lib/types/firestore';
import { ListingStatus } from '../lib/types';

// Firebase config - MUST use environment variables (no hardcoded secrets!)
// Load from .env.local or environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate required environment variables
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('❌ Error: Missing required Firebase configuration!');
  console.error('\nPlease set the following environment variables:');
  console.error('  - NEXT_PUBLIC_FIREBASE_API_KEY');
  console.error('  - NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  console.error('  - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  console.error('\nCreate a .env.local file or export these variables before running this script.');
  process.exit(1);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Get user UID and profile from email or username by checking the users collection
 */
async function getUserByIdentifier(identifier: string): Promise<{ uid: string; displayName: string; verified: boolean } | null> {
  try {
    const usersRef = collection(db, 'users');
    
    // Try to find by email first
    let email = identifier;
    if (!identifier.includes('@')) {
      email = `${identifier}@gmail.com`;
    }
    
    console.log(`Attempting to find user with email: ${email}`);
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const uid = userDoc.id; // Document ID should be the UID
      
      // Extract displayName and verified status
      const displayName = userData.profile?.fullName || userData.displayName || userData.email?.split('@')[0] || 'Unknown Seller';
      const verified = userData.seller?.verified || false;
      
      return { uid, displayName, verified };
    }
    
    // If not found by email, try to find by document ID (if identifier is a UID)
    console.log(`User not found by email, trying document ID: ${identifier}`);
    try {
      const userDocRef = doc(usersRef, identifier);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const uid = userDocSnap.id;
        const displayName = userData.profile?.fullName || userData.displayName || userData.email?.split('@')[0] || 'Unknown Seller';
        const verified = userData.seller?.verified || false;
        return { uid, displayName, verified };
      }
    } catch (e) {
      // Ignore errors from document ID lookup
    }
    
    console.warn(`User with identifier ${identifier} (email: ${email}) not found in Firestore users collection`);
    return null;
  } catch (error) {
    console.error('Error finding user:', error);
    return null;
  }
}

/**
 * Convert mock Listing to CreateListingInput format
 */
function mockListingToCreateInput(listing: typeof mockListings[0]): CreateListingInput {
  const input: CreateListingInput = {
    title: listing.title,
    description: listing.description,
    type: listing.type,
    category: listing.category,
    images: listing.images,
    location: listing.location,
    trust: listing.trust,
    metadata: listing.metadata,
  };

  // Add pricing based on type
  if (listing.type === 'fixed' && listing.price !== undefined) {
    input.price = listing.price;
  } else if (listing.type === 'auction') {
    if (listing.startingBid !== undefined) input.startingBid = listing.startingBid;
    if (listing.reservePrice !== undefined) input.reservePrice = listing.reservePrice;
    if (listing.endsAt) input.endsAt = listing.endsAt;
  }

  // Add featured fields
  if (listing.featured) input.featured = listing.featured;
  if (listing.featuredUntil) input.featuredUntil = listing.featuredUntil;

  return input;
}

/**
 * Create listing document directly in Firestore (bypasses security rules - use Admin SDK in production)
 */
async function createListingDirectly(
  uid: string,
  sellerSnapshot: { displayName: string; verified: boolean },
  listingInput: CreateListingInput,
  listingId?: string
): Promise<string> {
  const listingsRef = collection(db, 'listings');
  
  // Build the document data
  const docData: Omit<ListingDoc, 'id'> = {
    title: listingInput.title.trim(),
    description: listingInput.description.trim(),
    type: listingInput.type,
    category: listingInput.category,
    images: listingInput.images || [],
    location: listingInput.location,
    sellerId: uid,
    sellerSnapshot,
    trust: listingInput.trust,
    metadata: listingInput.metadata || {},
    metrics: {
      views: 0,
      favorites: 0,
      bidCount: 0,
    },
    status: 'active' as ListingStatus, // Create as active (published)
    createdBy: uid,
    updatedBy: uid,
    createdAt: serverTimestamp() as unknown as Timestamp,
    updatedAt: serverTimestamp() as unknown as Timestamp,
    publishedAt: serverTimestamp() as unknown as Timestamp,
  };

  // Add pricing fields
  if (listingInput.price !== undefined) {
    docData.price = listingInput.price;
  }
  if (listingInput.startingBid !== undefined) {
    docData.startingBid = listingInput.startingBid;
  }
  if (listingInput.reservePrice !== undefined) {
    docData.reservePrice = listingInput.reservePrice;
  }
  if (listingInput.endsAt) {
    docData.endsAt = Timestamp.fromDate(listingInput.endsAt);
  }
  if (listingInput.featured) {
    docData.featured = listingInput.featured;
  }
  if (listingInput.featuredUntil) {
    docData.featuredUntil = Timestamp.fromDate(listingInput.featuredUntil);
  }

  // Create the document
  if (listingId) {
    // Use specified ID
    const docRef = doc(listingsRef, listingId);
    await setDoc(docRef, docData);
    return listingId;
  } else {
    // Generate new ID - use setDoc with a generated ID
    const docRef = doc(listingsRef);
    await setDoc(docRef, docData);
    return docRef.id;
  }
}

/**
 * Seed listings into Firestore
 */
async function seedListings() {
  try {
    console.log('Starting to seed listings...\n');

    // Get the user identifier from the first mock listing or use default
    const userIdentifier = mockListings[0]?.seller?.id || 'usalandspecialist';
    console.log(`Looking up user: ${userIdentifier}`);

    // Find user UID and profile
    const userInfo = await getUserByIdentifier(userIdentifier);
    if (!userInfo) {
      console.error(`\n❌ Error: User "${userIdentifier}" not found in Firestore.`);
      console.error('\nPlease make sure:');
      console.error('  1. The user exists in Firebase Auth');
      console.error('  2. A user document exists in Firestore users collection');
      console.error('  3. The user document has an "email" field matching the user');
      console.error('  4. The user document ID matches the Firebase Auth UID');
      console.error('\n💡 Tip: If the user email is different, update the mock data or pass the email as an argument.');
      process.exit(1);
    }

    console.log(`✓ Found user:`);
    console.log(`  UID: ${userInfo.uid}`);
    console.log(`  Display Name: ${userInfo.displayName}`);
    console.log(`  Verified: ${userInfo.verified}\n`);
    
    let successCount = 0;
    let errorCount = 0;

    for (const mockListing of mockListings) {
      try {
        // Convert to CreateListingInput format
        const listingInput = mockListingToCreateInput(mockListing);
        
        // Create the listing directly in Firestore
        console.log(`Creating listing: ${mockListing.title}...`);
        const listingId = await createListingDirectly(
          userInfo.uid,
          { displayName: userInfo.displayName, verified: userInfo.verified },
          listingInput
        );
        
        console.log(`  ✓ Created and published: ${mockListing.title} (ID: ${listingId})`);
        successCount++;
      } catch (error) {
        console.error(`  ✗ Error creating listing "${mockListing.title}":`, error);
        if (error instanceof Error) {
          console.error(`     ${error.message}`);
        }
        errorCount++;
      }
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`\nAll listings are now stored in Firestore and linked to user: ${userIdentifier} (${userInfo.uid})`);
    console.log(`\n⚠️  IMPORTANT: Make sure to create the required Firestore index:`);
    console.log(`   Collection: listings`);
    console.log(`   Fields: status (Ascending) + createdAt (Descending)`);
    console.log(`   Create it here: https://console.firebase.google.com/v1/r/project/wildlife-exchange/firestore/indexes?create_composite=ClJwcm9qZWN0cy93aWxkbGlmZS1leGNoYW5nZS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvbGlzdGluZ3MvaW5kZXhlcy9fEAEaCgoGc3RhdHVzEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg`);
    console.log(`\nNote: If you see permission errors, you may need to use Firebase Admin SDK instead.`);
    
  } catch (error) {
    console.error('Error seeding listings:', error);
    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the seed function
seedListings()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
