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
  onSnapshot,
  Unsubscribe,
  FieldPath,
  deleteField,
} from 'firebase/firestore';
import { auth, db } from './config';
import { getDocument } from './firestore';
import { Listing, ListingStatus, ListingType, ListingCategory, ListingAttributes, UserProfile } from '@/lib/types';
import { ListingDoc } from '@/lib/types/firestore';
import { validateListingCompliance, requiresComplianceReview } from '@/lib/compliance/validation';
import { getTierWeight } from '@/lib/pricing/subscriptions';

/**
 * Firestore does not allow `undefined` values anywhere in a document (including nested objects).
 * This helper removes undefined fields recursively from *plain objects* and filters undefined from arrays.
 *
 * Important: we only recurse into plain objects to avoid corrupting Firestore sentinels (e.g. serverTimestamp())
 * and special classes like Timestamp.
 */
function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (Array.isArray(value)) {
    const cleaned = (value as unknown as unknown[])
      .map((v) => stripUndefinedDeep(v))
      .filter((v) => v !== undefined);
    return cleaned as unknown as T;
  }
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    // Only recurse into plain objects (including `{}`).
    if (proto !== Object.prototype && proto !== null) {
      return value;
    }
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      const vv = stripUndefinedDeep(v);
      if (vv === undefined) continue;
      out[k] = vv;
    }
    return out as T;
  }
  return value;
}

/**
 * Input type for creating a listing (omits fields that are auto-generated)
 */

export interface CreateListingInput {
  title: string;
  description: string;
  type: 'auction' | 'fixed' | 'classified';
  category: ListingCategory; // 'wildlife_exotics' | 'cattle_livestock' | 'ranch_equipment'
  subcategory?: string; // Optional subcategory
  price?: number;
  startingBid?: number;
  reservePrice?: number;
  images: string[];
  photoIds?: string[];
  photos?: Array<{
    photoId: string;
    url: string;
    width?: number;
    height?: number;
    sortOrder?: number;
  }>;
  coverPhotoId?: string;
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
  attributes: ListingAttributes; // Category-specific structured attributes
  // Protected Transaction fields
  protectedTransactionEnabled?: boolean;
  protectedTransactionDays?: 7 | 14 | null;
  protectedTermsVersion?: string;

  // Whitetail-only seller attestation (top-level)
  sellerAttestationAccepted?: boolean;
  sellerAttestationAcceptedAt?: Date;

  // Best Offer (Fixed/Classified; eBay-style)
  bestOfferEnabled?: boolean;
  bestOfferMinPrice?: number;
  bestOfferAutoAcceptPrice?: number;
  bestOfferSettings?: {
    enabled: boolean;
    minPrice?: number;
    autoAcceptPrice?: number;
    allowCounter: boolean;
    offerExpiryHours: number;
  };
}

/**
 * Convert Firestore Timestamp to JavaScript Date
 */
const timestampToDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;

  // Works for Firestore Timestamp-like values (including some serialized shapes).
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      if (d instanceof Date && Number.isFinite(d.getTime())) return d;
    } catch {
      // ignore
    }
  }

  // Firebase client Timestamp instance
  if (value instanceof Timestamp) return value.toDate();

  // Serialized timestamp shape: { seconds, nanoseconds }
  if (typeof value?.seconds === 'number') {
    const d = new Date(value.seconds * 1000);
    return Number.isFinite(d.getTime()) ? d : undefined;
  }

  // String/number date
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : undefined;
  }

  return undefined;
};

/**
 * Migrate old metadata structure to new attributes structure for backward compatibility
 * If doc has old metadata, convert it to appropriate attributes based on category
 * If doc already has attributes, use them directly
 */
