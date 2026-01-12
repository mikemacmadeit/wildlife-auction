// Marketplace Types for Wildlife Exchange

export type ListingType = 'auction' | 'fixed' | 'classified';

export type ListingCategory = 
  | 'cattle' 
  | 'horses' 
  | 'wildlife' 
  | 'equipment' 
  | 'land' 
  | 'other';

export type ListingStatus = 'draft' | 'active' | 'sold' | 'expired' | 'removed';

/**
 * Listing type for UI consumption
 * Dates are JavaScript Date objects (converted from Firestore Timestamps)
 */
export interface Listing {
  id: string;
  title: string;
  description: string;
  type: ListingType;
  category: ListingCategory;
  status: ListingStatus;
  
  // Pricing (type-specific)
  price?: number; // For fixed price listings
  currentBid?: number; // For auction listings (denormalized from bids)
  reservePrice?: number; // For auction listings
  startingBid?: number; // For auction listings
  
  // Media
  images: string[]; // Firebase Storage URLs
  
  // Location
  location: {
    city: string;
    state: string;
    zip?: string;
  };
  
  // Seller Reference (Firebase Auth UID)
  sellerId: string;
  
  // Denormalized Seller Data (snapshot at creation time)
  sellerSnapshot?: {
    displayName: string;
    verified: boolean;
  };
  
  /**
   * @deprecated Legacy seller object - DO NOT persist to Firestore.
   * Use sellerId + sellerSnapshot instead.
   * This field is derived in UI mapping only for backward compatibility.
   */
  seller?: {
    id: string;
    name: string;
    rating: number;
    responseTime: string;
    verified: boolean;
  };
  
  // Trust/Safety Flags
  trust: {
    verified: boolean;
    insuranceAvailable: boolean;
    transportReady: boolean;
  };
  
  // Metadata (searchable fields)
  metadata?: {
    quantity?: number;
    breed?: string;
    age?: string;
    healthStatus?: string;
    papers?: boolean;
  };
  
  // Auction-specific
  endsAt?: Date; // Auction end time
  
  // Featured/Promotion
  featured?: boolean;
  featuredUntil?: Date;
  
  // Metrics (analytics)
  metrics: {
    views: number;
    favorites: number;
    bidCount: number;
  };
  
  // Audit Trail (JavaScript Date objects - converted from Firestore Timestamps)
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // Firebase Auth UID
  updatedBy?: string; // Firebase Auth UID
  publishedAt?: Date; // When status changed to 'active'
}

export interface Bid {
  id: string;
  listingId: string;
  amount: number;
  bidderName: string;
  timestamp: Date;
}

export interface FilterState {
  category?: ListingCategory;
  type?: ListingType;
  location?: {
    state?: string;
    city?: string;
  };
  minPrice?: number;
  maxPrice?: number;
  species?: string[]; // Array of selected species/breeds
  quantity?: 'single' | 'pair' | 'small-group' | 'large-group' | 'lot'; // Single, 2-5, 6-10, 11+, lot
  healthStatus?: string[]; // Excellent, Good, Fair, etc.
  papers?: boolean; // Has registration/papers
  verifiedSeller?: boolean; // Only verified sellers
  transportReady?: boolean; // Transport-ready listings
  insuranceAvailable?: boolean; // Insurance available
  endingSoon?: boolean; // Ending within 24 hours
  newlyListed?: boolean; // Listed within 7 days
  featured?: boolean; // Featured listings only
}

export interface InsuranceTier {
  id: string;
  name: string;
  coverage: string;
  price: number;
  description: string;
}

// User Profile Types
export interface UserProfile {
  userId: string; // Firebase Auth UID
  email: string;
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  emailVerified: boolean;
  superAdmin?: boolean; // Super admin flag
  profileComplete?: boolean; // Flag to track if profile completion modal was shown/completed
  
  // Extended Profile Data
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
  
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}
