// Marketplace Types for Wildlife Exchange

export type ListingType = 'auction' | 'fixed' | 'classified';

export type ListingCategory = 
  | 'whitetail_breeder'
  | 'wildlife_exotics' 
  | 'cattle_livestock' 
  | 'ranch_equipment';

export type ListingStatus = 'draft' | 'pending' | 'active' | 'sold' | 'expired' | 'removed';

export type ComplianceStatus = 'none' | 'pending_review' | 'approved' | 'rejected';

// ============================================
// BEST OFFER (eBay-style) TYPES
// ============================================

export interface BestOfferSettings {
  enabled: boolean;
  minPrice?: number;
  autoAcceptPrice?: number;
  allowCounter: boolean; // default true
  offerExpiryHours: number; // default 48
}

export type OfferStatus =
  | 'open'
  | 'countered'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'cancelled';

export type OfferActorRole = 'buyer' | 'seller' | 'system';

export type OfferHistoryType = 'offer' | 'counter' | 'accept' | 'decline' | 'withdraw' | 'expire';

export interface OfferHistoryEntry {
  type: OfferHistoryType;
  actorId: string;
  actorRole: OfferActorRole;
  amount?: number;
  note?: string;
  createdAt: Date;
}

export interface OfferListingSnapshot {
  title: string;
  category: ListingCategory;
  type: ListingType;
  sellerId: string;
}

export interface Offer {
  offerId: string;
  listingId: string;
  listingSnapshot: OfferListingSnapshot;
  sellerId: string;
  buyerId: string;
  currency: 'usd';
  status: OfferStatus;
  currentAmount: number;
  originalAmount: number;
  lastActorRole: OfferActorRole;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  history: OfferHistoryEntry[];
  acceptedAmount?: number;
  acceptedAt?: Date;
  acceptedBy?: string;
  checkoutSessionId?: string;
  orderId?: string;
}

// Category-specific attribute types
export interface WhitetailBreederAttributes {
  speciesId: 'whitetail_deer'; // Fixed enum
  sex: 'male' | 'female' | 'unknown'; // Required
  /**
   * Age in years (number). Kept as `number | string` for backward compatibility with legacy docs.
   * New listing creation should write a number so we can filter/query reliably.
   */
  age?: number | string;
  quantity: number; // Required, default 1
  tpwdBreederPermitNumber: string; // Required
  breederFacilityId: string; // Required
  /**
   * Permit expiration date (required).
   * Stored in Firestore as a Timestamp (or Date), converted to Date in UI mapping.
   */
  tpwdPermitExpirationDate: Date;
  deerIdTag: string; // Required (or structured identifier)
  cwdDisclosureChecklist: {
    cwdAware: boolean; // Seller acknowledges CWD rules
    cwdCompliant: boolean; // Seller confirms compliance
  };
  healthNotes?: string; // Optional
}

export interface WildlifeAttributes {
  speciesId: string; // Controlled list: axis, fallow, blackbuck, aoudad, nilgai, etc. or 'other_exotic'
  sex: 'male' | 'female' | 'unknown'; // Required
  /**
   * Age in years (number). Kept as `number | string` for backward compatibility with legacy docs.
   * New listing creation should write a number so we can filter/query reliably.
   */
  age?: number | string;
  quantity: number; // Required, default 1
  locationType?: 'seller_location' | 'facility'; // Optional
  animalIdDisclosure: boolean; // Required: seller confirms animals are properly identified/tagged
  healthDisclosure: boolean; // Required: health disclosure acknowledged
  healthNotes?: string; // Optional
  transportDisclosure: boolean; // Required: TX-only transfer unless otherwise permitted
}

export interface CattleAttributes {
  breed: string; // Required
  sex: 'bull' | 'cow' | 'heifer' | 'steer' | 'unknown'; // Required
  /**
   * Age in years (number). Kept as `number | string` for backward compatibility with legacy docs.
   * New listing creation should write a number so we can filter/query reliably.
   */
  age?: number | string; // Optional (one of age or weightRange required)
  weightRange?: string; // Optional, ex "1100-1250 lbs" (one of age or weightRange required)
  registered: boolean; // Required
  registrationNumber?: string; // Required if registered=true
  pregChecked?: boolean; // Optional
  quantity: number; // Required, default 1
  identificationDisclosure: boolean; // Required: ear tags/brand present
  healthDisclosure: boolean; // Required: health disclosure acknowledged
  healthNotes?: string; // Optional
}