function migrateAttributes(doc: ListingDoc & { id: string }): ListingAttributes {
  // If attributes already exist, use them
  if (doc.attributes && typeof doc.attributes === 'object') {
    return doc.attributes as ListingAttributes;
  }

  // Backward compatibility: migrate old metadata to new attributes
  const oldMetadata = (doc as any).metadata as any;
  const category = (doc as any).category as any;

  // Default category for old listings without category
  const effectiveCategory: ListingCategory = category || 'wildlife_exotics';

  // Map old categories to new ones
  let mappedCategory: ListingCategory = effectiveCategory;
  if (category === 'wildlife' || category === 'horses' || !category) {
    mappedCategory = 'wildlife_exotics';
  } else if (category === 'cattle') {
    mappedCategory = 'cattle_livestock';
  } else if (category === 'equipment') {
    mappedCategory = 'ranch_equipment';
  } else {
    // For 'land' or 'other', default to wildlife_exotics
    mappedCategory = 'wildlife_exotics';
  }

  // Convert old metadata to new attributes based on category
  if (mappedCategory === 'wildlife_exotics') {
    return {
      // Best-effort mapping from legacy `metadata.breed` → `speciesId`
      speciesId: String(oldMetadata?.breed || 'other_exotic'),
      sex: 'unknown',
      age: oldMetadata?.age ? String(oldMetadata.age) : undefined,
      quantity: Number(oldMetadata?.quantity || 1),
      animalIdDisclosure: true,
      healthDisclosure: true,
      healthNotes: oldMetadata?.healthStatus ? String(oldMetadata.healthStatus) : undefined,
      transportDisclosure: true,
    } as ListingAttributes;
  } else if (mappedCategory === 'cattle_livestock') {
    return {
      breed: String(oldMetadata?.breed || 'Unknown'),
      sex: 'unknown',
      age: oldMetadata?.age ? String(oldMetadata.age) : undefined,
      registered: Boolean(oldMetadata?.papers || false),
      registrationNumber: oldMetadata?.registrationNumber ? String(oldMetadata.registrationNumber) : undefined,
      quantity: Number(oldMetadata?.quantity || 1),
      identificationDisclosure: true,
      healthDisclosure: true,
      healthNotes: oldMetadata?.healthStatus ? String(oldMetadata.healthStatus) : undefined,
    } as ListingAttributes;
  } else {
    // ranch_equipment
    return {
      equipmentType: 'other' as any,
      condition: 'good',
      quantity: Number(oldMetadata?.quantity || 1),
    } as ListingAttributes;
  }
}

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

  const attributes = migrateAttributes(doc);

  // Normalize whitetail permit expiration Date from nested Timestamp (if present)
  if (doc.category === 'whitetail_breeder') {
    const raw: any = (attributes as any)?.tpwdPermitExpirationDate;
    const d: Date | null = raw?.toDate?.() || (raw instanceof Date ? raw : null);
    if (d) {
      (attributes as any).tpwdPermitExpirationDate = d;
    }
  }

  const photoSnapshot = (doc as any).photos as any[] | undefined;
  const normalizedPhotos =
    Array.isArray(photoSnapshot) && photoSnapshot.length
      ? photoSnapshot
          .map((p) => ({
            photoId: String(p.photoId),
            url: String(p.url),
            width: typeof p.width === 'number' ? p.width : undefined,
            height: typeof p.height === 'number' ? p.height : undefined,
            sortOrder: typeof p.sortOrder === 'number' ? p.sortOrder : undefined,
          }))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      : undefined;
  const derivedImages = normalizedPhotos?.map((p) => p.url).filter(Boolean) ?? doc.images ?? [];

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
    images: derivedImages,
    photoIds: Array.isArray((doc as any).photoIds) ? ((doc as any).photoIds as any[]).map(String) : undefined,
    photos: normalizedPhotos,
    coverPhotoId: (doc as any).coverPhotoId ? String((doc as any).coverPhotoId) : undefined,
    location: doc.location || { city: 'Unknown', state: 'Unknown' },
    sellerId: doc.sellerId,
    sellerSnapshot: doc.sellerSnapshot,
    sellerTier: (doc as any).sellerTierSnapshot,
    seller: legacySeller, // @deprecated - for backward compatibility only
    trust: doc.trust || { verified: false, insuranceAvailable: false, transportReady: false },
    subcategory: doc.subcategory,
    attributes, // Migrate old metadata to new attributes if needed + normalize whitetail dates
    endsAt: timestampToDate(doc.endsAt),
    soldAt: timestampToDate((doc as any).soldAt) || null,
    soldPriceCents: typeof (doc as any).soldPriceCents === 'number' ? (doc as any).soldPriceCents : null,
    saleType: typeof (doc as any).saleType === 'string' ? ((doc as any).saleType as any) : undefined,
    featured: doc.featured,
    featuredUntil: timestampToDate(doc.featuredUntil),
    metrics: doc.metrics || { views: 0, favorites: 0, bidCount: 0 },
    watcherCount: typeof (doc as any).watcherCount === 'number' ? (doc as any).watcherCount : undefined,
    createdAt: timestampToDate(doc.createdAt) || new Date(),
    updatedAt: timestampToDate(doc.updatedAt) || new Date(),
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    publishedAt: timestampToDate(doc.publishedAt),

    // Moderation lifecycle (admin approval / rejection)
    pendingReason: (doc as any).pendingReason ?? null,
    rejectedAt: timestampToDate((doc as any).rejectedAt) || null,
    rejectedBy: typeof (doc as any).rejectedBy === 'string' ? (doc as any).rejectedBy : undefined,
    rejectionReason: typeof (doc as any).rejectionReason === 'string' ? (doc as any).rejectionReason : undefined,
    approvedAt: timestampToDate((doc as any).approvedAt) || null,
    approvedBy: typeof (doc as any).approvedBy === 'string' ? (doc as any).approvedBy : undefined,
    resubmittedAt: timestampToDate((doc as any).resubmittedAt) || null,
    resubmittedForRejectionAt: timestampToDate((doc as any).resubmittedForRejectionAt) || null,
    resubmissionCount: typeof (doc as any).resubmissionCount === 'number' ? (doc as any).resubmissionCount : undefined,
    // Protected Transaction fields
    protectedTransactionEnabled: doc.protectedTransactionEnabled,
    protectedTransactionDays: doc.protectedTransactionDays,
    protectedTransactionBadge: doc.protectedTransactionDays === 7 ? 'PROTECTED_7' : doc.protectedTransactionDays === 14 ? 'PROTECTED_14' : null,
    protectedTermsVersion: doc.protectedTermsVersion,
    protectedEnabledAt: timestampToDate(doc.protectedEnabledAt),

    // Whitetail-only seller attestation + internal flags
    sellerAttestationAccepted: doc.sellerAttestationAccepted,
    sellerAttestationAcceptedAt: timestampToDate(doc.sellerAttestationAcceptedAt),
    internalFlags: doc.internalFlags,
    internalFlagsNotes: doc.internalFlagsNotes,

    // Best Offer (optional)
    bestOfferEnabled: (doc as any).bestOfferEnabled ?? (doc as any).bestOfferSettings?.enabled,
    bestOfferMinPrice: (doc as any).bestOfferMinPrice ?? (doc as any).bestOfferSettings?.minPrice,
    bestOfferAutoAcceptPrice: (doc as any).bestOfferAutoAcceptPrice ?? (doc as any).bestOfferSettings?.autoAcceptPrice,
    bestOfferSettings: (doc as any).bestOfferSettings,

    // Offer reservation (server-only)
    offerReservedByOfferId: (doc as any).offerReservedByOfferId,
    offerReservedAt: timestampToDate((doc as any).offerReservedAt),
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
  // Clean location object - remove undefined zip
  const location: any = {
    city: listingInput.location.city,
    state: listingInput.location.state,
  };
  if (listingInput.location.zip && listingInput.location.zip.trim()) {
    location.zip = listingInput.location.zip.trim();
  }

  return {
    title: listingInput.title.trim(),
    description: listingInput.description.trim(),
    type: listingInput.type,
    category: listingInput.category,
    images:
      (listingInput.photos && listingInput.photos.length
        ? listingInput.photos.map((p) => p.url).filter(Boolean)
        : listingInput.images) || [],
    ...(Array.isArray(listingInput.photoIds) && { photoIds: listingInput.photoIds }),
    ...(Array.isArray(listingInput.photos) && { photos: listingInput.photos }),
    ...(listingInput.coverPhotoId && { coverPhotoId: listingInput.coverPhotoId }),
    location,
    sellerId,
    sellerSnapshot,
    trust: listingInput.trust,
    ...(listingInput.subcategory !== undefined && { subcategory: listingInput.subcategory }),
    attributes: listingInput.attributes as Record<string, any>, // Store as plain object in Firestore
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
    // Protected Transaction fields
    ...(listingInput.protectedTransactionEnabled && {
      protectedTransactionEnabled: listingInput.protectedTransactionEnabled,
      protectedTransactionDays: listingInput.protectedTransactionDays || null,
      protectedTermsVersion: listingInput.protectedTermsVersion || 'v1',
      protectedEnabledAt: Timestamp.now(),
    }),

    // Whitetail-only seller attestation
    ...(listingInput.sellerAttestationAccepted !== undefined && {
      sellerAttestationAccepted: listingInput.sellerAttestationAccepted,
    }),
    ...(listingInput.sellerAttestationAcceptedAt && {
      sellerAttestationAcceptedAt: Timestamp.fromDate(listingInput.sellerAttestationAcceptedAt),
    }),

    // Best Offer settings (only meaningful for fixed/classified; UI enforces)
    ...(listingInput.bestOfferSettings && {
      bestOfferSettings: {
        enabled: !!listingInput.bestOfferSettings.enabled,
        minPrice: listingInput.bestOfferSettings.minPrice,
        autoAcceptPrice: listingInput.bestOfferSettings.autoAcceptPrice,
        allowCounter: listingInput.bestOfferSettings.allowCounter ?? true,
        offerExpiryHours: listingInput.bestOfferSettings.offerExpiryHours ?? 48,
      },
      bestOfferEnabled: !!listingInput.bestOfferSettings.enabled,
      bestOfferMinPrice: listingInput.bestOfferSettings.minPrice,
      bestOfferAutoAcceptPrice: listingInput.bestOfferSettings.autoAcceptPrice,
    }),
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
    // Whitetail-only hard gates (attestation is required even for draft creation)
    if (listingInput.category === 'whitetail_breeder' && listingInput.sellerAttestationAccepted !== true) {
      throw new Error(
        'Seller attestation is required for whitetail breeder listings. Please certify that permit information is accurate and permit is valid/current.'
      );
    }

    // P0: Compliance validation
    validateListingCompliance(
      listingInput.category,
      listingInput.attributes,
      listingInput.location.state,
      listingInput.title,
      listingInput.description,
      listingInput.type,
      {
        price: listingInput.price,
        startingBid: listingInput.startingBid,
        reservePrice: listingInput.reservePrice
      }
    );

    // Get seller snapshot
    const sellerSnapshot = await getSellerSnapshot(uid);

    // Convert input to Firestore document format
    const listingData = toListingDocInput(listingInput, uid, sellerSnapshot);

    // Determine compliance status
    const needsReview = requiresComplianceReview(listingInput.category, listingInput.attributes);
    const complianceStatus = needsReview ? 'pending_review' : 'none';

    // Create listing document
    const listingRef = collection(db, 'listings');
    const docData: Omit<ListingDoc, 'id'> = {
      ...listingData,
      status: 'draft' as ListingStatus,
      complianceStatus: complianceStatus as any,
      createdBy: uid,
      updatedBy: uid,
      createdAt: serverTimestamp() as unknown as Timestamp, // Firestore will replace with server timestamp
      updatedAt: serverTimestamp() as unknown as Timestamp,
    };

    // Firestore rejects nested undefined values (e.g. bestOfferSettings.minPrice when empty).
    const cleanedDocData = stripUndefinedDeep(docData);
    const docRef = await addDoc(listingRef, cleanedDocData as any);
    return docRef.id;
  } catch (error) {
    console.error('Error creating listing draft:', error);
    throw error;
  }
};

