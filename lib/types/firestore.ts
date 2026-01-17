/**
 * Firestore Document Types
 * 
 * These types represent the shape of documents as stored in Firestore.
 * Firestore uses Timestamp for date fields, not JavaScript Date objects.
 */

import { Timestamp } from 'firebase/firestore';
import { ListingType, ListingCategory, ListingStatus, ComplianceStatus } from '../types';

/**
 * Listing document as stored in Firestore
 */
export interface ListingDoc {
  // Core Fields
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

  /**
   * Phase 1 (Uploads Library): listing photos reference user-scoped uploads.
   * `photoIds` is the source-of-truth; `photos` is a cached snapshot for fast public loads.
   */
  photoIds?: string[];
  photos?: Array<{
    photoId: string;
    url: string;
    width?: number;
    height?: number;
    sortOrder?: number;
  }>;
  coverPhotoId?: string;

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

  // Seller tier snapshot (Exposure Plans) - set server-side on publish for public display + ranking
  sellerTierSnapshot?: 'standard' | 'priority' | 'premier';
  sellerTierWeightSnapshot?: number;

  // Trust/Safety Flags
  trust: {
    verified: boolean;
    insuranceAvailable: boolean;
    transportReady: boolean;
  };

  // Category-specific attributes (replaces old metadata)
  subcategory?: string; // Optional subcategory within the 3 top categories
  attributes: Record<string, any>; // Category-specific structured attributes (stored as plain object in Firestore)

  // Auction-specific
  endsAt?: Timestamp; // Auction end time

  // Featured/Promotion
  featured?: boolean;
  featuredUntil?: Timestamp;

  // Metrics (analytics)
  metrics: {
    views: number;
    favorites: number;
    bidCount: number;
  };

  // Audit Trail (Firestore Timestamps)
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // Firebase Auth UID
  updatedBy?: string; // Firebase Auth UID
  publishedAt?: Timestamp; // When status changed to 'active'
  
  // Protected Transaction (Seller-selected protection)
  protectedTransactionEnabled?: boolean;
  protectedTransactionDays?: 7 | 14 | null;
  protectedTermsVersion?: string; // e.g., "v1"
  protectedEnabledAt?: Timestamp; // When seller enabled protection
  
  // Compliance fields
  complianceStatus?: ComplianceStatus;
  complianceRejectionReason?: string;
  complianceReviewedBy?: string; // Admin UID
  complianceReviewedAt?: Timestamp;

  // Whitetail-only seller attestation (top-level)
  sellerAttestationAccepted?: boolean;
  sellerAttestationAcceptedAt?: Timestamp;

  // Admin-only internal guardrails
  internalFlags?: {
    duplicatePermitNumber?: boolean;
    duplicateFacilityId?: boolean;
  };
  internalFlagsNotes?: {
    duplicatePermitNumber?: string;
    duplicateFacilityId?: string;
  };

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

  // Reserved by accepted offer (server-only)
  offerReservedByOfferId?: string;
  offerReservedAt?: Timestamp;
}

/**
 * Offer document as stored in Firestore
 * (Write via Admin SDK only; clients should have read-only access.)
 */
export interface OfferDoc {
  listingId: string;
  listingSnapshot: {
    title: string;
    category: ListingCategory;
    type: ListingType;
    sellerId: string;
  };
  sellerId: string;
  buyerId: string;
  currency: 'usd';
  status: 'open' | 'countered' | 'accepted' | 'declined' | 'withdrawn' | 'expired' | 'cancelled';
  currentAmount: number;
  originalAmount: number;
  lastActorRole: 'buyer' | 'seller' | 'system';
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  history: Array<{
    type: 'offer' | 'counter' | 'accept' | 'decline' | 'withdraw' | 'expire';
    actorId: string;
    actorRole: 'buyer' | 'seller' | 'system';
    amount?: number;
    note?: string;
    createdAt: Timestamp;
  }>;
  acceptedAmount?: number;
  acceptedAt?: Timestamp;
  acceptedBy?: string;
  checkoutSessionId?: string;
  orderId?: string;
}
