/**
 * Firestore Document Types
 * 
 * These types represent the shape of documents as stored in Firestore.
 * Firestore uses Timestamp for date fields, not JavaScript Date objects.
 */

import { Timestamp } from 'firebase/firestore';
import { ListingType, ListingCategory, ListingStatus } from '../types';

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
}