export type EquipmentType = 
  | 'tractor'
  | 'trailer'
  | 'utv'
  | 'atv'
  | 'skidsteer'
  | 'implement'
  | 'feeder'
  | 'fencing'
  | 'other';

export interface EquipmentAttributes {
  equipmentType: EquipmentType; // Required enum
  make?: string;
  model?: string;
  year?: number;
  hours?: number;
  condition: 'new' | 'excellent' | 'good' | 'fair' | 'for_parts'; // Required
  serialNumber?: string; // Optional
  hasTitle?: boolean; // Required if equipmentType in [utv, atv, truck, trailer]
  vinOrSerial?: string; // Required if equipmentType in [utv, atv, truck, trailer]
  quantity: number; // Required, default 1
}

// Union type for category-specific attributes
export type ListingAttributes = WhitetailBreederAttributes | WildlifeAttributes | CattleAttributes | EquipmentAttributes;

// Exotic species controlled list
export const EXOTIC_SPECIES = [
  'axis',
  'fallow',
  'blackbuck',
  'aoudad',
  'nilgai',
  'scimitar_horned_oryx',
  'addax',
  'greater_kudu',
  'red_stag',
  'sika',
  // Additional common exotics (TX ranch market)
  'elk',
  'red_deer', // non-stag phrasing
  'sambar',
  'rusa',
  'muntjac',
  'mouflon',
  'dama_gazelle',
  'dorcas_gazelle',
  'springbok',
  'impala',
  'waterbuck',
  'eland',
  'bongo',
  'nyala',
  'lesser_kudu',
  'gemsbok',
  'zebra',
  'wildebeest',
  'black_wildebeest',
  'blesbok',
  'hartebeest',
  'oryx',
  'sitatunga',
  'barasingha',
  'chital', // synonym for axis; kept for UX
  'ibex',
  'markhor',
  'tahr',
  'other_exotic' // Requires admin review
] as const;

export type ExoticSpecies = typeof EXOTIC_SPECIES[number];

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
  currentBidderId?: string; // For auction listings (denormalized: current highest bidder UID)
  reservePrice?: number; // For auction listings
  startingBid?: number; // For auction listings
  
  // Media
  /**
   * Legacy image URLs (back-compat).
   * New code should prefer `photos` / `photoIds` and derive URLs from the cached snapshot.
   */
  images: string[]; // Firebase Storage URLs

  /**
   * Phase 1 (Uploads Library): listing photos reference user-scoped uploads.
   * Source-of-truth is `photoIds`; `photos` is a cached snapshot for fast public reads.
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
    /**
     * Phase 3A (A4): public trust snapshot for anon-safe trust surfaces.
     * These values are copied at publish time (server-side) to avoid requiring reads of /users/{uid}.
     */
    completedSalesCount?: number;
    badges?: string[];
  };

  /**
   * Seller tier (Exposure Plans).
   * Not stored on listing by default; typically decorated at runtime for browse/ranking + UI badges.
   */
  sellerTier?: 'standard' | 'priority' | 'premier';
  
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
  
  // Category-specific attributes (replaces old metadata)
  subcategory?: string; // Optional subcategory within the 3 top categories
  attributes: ListingAttributes; // Category-specific structured attributes
  
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

  /**
   * Phase 3A/B3 (scale-safe watchers): denormalized, server-maintained watcher count.
   * Source of truth is maintained by `POST /api/watchlist/toggle` (Admin SDK).
   *
   * Back-compat: older listings may rely on `metrics.favorites`.
   */
  watcherCount?: number;
  
  // Audit Trail (JavaScript Date objects - converted from Firestore Timestamps)
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // Firebase Auth UID
  updatedBy?: string; // Firebase Auth UID
  publishedAt?: Date; // When status changed to 'active'
  
  // Protected Transaction (Seller-selected protection)
  protectedTransactionEnabled?: boolean;
  protectedTransactionDays?: 7 | 14 | null;
  protectedTransactionBadge?: 'PROTECTED_7' | 'PROTECTED_14' | null;
  protectedTermsVersion?: string; // e.g., "v1"
  protectedEnabledAt?: Date; // When seller enabled protection
  
  // Compliance fields
  complianceStatus?: ComplianceStatus; // Compliance review status
  complianceRejectionReason?: string; // Reason if rejected
  complianceReviewedBy?: string; // Admin UID who reviewed
  complianceReviewedAt?: Date; // When reviewed

  // Whitetail-only seller attestation (top-level; not shown as "TPWD approved")
  sellerAttestationAccepted?: boolean;
  sellerAttestationAcceptedAt?: Date;

  // Admin-only internal guardrails (never show publicly)
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
  bestOfferSettings?: BestOfferSettings;

  // Reserved by accepted offer (server-only)
  offerReservedByOfferId?: string;
  offerReservedAt?: Date;
}