/**
 * Publish a listing (change status from draft to active)
 * Checks listing limit based on user's subscription plan
 * Enforces compliance review requirements
 */
export const publishListing = async (
  uid: string,
  listingId: string
): Promise<{ success: boolean; pendingReview: boolean; pendingReason?: 'admin_approval' | 'compliance_review' }> => {
  try {
    // Use server-side publish endpoint as the source of truth.
    // This ensures plan limits, compliance gates, and internal whitetail flags cannot be bypassed.
    const { auth } = await import('./config');
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Authentication required');
    }

    const token = await user.getIdToken();
    const res = await fetch('/api/listings/publish', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ listingId }),
    });

    const json = await res.json();
    if (!res.ok) {
      const err: any = new Error(json?.message || json?.error || 'Failed to publish listing');
      // Surface structured error codes to the UI (e.g. PAYOUTS_NOT_READY) for better UX.
      if (json?.code) err.code = json.code;
      if (json?.error) err.error = json.error;
      throw err;
    }

    if (json?.pendingReview) {
      return {
        success: true,
        pendingReview: true,
        pendingReason: json?.pendingReason === 'admin_approval' ? 'admin_approval' : 'compliance_review',
      };
    }
    return { success: true, pendingReview: false };
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

    // If switching listing type, clear incompatible fields so compliance validation and publish won't fail.
    const nextType = (safeUpdates as any)?.type as ListingType | undefined;
    if (nextType) {
      if (nextType === 'auction') {
        // Auction cannot have fixed price fields
        firestoreUpdates.price = deleteField();
        // Best offer is fixed/classified-only; clear it to avoid confusing state.
        firestoreUpdates.bestOfferSettings = deleteField();
        firestoreUpdates.bestOfferEnabled = deleteField();
        firestoreUpdates.bestOfferMinPrice = deleteField();
        firestoreUpdates.bestOfferAutoAcceptPrice = deleteField();
      } else {
        // Fixed/Classified cannot have auction fields
        firestoreUpdates.startingBid = deleteField();
        firestoreUpdates.reservePrice = deleteField();
        firestoreUpdates.endsAt = deleteField();
        firestoreUpdates.currentBid = deleteField();
      }
    }

    // Convert Date fields to Timestamps
    if (updates.endsAt) {
      firestoreUpdates.endsAt = Timestamp.fromDate(updates.endsAt);
    }
    if (updates.featuredUntil) {
      firestoreUpdates.featuredUntil = Timestamp.fromDate(updates.featuredUntil);
    }

    // Remove undefined values recursively (nested objects like bestOfferSettings, location, etc.)
    const cleanedUpdates = stripUndefinedDeep(firestoreUpdates);

    await updateDoc(listingRef, cleanedUpdates);
  } catch (error) {
    console.error('Error updating listing:', error);
    throw error;
  }
};

