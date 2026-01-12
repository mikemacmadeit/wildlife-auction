/**
 * Script to seed mock listings into Firestore using Firebase Admin SDK
 * 
 * This script migrates the mock listings from lib/mock-data.ts to Firestore,
 * linking them to the user with email usalandspecialist@gmail.com
 * 
 * Run with: npx tsx scripts/seed-listings-admin.ts
 * 
 * Prerequisites:
 * - Firebase Admin SDK service account key
 * - Set GOOGLE_APPLICATION_CREDENTIALS environment variable OR
 * - Place service account key at project/serviceAccountKey.json
 * - User must exist in Firebase Auth with email: usalandspecialist@gmail.com
 * - User document must exist in Firestore users collection
 * 
 * To get a service account key:
 * 1. Go to Firebase Console > Project Settings > Service Accounts
 * 2. Click "Generate New Private Key"
 * 3. Save the JSON file as project/serviceAccountKey.json
 * 4. OR set GOOGLE_APPLICATION_CREDENTIALS environment variable to the path
 */

const admin = require('firebase-admin');
import { mockListings } from '../lib/mock-data';
import { CreateListingInput } from '../lib/firebase/listings';
import { ListingDoc } from '../lib/types/firestore';
import { ListingStatus } from '../lib/types';
import * as path from 'path';
import * as fs from 'fs';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  // Try to load service account key from file or environment variable
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
    path.join(__dirname, '../serviceAccountKey.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('✓ Firebase Admin SDK initialized with service account key');
  } else {
    // Try to use Application Default Credentials (for Cloud Functions, etc.)
    try {
      admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'wildlife-exchange',
      });
      console.log('✓ Firebase Admin SDK initialized with Application Default Credentials');
    } catch (error) {
      console.error('❌ Error: Could not initialize Firebase Admin SDK');
      console.error('Please provide a service account key:');
      console.error('  1. Download from Firebase Console > Project Settings > Service Accounts');
      console.error('  2. Save as project/serviceAccountKey.json');
      console.error('  3. OR set GOOGLE_APPLICATION_CREDENTIALS environment variable');
      process.exit(1);
    }
  }
}

const db = admin.firestore();

/**
 * Get user UID and profile from email or username by checking the users collection
 */
async function getUserByIdentifier(identifier: string): Promise<{ uid: string; displayName: string; verified: boolean } | null> {
  try {
    // Try to find by email first
    let email = identifier;
    if (!identifier.includes('@')) {
      email = `${identifier}@gmail.com`;
    }
    
    console.log(`Attempting to find user with email: ${email}`);
    const usersRef = db.collection('users');
    const querySnapshot = await usersRef.where('email', '==', email).get();
    
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
      const userDocRef = usersRef.doc(identifier);
      const userDoc = await userDocRef.get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const uid = userDoc.id;
        const displayName = userData?.profile?.fullName || userData?.displayName || userData?.email?.split('@')[0] || 'Unknown Seller';
        const verified = userData?.seller?.verified || false;
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
 * Create listing document directly in Firestore using Admin SDK
 */
async function createListingDirectly(
  uid: string,
  sellerSnapshot: { displayName: string; verified: boolean },
  listingInput: CreateListingInput,
  listingId?: string
): Promise<string> {
  const listingsRef = db.collection('listings');
  
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
    createdAt: admin.firestore.FieldValue.serverTimestamp() as any,
    updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
    publishedAt: admin.firestore.FieldValue.serverTimestamp() as any,
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
    docData.endsAt = admin.firestore.Timestamp.fromDate(listingInput.endsAt);
  }
  if (listingInput.featured) {
    docData.featured = listingInput.featured;
  }
  if (listingInput.featuredUntil) {
    docData.featuredUntil = admin.firestore.Timestamp.fromDate(listingInput.featuredUntil);
  }

  // Create the document
  if (listingId) {
    // Use specified ID
    await listingsRef.doc(listingId).set(docData);
    return listingId;
  } else {
    // Generate new ID
    const docRef = listingsRef.doc();
    await docRef.set(docData);
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