export interface Bid {
  id: string;
  listingId: string;
  amount: number;
  bidderName: string;
  timestamp: Date;
}

/**
 * Canonical order state machine (with backwards compatibility).
 *
 * - New canonical: paid_held → in_transit → delivered → buyer_confirmed → ready_to_release → completed
 * - Legacy/back-compat: `paid` ~= `paid_held`, `accepted` ~= `buyer_confirmed`
 */
export type OrderStatus =
  | 'pending'
  // High-ticket rails (async / offline-like)
  | 'awaiting_bank_transfer'
  | 'awaiting_wire'
  // Canonical paid+held (funds in platform, not released)
  | 'paid_held'
  // Legacy paid (still present in older docs)
  | 'paid'
  | 'in_transit'
  | 'delivered'
  | 'buyer_confirmed'
  // Legacy accepted (still present in older docs)
  | 'accepted'
  | 'ready_to_release'
  | 'disputed'
  | 'completed'
  | 'refunded'
  | 'cancelled';

export type DisputeReason = 'death' | 'serious_illness' | 'injury' | 'escape' | 'wrong_animal';

export type DisputeStatus = 'none' | 'open' | 'needs_evidence' | 'under_review' | 'resolved_refund' | 'resolved_partial_refund' | 'resolved_release' | 'cancelled';

export type PayoutHoldReason = 'none' | 'protection_window' | 'dispute_open' | 'admin_hold' | 'chargeback';

export type OrderPaymentMethod = 'card' | 'ach_debit' | 'bank_transfer' | 'wire';

export interface DisputeEvidence {
  type: 'photo' | 'video' | 'vet_report' | 'delivery_doc' | 'tag_microchip';
  url: string;
  uploadedAt: Date;
}

export interface Order {
  id: string;
  listingId: string;
  offerId?: string; // If purchased via accepted Best Offer
  buyerId: string;
  sellerId: string;
  amount: number;
  platformFee: number;
  sellerAmount: number;
  status: OrderStatus;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  stripeRefundId?: string; // Stripe refund ID
  sellerStripeAccountId?: string; // Seller's Stripe Connect account ID (for escrow transfers)
  releasedBy?: string; // Admin UID who released the payment
  releasedAt?: Date; // When payment was released
  refundedBy?: string; // Admin UID who processed the refund
  refundedAt?: Date; // When refund was processed
  refundReason?: string; // Reason for refund
  refundAmount?: number; // Partial refund amount (if applicable)
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  
  // Escrow workflow fields
  paymentMethod?: OrderPaymentMethod; // How buyer paid (card vs bank rails)
  paidAt?: Date; // When payment was confirmed/settled into platform (card: immediate; bank/wire: async)
  disputeDeadlineAt?: Date; // Deadline for buyer to dispute
  deliveredAt?: Date; // When seller marked as delivered
  /**
   * @deprecated Prefer buyerConfirmedAt/buyerAcceptedAt.
   * Legacy field used by older UI code paths.
   */
  acceptedAt?: Date; // When buyer accepted/received (legacy)
  buyerConfirmedAt?: Date; // When buyer confirms receipt (canonical)
  releaseEligibleAt?: Date; // When order becomes eligible for admin release (computed server-side)
  disputedAt?: Date; // When buyer opened dispute
  disputeReason?: string; // Reason for dispute (legacy, string-based)
  disputeNotes?: string; // Additional dispute details (used for both regular and protected disputes)
  deliveryProofUrls?: string[]; // Optional delivery proof images/links
  adminHold?: boolean; // Admin flag to prevent auto-release
  adminHoldReason?: string; // Reason for admin hold
  adminActionNotes?: Array<{
    reason: string;
    notes?: string;
    actorUid: string;
    createdAt: Date;
    action: string;
  }>; // Audit trail of admin actions
  lastUpdatedByRole?: 'buyer' | 'seller' | 'admin'; // Who last updated this order
  