/**
 * Server-side (Admin SDK) helper: append one image URL to a listing.
 * This bypasses client Firestore rules while still enforcing seller ownership server-side.
 */
export async function addListingImageServer(listingId: string, url: string): Promise<void> {
  const { auth } = await import('./config');
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');

  const token = await user.getIdToken();
  const res = await fetch(`/api/listings/${listingId}/images/add`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || 'Failed to update listing images');
  }
}

/**
 * Unpublish/Pause a listing (change status from active to draft)
 */
export const unpublishListing = async (uid: string, listingId: string): Promise<void> => {
  try {
    const listingRef = doc(db, 'listings', listingId);
    
    // Verify ownership
    const listingDoc = await getDoc(listingRef);
    if (!listingDoc.exists()) {
      throw new Error('Listing not found');
    }
    
    const listingData = listingDoc.data() as ListingDoc;
    if (listingData.sellerId !== uid) {
      throw new Error('Unauthorized: You can only unpublish your own listings');
    }

    // Only allow unpublishing active listings
    if (listingData.status !== 'active') {
      throw new Error('Only active listings can be unpublished');
    }

    await updateDoc(listingRef, {
      status: 'draft' as ListingStatus,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  } catch (error) {
    console.error('Error unpublishing listing:', error);
    throw error;
  }
};

/**
 * Mark a listing as sold
 */
/**
 * @deprecated Manual "mark as sold" has been removed.
 * Listings are automatically marked as "sold" when payment completes via webhook.
 * Sellers should use "Remove listing" or "Unpublish" for other cases.
 * 
 * This function is kept for reference but should not be used.
 * Status transitions:
 * - active → sold: Automatic (via webhook when payment completes)
 * - active → removed: Manual (seller removes listing)
 * - active → draft: Manual (seller unpublishes)
 */
// export const markListingSold = async (uid: string, listingId: string): Promise<void> => {
//   // REMOVED: Manual "mark as sold" functionality
//   // Listings are now only marked as "sold" automatically when payment completes
//   throw new Error('Manual "mark as sold" has been removed. Listings are automatically marked as sold when payment completes.');
// };

/**
 * Delete a listing
 * Note: This permanently removes the listing from Firestore
 * Consider using status: 'removed' instead if you want soft delete
 */
export const deleteListing = async (uid: string, listingId: string): Promise<void> => {
  try {
    // Preferred path: use server route so deletes always reflect in Firestore AND
    // we can clean up listing-owned Storage files + listing subcollections (Firestore doesn't cascade delete).
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Authentication required');
    }
    if (currentUser.uid !== uid) {
      throw new Error('Invalid user');
    }

    const token = await currentUser.getIdToken();
    const res = await fetch(`/api/listings/${listingId}/delete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok !== true) {
      throw new Error(data?.error || 'Failed to delete listing');
    }
  } catch (error) {
    console.error('Error deleting listing:', error);
    throw error;
  }
};

/**
 * Resubmit a rejected listing for admin approval.
 * Server-enforced rules: must be rejected, must be edited+saved since rejection, only one resubmit per rejection.
 */
export const resubmitListing = async (uid: string, listingId: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  if (user.uid !== uid) throw new Error('Invalid user');

  const token = await user.getIdToken();
  const res = await fetch(`/api/listings/${listingId}/resubmit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok !== true) {
    const err: any = new Error(data?.message || data?.error || 'Failed to resubmit listing');
    if (data?.code) err.code = data.code;
    throw err;
  }
};

/**
 * Duplicate a listing into a new draft listing.
 * Server-enforced rules: only owner can duplicate; copied fields are sanitized server-side.
 */
export const duplicateListing = async (uid: string, listingId: string): Promise<string> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  if (user.uid !== uid) throw new Error('Invalid user');

  const token = await user.getIdToken();
  const res = await fetch(`/api/listings/${listingId}/duplicate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok !== true) {
    const err: any = new Error(data?.message || data?.error || 'Failed to duplicate listing');
    if (data?.code) err.code = data.code;
    throw err;
  }
  const newId = String(data?.listingId || '').trim();
  if (!newId) throw new Error('Duplicate succeeded but no listingId was returned');
  return newId;
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
  /**
   * Optional multi-status filter for eBay-style browse toggles (e.g., Active + Sold).
   * If provided, `statuses` takes precedence over `status`.
   */
  statuses?: Array<'active' | 'sold'>;
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
    const statuses = Array.isArray(filters.statuses) && filters.statuses.length ? filters.statuses : null;
    const status = filters.status || 'active';
    const soldOnly = statuses ? statuses.length === 1 && statuses[0] === 'sold' : status === 'sold';
    if (statuses) {
      // Firestore supports `in` for up to 10 values.
      constraints.push(where('status', 'in', statuses));
    } else {
      constraints.push(where('status', '==', status));
    }
    
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
      constraints.push(
        where(
          soldOnly ? 'soldPriceCents' : 'price',
          '<=',
          soldOnly ? Math.round(filters.maxPrice * 100) : filters.maxPrice
        )
      );
    } else if (filters.minPrice !== undefined && sort !== 'priceAsc' && sort !== 'priceDesc') {
      // minPrice without price sort - filter client-side after fetch
      // For now, we'll note this limitation
      console.warn('minPrice filter without price sort - will filter client-side');
    }
    
    // Sorting and orderBy
    // Firestore requires orderBy to match the sort direction
    switch (sort) {
      case 'newest':
        // For sold-only mode, treat "newest" as "recently sold".
        constraints.push(orderBy(soldOnly ? 'soldAt' : 'createdAt', 'desc'));
        break;
      case 'oldest':
        constraints.push(orderBy(soldOnly ? 'soldAt' : 'createdAt', 'asc'));
        break;
      case 'priceAsc':
        // For price sorting, we need to handle listings without price
        // Use a computed field or filter out nulls
        constraints.push(orderBy(soldOnly ? 'soldPriceCents' : 'price', 'asc'));
        // If minPrice is provided, add it as a where clause
        if (filters.minPrice !== undefined) {
          constraints.push(where(soldOnly ? 'soldPriceCents' : 'price', '>=', soldOnly ? Math.round(filters.minPrice * 100) : filters.minPrice));
        }
        break;
      case 'priceDesc':
        constraints.push(orderBy(soldOnly ? 'soldPriceCents' : 'price', 'desc'));
        // If minPrice is provided, add it as a where clause
        if (filters.minPrice !== undefined) {
          constraints.push(where(soldOnly ? 'soldPriceCents' : 'price', '>=', soldOnly ? Math.round(filters.minPrice * 100) : filters.minPrice));
        }
        break;
      case 'endingSoon':
        // For ending soon, we need to order by endsAt (auctions only)
        // This requires filtering by type='auction' first
        if (filters.type !== 'auction') {
          // If not filtering by auction type, we can't sort by endsAt
          // Fall back to newest
          constraints.push(orderBy(soldOnly ? 'soldAt' : 'createdAt', 'desc'));
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
    let querySnapshot;
    try {
      querySnapshot = await getDocs(q);
    } catch (error: any) {
      // Fallback for missing composite index (common during rollout / index build).
      if (error?.code === 'failed-precondition' || String(error?.message || '').includes('requires an index')) {
        console.warn('[queryListingsForBrowse] Missing index; using fallback ordering', error);
        // Remove all orderBy constraints and apply a safe default.
        const fallback = constraints.filter((c: any) => (c as any)?.type !== 'orderBy');
        fallback.push(orderBy('createdAt', 'desc'));
        const qFallback = query(collection(db, 'listings'), ...fallback);
        querySnapshot = await getDocs(qFallback);
      } else {
        throw error;
      }
    }
    
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

    // eBay-style behavior: hide "ended but unsold" auctions from default browse.
    // If an auction has `endsAt` in the past and isn't sold, it should not appear as an active listing.
    // (Bidding is already blocked server-side; this is purely browse UX.)
    const showingActive =
      (Array.isArray(statuses) && statuses.includes('active')) || (!statuses && status === 'active');
    if (showingActive) {
      const nowMs = Date.now();
      filteredItems = filteredItems.filter((l) => {
        if (l.status !== 'active') return true;
        if (l.type !== 'auction') return true;
        const endMs = l.endsAt?.getTime?.() ? l.endsAt.getTime() : null;
        // If we can't read endsAt, don't hide it.
        if (!endMs) return true;
        return endMs > nowMs;
      });
    }

    // For sold-only mode, sort client-side by soldAt as a stable, backwards-compatible tie-breaker.
    if (soldOnly && (sort === 'newest' || sort === 'oldest')) {
      const dir = sort === 'newest' ? -1 : 1;
      filteredItems = [...filteredItems].sort((a, b) => {
        const at = a.soldAt?.getTime?.() ? a.soldAt.getTime() : a.updatedAt?.getTime?.() ? a.updatedAt.getTime() : a.createdAt.getTime();
        const bt = b.soldAt?.getTime?.() ? b.soldAt.getTime() : b.updatedAt?.getTime?.() ? b.updatedAt.getTime() : b.createdAt.getTime();
        return dir * (at - bt);
      });
    }

    // Seller Tiers: deterministic tier boost without breaking relevance.
    // Primary: seller tier weight DESC (standard=0, priority=10, premier=20)
    // Secondary: the existing sort choice (createdAt/price/endsAt)
    const getSecondaryKey = (l: Listing): number => {
      switch (sort) {
        case 'oldest':
          return l.createdAt?.getTime?.() ? l.createdAt.getTime() : 0;
        case 'priceAsc':
        case 'priceDesc': {
          const price = l.price || l.currentBid || l.startingBid || 0;
          return Number(price) || 0;
        }
        case 'endingSoon':
          // Prefer endsAt for auctions; otherwise fall back to createdAt.
          return l.endsAt?.getTime?.() ? l.endsAt.getTime() : (l.createdAt?.getTime?.() ? l.createdAt.getTime() : 0);
        case 'newest':
        default:
          return l.createdAt?.getTime?.() ? l.createdAt.getTime() : 0;
      }
    };

    const originalIndex = new Map<string, number>();
    filteredItems.forEach((l, idx) => originalIndex.set(l.id, idx));

    filteredItems.sort((a, b) => {
      const aw = getTierWeight((a.sellerTier as any) || 'standard');
      const bw = getTierWeight((b.sellerTier as any) || 'standard');
      if (aw !== bw) return bw - aw;

      const as = getSecondaryKey(a);
      const bs = getSecondaryKey(b);

      // Align direction with the requested sort.
      const desc = sort === 'newest' || sort === 'priceDesc' || sort === 'endingSoon';
      if (as !== bs) return desc ? bs - as : as - bs;

      // Stable tie-breakers.
      const ai = originalIndex.get(a.id) ?? 0;
      const bi = originalIndex.get(b.id) ?? 0;
      if (ai !== bi) return ai - bi;
      return a.id.localeCompare(b.id);
    });

    // Fairness constraint (lightweight, page-local):
    // Ensure at least ~1 out of every 5 results is Standard if available.
    if (sort === 'newest') {
      const paid = filteredItems.filter((l) => (l.sellerTier || 'standard') !== 'standard');
      const standard = filteredItems.filter((l) => (l.sellerTier || 'standard') === 'standard');
      if (paid.length > 0 && standard.length > 0) {
        const merged: Listing[] = [];
        let p = 0;
        let s = 0;
        while (merged.length < filteredItems.length) {
          for (let i = 0; i < 4 && p < paid.length && merged.length < filteredItems.length; i++) {
            merged.push(paid[p++]);
          }
          if (s < standard.length && merged.length < filteredItems.length) {
            merged.push(standard[s++]);
          }
          // Drain remainder if one bucket exhausted.
          while (p < paid.length && merged.length < filteredItems.length && standard.length === s) {
            merged.push(paid[p++]);
          }
          while (s < standard.length && merged.length < filteredItems.length && paid.length === p) {
            merged.push(standard[s++]);
          }
        }
        filteredItems = merged;
      }
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

export const listMostWatchedAuctions = async (params?: { limitCount?: number }): Promise<Listing[]> => {
  const limitCount = params?.limitCount || 12;
  try {
    const listingsRef = collection(db, 'listings');
    const q = query(
      listingsRef,
      where('status', '==', 'active'),
      where('type', '==', 'auction'),
      orderBy('metrics.favorites', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) =>
      toListing({
        id: docSnap.id,
        ...(docSnap.data() as ListingDoc),
      })
    );
  } catch (error) {
    // Production safety: if the composite index for metrics.favorites isn't available yet,
    // fall back to a query that should already be indexed (status + type + createdAt),
    // then sort in-memory by favorites. This keeps the homepage working even if indexes
    // are missing/building, at the cost of a slightly less efficient query.
    const msg = String((error as any)?.message || '');
    const code = String((error as any)?.code || '');
    const looksLikeMissingIndex =
      code === 'failed-precondition' || /requires an index/i.test(msg);

    if (looksLikeMissingIndex) {
      // Avoid spamming the console in production (React may run effects multiple times).
      // We only need one warning per page load/session to diagnose.
      (globalThis as any).__wxWarnedFavoritesIndex =
        (globalThis as any).__wxWarnedFavoritesIndex === true ? true : false;
      if ((globalThis as any).__wxWarnedFavoritesIndex !== true) {
        (globalThis as any).__wxWarnedFavoritesIndex = true;
        console.warn('[listMostWatchedAuctions] Missing index for favorites query; using fallback', {
          code,
          message: msg,
        });
      }

      const listingsRef = collection(db, 'listings');
      const fallbackLimit = Math.max(limitCount * 8, 50); // grab a wider sample then rank
      const qFallback = query(
        listingsRef,
        where('status', '==', 'active'),
        where('type', '==', 'auction'),
        orderBy('createdAt', 'desc'),
        limit(fallbackLimit)
      );
      const snap = await getDocs(qFallback);
      const items = snap.docs.map((docSnap) =>
        toListing({
          id: docSnap.id,
          ...(docSnap.data() as ListingDoc),
        })
      );
      return items
        .sort((a: any, b: any) => Number(b?.metrics?.favorites || 0) - Number(a?.metrics?.favorites || 0))
        .slice(0, limitCount);
    }

    console.error('Error fetching most watched auctions:', error);
    throw error;
  }
};

export const listEndingSoonAuctions = async (params?: { limitCount?: number }): Promise<Listing[]> => {
  const limitCount = params?.limitCount || 12;
  try {
    const listingsRef = collection(db, 'listings');
    const now = Timestamp.fromDate(new Date());
    const q = query(
      listingsRef,
      where('status', '==', 'active'),
      where('type', '==', 'auction'),
      where('endsAt', '>=', now),
      orderBy('endsAt', 'asc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) =>
      toListing({
        id: docSnap.id,
        ...(docSnap.data() as ListingDoc),
      })
    );
  } catch (error) {
    console.error('Error fetching ending soon auctions:', error);
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

/**
 * Get listings by their IDs (for watchlist, etc.)
 * Returns UI Listing[] (Date fields)
 * Filters out null/not found listings
 */
export const getListingsByIds = async (listingIds: string[]): Promise<Listing[]> => {
  if (listingIds.length === 0) {
    return [];
  }

  try {
    // Firestore has a limit of 10 items for 'in' queries, so we batch them
    const batchSize = 10;
    const batches: string[][] = [];
    
    for (let i = 0; i < listingIds.length; i += batchSize) {
      batches.push(listingIds.slice(i, i + batchSize));
    }

    // Fetch all batches in parallel
    const batchPromises = batches.map(async (batch) => {
      if (batch.length === 0) return [];
      
      // For single item, use getDoc (more efficient)
      if (batch.length === 1) {
        try {
          const listing = await getListingById(batch[0]);
          return listing ? [listing] : [];
        } catch (error) {
          console.error(`Error fetching listing ${batch[0]}:`, error);
          return [];
        }
      }

      // For multiple items, fetch documents by ID
      const listingsRef = collection(db, 'listings');
      const batchDocs = await Promise.all(
        batch.map((id) => getDoc(doc(listingsRef, id)))
      );
      const querySnapshot = batchDocs.filter((docSnap) => docSnap.exists());
      
      return querySnapshot.map((docSnap) => {
        return toListing({
          id: docSnap.id,
          ...(docSnap.data() as ListingDoc),
        });
      });
    });

    const results = await Promise.all(batchPromises);
    return results.flat();
  } catch (error) {
    console.error('Error fetching listings by IDs:', error);
    throw error;
  }
};

/**
 * Subscribe to real-time updates for a single listing
 * @param listingId The ID of the listing to subscribe to
 * @param callback Function called with the listing data (or null if not found) whenever it changes
 * @returns Unsubscribe function to stop listening
 */
export const subscribeToListing = (
  listingId: string,
  callback: (listing: Listing | null) => void
): Unsubscribe => {
  const listingRef = doc(db, 'listings', listingId);
  
  return onSnapshot(
    listingRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      const data = snapshot.data() as ListingDoc;
      const listing = toListing({
        id: snapshot.id,
        ...data,
      });
      callback(listing);
    },
    (error) => {
      console.error('Error in listing subscription:', error);
      callback(null);
    }
  );
};
