import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from './config';
import { getDocument } from './firestore';
import { Listing, ListingStatus, UserProfile } from '@/lib/types';
import { ListingDoc } from '@/lib/types/firestore';

/**
 * Input type for creating a listing (omits fields that are auto-generated)
 */
export interface CreateListingInput {
  title: string;
  description: string;
  type: 'auction' | 'fixed' | 'classified';
  category: 'cattle' | 'horses' | 'wildlife' | 'equipment' | 'land' | 'other';
  price?: number;
  startingBid?: number;
  reservePrice?: number;
  images: string[];
  location: {
    city: string;
    state: string;
    zip?: string;
  };
  endsAt?: Date;
  featured?: boolean;
  featuredUntil?: Date;
  trust: {
    verified: boolean;
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

/**
 * Convert Firestore Timestamp to JavaScript Date
 */
const timestampToDate = (timestamp: Timestamp | Date | undefined): Date | undefined => {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (timestamp instanceof Timestamp) return timestamp.toDate();
  return undefined;
};

/**
 * Convert Firestore ListingDoc to UI Listing type
 * Converts Timestamps to Dates and adds legacy seller object for backward compatibility
 */
export function toListing(doc: ListingDoc & { id: string }): Listing {
  // Build legacy seller object for backward compatibility (deprecated)
  const legacySeller = doc.sellerSnapshot
    ? {
        id: doc.sellerId,
        name: doc.sellerSnapshot.displayName,
        rating: 0, // Default - should be fetched from user profile if needed
        responseTime: 'N/A', // Default - should be fetched from user profile if needed
        verified: doc.sellerSnapshot.verified,
      }
    : undefined;

  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    type: doc.type,
    category: doc.category,
    status: doc.status,
    price: doc.price,
    currentBid: doc.currentBid,
    reservePrice: doc.reservePrice,
    startingBid: doc.startingBid,
    images: doc.images || [],
    location: doc.location || { city: 'Unknown', state: 'Unknown' },
    sellerId: doc.sellerId,
    sellerSnapshot: doc.sellerSnapshot,
    seller: legacySeller, // @deprecated - for backward compatibility only
    trust: doc.trust || { verified: false, insuranceAvailable: false, transportReady: false },
    metadata: doc.metadata,
    endsAt: timestampToDate(doc.endsAt),
    featured: doc.featured,
    featuredUntil: timestampToDate(doc.featuredUntil),
    metrics: doc.metrics || { views: 0, favorites: 0, bidCount: 0 },
    createdAt: timestampToDate(doc.createdAt) || new Date(),
    updatedAt: timestampToDate(doc.updatedAt) || new Date(),
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    publishedAt: timestampToDate(doc.publishedAt),
  };
}

/**
 * Convert CreateListingInput to ListingDoc input (sanitizes and sets defaults)
 * Does NOT include audit fields (createdAt, updatedAt, createdBy, updatedBy) - those are set in createListingDraft
 */
function toListingDocInput(
  listingInput: CreateListingInput,
  sellerId: string,
  sellerSnapshot: { displayName: string; verified: boolean }
): Omit<ListingDoc, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'publishedAt' | 'status'> {
  return {
    title: listingInput.title.trim(),
    description: listingInput.description.trim(),
    type: listingInput.type,
    category: listingInput.category,
    images: listingInput.images || [],
    location: listingInput.location,
    sellerId,
    sellerSnapshot,
    trust: listingInput.trust,
    metadata: listingInput.metadata || {},
    metrics: {
      views: 0,
      favorites: 0,
      bidCount: 0,
    },
    // Pricing fields
    ...(listingInput.price !== undefined && { price: listingInput.price }),
    ...(listingInput.startingBid !== undefined && { startingBid: listingInput.startingBid }),
    ...(listingInput.reservePrice !== undefined && { reservePrice: listingInput.reservePrice }),
    // Date fields (convert to Timestamp)
    ...(listingInput.endsAt && { endsAt: Timestamp.fromDate(listingInput.endsAt) }),
    ...(listingInput.featured && { featured: listingInput.featured }),
    ...(listingInput.featuredUntil && { featuredUntil: Timestamp.fromDate(listingInput.featuredUntil) }),
  };
}

/**
 * Get seller snapshot data from user profile
 */
const getSellerSnapshot = async (userId: string): Promise<{ displayName: string; verified: boolean }> => {
  try {
    const userProfile = await getDocument<UserProfile>('users', userId);
    const displayName = userProfile?.displayName || userProfile?.profile?.fullName || userProfile?.email?.split('@')[0] || 'Unknown Seller';
    const verified = userProfile?.seller?.verified || false;
    return { displayName, verified };
  } catch (error) {
    console.error('Error fetching seller snapshot:', error);
    return { displayName: 'Unknown Seller', verified: false };
  }
};

/**
 * Fields that cannot be updated after creation
 */
const IMMUTABLE_FIELDS = ['sellerId', 'createdBy', 'createdAt'] as const;

/**
 * Create a new listing as draft
 */
export const createListingDraft = async (
  uid: string,
  listingInput: CreateListingInput
): Promise<string> => {
  try {
    // Get seller snapshot
    const sellerSnapshot = await getSellerSnapshot(uid);

    // Convert input to Firestore document format
    const listingData = toListingDocInput(listingInput, uid, sellerSnapshot);

    // Create listing document
    const listingRef = collection(db, 'listings');
    const docData: Omit<ListingDoc, 'id'> = {
      ...listingData,
      status: 'draft' as ListingStatus,
      createdBy: uid,
      updatedBy: uid,
      createdAt: serverTimestamp() as unknown as Timestamp, // Firestore will replace with server timestamp
      updatedAt: serverTimestamp() as unknown as Timestamp,
    };

    const docRef = await addDoc(listingRef, docData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating listing draft:', error);
    throw error;
  }
};

/**
 * Publish a listing (change status from draft to active)
 */
export const publishListing = async (uid: string, listingId: string): Promise<void> => {
  try {
    const listingRef = doc(db, 'listings', listingId);
    
    // Verify ownership (client-side check - security rules will enforce server-side)
    const listingDoc = await getDoc(listingRef);
    if (!listingDoc.exists()) {
      throw new Error('Listing not found');
    }
    
    const listingData = listingDoc.data() as ListingDoc;
    if (listingData.sellerId !== uid) {
      throw new Error('Unauthorized: You can only publish your own listings');
    }

    // Only set publishedAt if it doesn't already exist (idempotent)
    const updates: any = {
      status: 'active' as ListingStatus,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    };

    // Only set publishedAt if not already set
    if (!listingData.publishedAt) {
      updates.publishedAt = serverTimestamp();
    }

    await updateDoc(listingRef, updates);
  } catch (error) {
    console.error('Error publishing listing:', error);
    throw error;
  }
};

/**
 * Update an existing listing
 * Prevents updates to immutable fields (sellerId, createdBy, createdAt)
 */
export const updateListing = async (
  uid: string,
  listingId: string,
  updates: Partial<CreateListingInput>
): Promise<void> => {
  try {
    const listingRef = doc(db, 'listings', listingId);
    
    // Verify ownership (client-side check - security rules will enforce server-side)
    const listingDoc = await getDoc(listingRef);
    if (!listingDoc.exists()) {
      throw new Error('Listing not found');
    }
    
    const listingData = listingDoc.data() as ListingDoc;
    if (listingData.sellerId !== uid) {
      throw new Error('Unauthorized: You can only update your own listings');
    }

    // Strip immutable fields from updates
    const { sellerId, createdBy, createdAt, ...safeUpdates } = updates as any;
    if (sellerId || createdBy || createdAt) {
      console.warn('Attempted to update immutable fields. These fields were ignored:', {
        sellerId,
        createdBy,
        createdAt,
      });
    }

    // Convert Date objects to Timestamps for Firestore
    const firestoreUpdates: any = {
      ...safeUpdates,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    };

    // Convert Date fields to Timestamps
    if (updates.endsAt) {
      firestoreUpdates.endsAt = Timestamp.fromDate(updates.endsAt);
    }
    if (updates.featuredUntil) {
      firestoreUpdates.featuredUntil = Timestamp.fromDate(updates.featuredUntil);
    }

    // Remove undefined values
    Object.keys(firestoreUpdates).forEach(key => {
      if (firestoreUpdates[key] === undefined) {
        delete firestoreUpdates[key];
      }
    });

    await updateDoc(listingRef, firestoreUpdates);
  } catch (error) {
    console.error('Error updating listing:', error);
    throw error;
  }
};

/**
 * Get a single listing by ID
 * Returns UI Listing type (Date fields)
 */
export const getListingById = async (listingId: string): Promise<Listing | null> => {
  try {
    const listingRef = doc(db, 'listings', listingId);
    const listingDoc = await getDoc(listingRef);

    if (!listingDoc.exists()) {
      return null;
    }

    const data = listingDoc.data() as ListingDoc;
    return toListing({
      id: listingDoc.id,
      ...data,
    });
  } catch (error) {
    console.error('Error fetching listing:', error);
    throw error;
  }
};

/**
 * List active listings with optional filters
 * Returns UI Listing[] (Date fields)
 */
export const listActiveListings = async (
  filters?: {
    category?: string;
    type?: string;
    limitCount?: number;
  }
): Promise<Listing[]> => {
  try {
    const constraints: QueryConstraint[] = [
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc'),
    ];

    if (filters?.category) {
      constraints.push(where('category', '==', filters.category));
    }

    if (filters?.type) {
      constraints.push(where('type', '==', filters.type));
    }

    if (filters?.limitCount) {
      constraints.push(limit(filters.limitCount));
    }

    const listingsRef = collection(db, 'listings');
    const q = query(listingsRef, ...constraints);
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) =>
      toListing({
        id: doc.id,
        ...(doc.data() as ListingDoc),
      })
    );
  } catch (error) {
    console.error('Error fetching active listings:', error);
    throw error;
  }
};

/**
 * List listings by seller (with optional status filter)
 * Returns UI Listing[] (Date fields)
 */
export const listSellerListings = async (
  uid: string,
  status?: ListingStatus
): Promise<Listing[]> => {
  try {
    const constraints: QueryConstraint[] = [
      where('sellerId', '==', uid),
      orderBy('createdAt', 'desc'),
    ];

    if (status) {
      constraints.push(where('status', '==', status));
    }

    const listingsRef = collection(db, 'listings');
    const q = query(listingsRef, ...constraints);
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) =>
      toListing({
        id: doc.id,
        ...(doc.data() as ListingDoc),
      })
    );
  } catch (error) {
    console.error('Error fetching seller listings:', error);
    throw error;
  }
};