  // Protected Transaction fields
  deliveryConfirmedAt?: Date; // When delivery was confirmed (admin/ops)
  protectionStartAt?: Date; // When protection window starts
  protectionEndsAt?: Date; // When protection window ends
  buyerAcceptedAt?: Date; // When buyer accepted early (releases funds)
  disputeOpenedAt?: Date; // When buyer opened a protected transaction dispute
  disputeReasonV2?: DisputeReason; // Protected transaction dispute reason (v2 enum-based)
  disputeStatus?: DisputeStatus; // Protected transaction dispute status
  /**
   * Legacy/alternate protected dispute status field used by some UI helpers.
   * Prefer `disputeStatus`.
   */
  protectedDisputeStatus?: DisputeStatus;
  disputeEvidence?: DisputeEvidence[]; // Evidence uploaded for dispute
  payoutHoldReason?: PayoutHoldReason; // Why payout is held
  protectedTransactionDaysSnapshot?: 7 | 14 | null; // Snapshot of listing protection days at purchase
  protectedTermsVersion?: string; // Snapshot of terms version at purchase
  
  // Compliance fields for orders
  transferPermitStatus?: 'none' | 'requested' | 'uploaded' | 'approved' | 'rejected'; // TPWD transfer approval status
  transferPermitRequired?: boolean; // Whether transfer permit is required for this order

  // Chargeback tracking (optional; used for payout hold logic)
  /**
   * Stripe dispute/chargeback safety flag (normalized in Stripe webhooks).
   *
   * Phase 2D requires that payouts are never released while a chargeback is open.
   * We normalize disparate Stripe statuses into a simple set:
   * - open: any in-progress dispute status
   * - won / lost: terminal outcomes
   *
   * Back-compat: older values like 'needs_response' may still appear on historical orders.
   */
  chargebackStatus?: 'open' | 'active' | 'funds_withdrawn' | 'won' | 'lost' | 'warning_needs_response' | 'needs_response' | 'unknown';
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
  endingSoon?: boolean; // Ending within 24 hours
  newlyListed?: boolean; // Listed within 7 days
  featured?: boolean; // Featured listings only
}

// User Profile Types
export type UserRole = 'user' | 'admin' | 'super_admin';

export interface UserProfile {
  userId: string; // Firebase Auth UID
  email: string;
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  emailVerified: boolean;
  role?: UserRole; // User role: 'user' (default), 'admin', 'super_admin'
  superAdmin?: boolean; // Legacy super admin flag (deprecated - use role instead)
  profileComplete?: boolean; // Flag to track if profile completion modal was shown/completed
  /**
   * Exposure Plans tier (single source of truth).
   * NOTE: This tier is for exposure/badges only and does NOT imply compliance approval.
   */
  subscriptionTier?: 'standard' | 'priority' | 'premier';
  /**
   * @deprecated Legacy field. Still read for backward compatibility.
   * Historically: 'free' | 'pro' | 'elite'
   */
  subscriptionPlan?: string;
  stripeCustomerId?: string; // Stripe Customer ID for subscriptions
  stripeSubscriptionId?: string; // Active Stripe Subscription ID
  subscriptionStatus?: 'active' | 'past_due' | 'canceled' | 'trialing' | 'unpaid' | null; // Subscription status from Stripe
  subscriptionCurrentPeriodEnd?: Date; // Current billing period end date
  subscriptionCancelAtPeriodEnd?: boolean; // Whether subscription is set to cancel at period end
  adminPlanOverride?: string; // Admin override plan (legacy). Maps into subscriptionTier.
  /**
   * @deprecated Fee overrides are not used in the Exposure Plans model (marketplace fee is flat).
   * Kept only for backward compatibility with older data.
   */
  adminFeeOverride?: number;
  adminOverrideReason?: string; // Reason for admin override
  adminOverrideBy?: string; // Admin UID who set override
  adminOverrideAt?: Date; // When override was set
  
