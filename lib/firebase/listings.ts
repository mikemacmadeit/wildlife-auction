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
  startAfter,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from './config';
import { getDocument } from './firestore';
import { Listing, ListingStatus, ListingType, ListingCategory, UserProfile } from '@/lib/types';
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
 * Cursor for pagination
 * Can be a document snapshot (in-memory) or serializable data (for persistence)
 */
export type BrowseCursor = QueryDocumentSnapshot<DocumentData> | {
  createdAt: Timestamp;
  docId: string;
};

/**
 * Input filters for browse query
 */
export interface BrowseFilters {
  status?: 'active' | 'draft' | 'sold' | 'expired' | 'removed';
  type?: ListingType;
  category?: ListingCategory;
  location?: {
    state?: string;
  };
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
}

/**
 * Sort options for browse query
 */
export type BrowseSort = 'newest' | 'oldest' | 'priceAsc' | 'priceDesc' | 'endingSoon';

/**
 * Result of browse query with pagination
 */
export interface BrowseQueryResult {
  items: Listing[];
  nextCursor: BrowseCursor | null;
  hasMore: boolean;
}

/**
 * Query listings for browse page with filtering, sorting, and cursor pagination
 * 
 * Firestore Limitations:
 * - Price range: Can only use minPrice OR maxPrice, not both (unless orderBy is 'price')
 * - Location: Only state-level filtering supported (city requires full-text search)
 * - Full-text search: Not supported - must be done client-side on loaded results
 * 
 * @param options Query options
 * @returns Paginated results with cursor
 */
export const queryListingsForBrowse = async (
  options: {
    limit: number;
    cursor?: BrowseCursor | QueryDocumentSnapshot<DocumentData>;
    filters?: BrowseFilters;
    sort?: BrowseSort;
  }
): Promise<BrowseQueryResult> => {
  try {
    const { limit: limitCount, cursor, filters = {}, sort = 'newest' } = options;
    
    const constraints: QueryConstraint[] = [];
    
    // Status filter (default to active)
    const status = filters.status || 'active';
    constraints.push(where('status', '==', status));
    
    // Type filter
    if (filters.type) {
      constraints.push(where('type', '==', filters.type));
    }
    
    // Category filter
    if (filters.category) {
      constraints.push(where('category', '==', filters.category));
    }
    
    // Location filter (state only - city requires full-text search)
    if (filters.location?.state) {
      constraints.push(where('location.state', '==', filters.location.state));
    }
    
    // Featured filter
    if (filters.featured !== undefined) {
      constraints.push(where('featured', '==', filters.featured));
    }
    
    // Price filtering - Firestore limitation: can only use range on one field
    // If both minPrice and maxPrice are provided, we'll use maxPrice only
    // and filter minPrice client-side (or require orderBy price)
    if (filters.maxPrice !== undefined) {
      // For price range queries, we need to order by price
      // This means we can't combine with other orderBy fields
      // We'll handle this by using a separate query path
      constraints.push(where('price', '<=', filters.maxPrice));
    } else if (filters.minPrice !== undefined && sort !== 'priceAsc' && sort !== 'priceDesc') {
      // minPrice without price sort - filter client-side after fetch
      // For now, we'll note this limitation
      console.warn('minPrice filter without price sort - will filter client-side');
    }
    
    // Sorting and orderBy
    // Firestore requires orderBy to match the sort direction
    switch (sort) {
      case 'newest':
        constraints.push(orderBy('createdAt', 'desc'));
        break;
      case 'oldest':
        constraints.push(orderBy('createdAt', 'asc'));
        break;
      case 'priceAsc':
        // For price sorting, we need to handle listings without price
        // Use a computed field or filter out nulls
        constraints.push(orderBy('price', 'asc'));
        // If minPrice is provided, add it as a where clause
        if (filters.minPrice !== undefined) {
          constraints.push(where('price', '>=', filters.minPrice));
        }
        break;
      case 'priceDesc':
        constraints.push(orderBy('price', 'desc'));
        // If minPrice is provided, add it as a where clause
        if (filters.minPrice !== undefined) {
          constraints.push(where('price', '>=', filters.minPrice));
        }
        break;
      case 'endingSoon':
        // For ending soon, we need to order by endsAt (auctions only)
        // This requires filtering by type='auction' first
        if (filters.type !== 'auction') {
          // If not filtering by auction type, we can't sort by endsAt
          // Fall back to newest
          constraints.push(orderBy('createdAt', 'desc'));
        } else {
          constraints.push(orderBy('endsAt', 'asc'));
        }
        break;
    }
    
    // Cursor pagination
    if (cursor) {
      if (cursor instanceof QueryDocumentSnapshot || 'exists' in cursor) {
        // Already a document snapshot
        constraints.push(startAfter(cursor as QueryDocumentSnapshot<DocumentData>));
      } else {
        // Serializable cursor - fetch the document to use as cursor
        const docRef = doc(db, 'listings', cursor.docId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          constraints.push(startAfter(docSnap));
        }
      }
    }
    
    // Limit (fetch one extra to check if there are more)
    constraints.push(limit(limitCount + 1));
    
    // Build and execute query
    const listingsRef = collection(db, 'listings');
    const q = query(listingsRef, ...constraints);
    const querySnapshot = await getDocs(q);
    
    // Check if there are more results
    const hasMore = querySnapshot.docs.length > limitCount;
    const docs = hasMore ? querySnapshot.docs.slice(0, limitCount) : querySnapshot.docs;
    
    // Convert to Listing objects
    const items = docs.map((doc) =>
      toListing({
        id: doc.id,
        ...(doc.data() as ListingDoc),
      })
    );
    
    // Apply client-side minPrice filter if needed (when not using price sort)
    let filteredItems = items;
    if (filters.minPrice !== undefined && sort !== 'priceAsc' && sort !== 'priceDesc') {
      filteredItems = items.filter((listing) => {
        const price = listing.price || listing.currentBid || listing.startingBid || 0;
        return price >= filters.minPrice!;
      });
    }
    
    // Get next cursor (last document snapshot - most efficient for Firestore)
    let nextCursor: BrowseCursor | null = null;
    if (hasMore && docs.length > 0) {
      // Return the actual document snapshot (most efficient for Firestore queries)
      nextCursor = docs[docs.length - 1];
    }
    
    return {
      items: filteredItems,
      nextCursor,
      hasMore,
    };
  } catch (error) {
    console.error('Error querying listings for browse:', error);
    throw error;
  }
};

/**
 * List active listings with optional filters (legacy - kept for backward compatibility)
 * Returns UI Listing[] (Date fields)
 * 
 * @deprecated Use queryListingsForBrowse() for new code
 */
export const listActiveListings = async (
  filters?: {
    category?: string;
    type?: string;
    limitCount?: number;
  }
): Promise<Listing[]> => {
  try {
    const result = await queryListingsForBrowse({
      limit: filters?.limitCount || 50,
      filters: {
        status: 'active',
        category: filters?.category as ListingCategory | undefined,
        type: filters?.type as ListingType | undefined,
      },
      sort: 'newest',
    });
    return result.items;
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