  // Extended Profile Data
  profile?: {
    fullName: string;
    businessName?: string;
    bio?: string;
    location: {
      city: string;
      state: string; // Required for TX-only animal transactions
      zip: string;
      address?: string;
    };
    preferences: {
      verification: boolean;
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
  
  // Stripe Connect Fields
  stripeAccountId?: string; // Stripe Connect Express account ID
  stripeOnboardingStatus?: 'not_started' | 'pending' | 'complete'; // Onboarding status
  chargesEnabled?: boolean; // Can accept payments
  payoutsEnabled?: boolean; // Can receive payouts
  stripeDetailsSubmitted?: boolean; // Has submitted required details
  
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  
  // Seller Stats (tied to on-platform transactions)
  completedSalesCount?: number; // Number of completed on-platform transactions
  totalListingsCount?: number; // Total listings created
  completionRate?: number; // completedSalesCount / totalListingsCount (percentage)
  verifiedTransactionsCount?: number; // Same as completedSalesCount for now
}

// Message Thread Types
export type NotificationType = 
  | 'message_received'
  | 'bid_received'
  | 'bid_outbid'
  | 'order_created'
  | 'order_paid'
  | 'order_completed'
  | 'order_disputed'
  | 'listing_approved'
  | 'listing_rejected'
  | 'payout_released'
  | 'compliance_approved'
  | 'compliance_rejected';

export interface Notification {
  id: string;
  userId: string; // Recipient user ID
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  // Context data for navigation/actions
  linkUrl?: string; // URL to navigate to when clicked
  linkLabel?: string; // Label for the link
  // Entity references
  listingId?: string;
  orderId?: string;
  threadId?: string;
  bidId?: string;
  // Metadata
  metadata?: Record<string, any>;
}

export interface MessageThread {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  unreadCount?: number; // Per participant
  buyerUnreadCount?: number;
  sellerUnreadCount?: number;
  flagged?: boolean; // Flagged for admin review
  violationCount?: number; // Total violations detected
  archived?: boolean;
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  listingId: string;
  body: string; // Sanitized body (what user sees)
  originalBody?: string; // Original body (stored only if needed for admin review)
  createdAt: Date;
  readAt?: Date;
  flagged?: boolean; // Flagged for admin review
  wasRedacted?: boolean; // Whether this message was sanitized
  violationCount?: number; // Number of violations detected
  detectedViolations?: {
    phone: boolean;
    email: boolean;
    paymentKeywords: string[];
  };
}

// Document Types (for permits, CVIs, etc.)
export type DocumentType = 
  | 'TPWD_BREEDER_PERMIT'
  | 'TPWD_TRANSFER_APPROVAL'
  | 'DELIVERY_PROOF'
  | 'TAHC_CVI'
  | 'BRAND_INSPECTION'
  | 'TITLE'
  | 'BILL_OF_SALE'
  | 'HEALTH_CERTIFICATE'
  | 'OTHER';

export type DocumentStatus = 'uploaded' | 'verified' | 'rejected';

export interface ComplianceDocument {
  id: string;
  type: DocumentType;
  documentUrl: string; // Firebase Storage URL
  permitNumber?: string; // Permit/license number if applicable
  issuedBy?: string; // Issuing authority
  issuedAt?: Date; // Issue date
  expiresAt?: Date; // Expiration date if applicable
  status: DocumentStatus;
  verifiedBy?: string; // Admin UID who verified
  verifiedAt?: Date; // When verified
  rejectionReason?: string; // Reason if rejected
  uploadedBy: string; // User UID who uploaded
  uploadedAt: Date; // When uploaded
  metadata?: Record<string, any>; // Additional metadata
}
