// Marketplace Types for Wildlife Exchange

export type ListingType = 'auction' | 'fixed' | 'classified';

export type ListingCategory = 
  | 'whitetail_breeder'
  | 'wildlife_exotics' 
  | 'horse_equestrian'
  | 'cattle_livestock' 
  | 'ranch_equipment'
  | 'ranch_vehicles'
  | 'hunting_outfitter_assets'
  | 'sporting_working_dogs';

// NOTE: Backwards-compatible.
// - Historically we used `expired` (primarily for auctions).
// - New duration model introduces `ended` + `endedReason` for all listing types.
export type ListingStatus = 'draft' | 'pending' | 'active' | 'sold' | 'ended' | 'expired' | 'removed';

// eBay-style duration choices (hard cap: 10 days)
export type ListingDurationDays = 1 | 3 | 5 | 7 | 10;

export type ListingEndedReason = 'expired' | 'sold' | 'manual_end';

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
  // For filtering, we prefer a controlled value (dropdown), but keep free-text compatible.
  breed: string; // Required (either a known option value or a free-text value from older docs)
  breedOther?: string; // Optional: if breed === 'other', allow user to specify
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

export interface HorseAttributes {
  speciesId: 'horse';
  sex: 'stallion' | 'mare' | 'gelding' | 'unknown';
  /**
   * Age in years (number). Kept as `number | string` for backward compatibility with legacy docs.
   */
  age?: number | string;
  registered: boolean;
  registrationOrg?: string;
  registrationNumber?: string;
  identification: {
    microchip?: string;
    brand?: string;
    tattoo?: string;
    markings?: string;
  };
  disclosures: {
    identificationDisclosure: boolean;
    healthDisclosure: boolean;
    transportDisclosure: boolean;
    titleOrLienDisclosure: boolean;
  };
  quantity: number; // Required, default 1
}

export type EquipmentType = 
  | 'tractor'
  | 'trailer'
  | 'stock_trailer'
  | 'gooseneck_trailer'
  | 'flatbed_trailer'
  | 'utility_trailer'
  | 'dump_trailer'
  | 'horse_trailer'
  | 'equipment_trailer'
  | 'utv'
  | 'atv'
  | 'truck'
  | 'skidsteer'
  | 'attachment'
  | 'implement'
  | 'baler'
  | 'brush_cutter'
  | 'shredder'
  | 'plow'
  | 'disc'
  | 'sprayer'
  | 'post_hole_digger'
  | 'auger'
  | 'grapple'
  | 'bucket'
  | 'forks'
  | 'feeder'
  | 'fencing'
  | 'blind'
  | 'camera_system'
  | 'surveillance_system'
  | 'thermal_optics'
  | 'water_system'
  | 'other';

export interface EquipmentAttributes {
  equipmentType: EquipmentType; // Required enum
  make?: string;
  makeOther?: string;
  model?: string;
  year?: number;
  hours?: number;
  condition: 'new' | 'excellent' | 'good' | 'fair' | 'for_parts'; // Required
  serialNumber?: string; // Optional
  hasTitle?: boolean; // Required if equipmentType in [utv, atv, truck, trailer]
  vinOrSerial?: string; // Required if equipmentType in [utv, atv, truck, trailer]
  quantity: number; // Required, default 1
}

export interface SportingWorkingDogAttributes {
  speciesId: 'dog';
  sex: 'male' | 'female' | 'unknown';
  age: number | string;
  breed: string; // Controlled option value or legacy free-text
  breedOther?: string; // Optional: if breed === 'other', allow user to specify
  trainingDescription?: string;
  identificationDisclosure: boolean;
  healthDisclosure: boolean;
  transportDisclosure: boolean;
  quantity: number; // Required, default 1
}

// Union type for category-specific attributes
export type ListingAttributes =
  | WhitetailBreederAttributes
  | WildlifeAttributes
  | CattleAttributes
  | HorseAttributes
  | SportingWorkingDogAttributes
  | EquipmentAttributes;

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
    /**
     * Focal point used by UI to smart-crop this photo on cards (`object-position`).
     * Normalized coordinates (0..1).
     */
    focalPoint?: { x: number; y: number };
    /**
     * Optional UI zoom factor (>=1) for thumbnail rendering (pairs with focalPoint).
     * Does not change the underlying image bytes.
     */
    cropZoom?: number;
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
     * Public seller avatar URL (copied at publish time).
     * Must NOT contain private data; used for browse/listing surfaces without requiring `/users/{uid}` reads.
     */
    photoURL?: string;
    /**
     * Phase 3A (A4): public trust snapshot for anon-safe trust surfaces.
     * These values are copied at publish time (server-side) to avoid requiring reads of /users/{uid}.
     */
    completedSalesCount?: number;
    badges?: string[];
  };

  /**
   * Seller tier (Seller Tiers).
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
    /**
     * Optional: seller indicates they may offer delivery themselves.
     * Buyer and seller still coordinate directly; the platform does not arrange transport.
     * @deprecated Use transportOption instead
     */
    sellerOffersDelivery?: boolean;
  };
  
  /**
   * Transport option: Who handles transportation
   * - SELLER_TRANSPORT: Seller will deliver (seller handles transport)
   * - BUYER_TRANSPORT: Buyer must handle pickup/transport
   * Required for all listings (enforced at creation)
   */
  transportOption?: 'SELLER_TRANSPORT' | 'BUYER_TRANSPORT';
  
  // Category-specific attributes (replaces old metadata)
  subcategory?: string; // Optional subcategory within the 3 top categories
  attributes: ListingAttributes; // Category-specific structured attributes

  /**
   * Multi-quantity inventory (optional; back-compat):
   * - If absent, fall back to `attributes.quantity` (default 1).
   * - `quantityAvailable` is server-maintained and represents currently available units for purchase.
   */
  quantityTotal?: number;
  quantityAvailable?: number;
  
  // Auction-specific
  endsAt?: Date; // Auction end time

  /**
   * eBay-style universal listing duration model.
   * Backwards compatible: older docs may not have these fields.
   *
   * - startAt: when the listing became active (server time)
   * - endAt: startAt + durationDays (server time)
   * - durationDays: 1|3|5|7|10
   */
  durationDays?: ListingDurationDays;
  startAt?: Date;
  endAt?: Date;
  endedAt?: Date | null;
  endedReason?: ListingEndedReason;

  /**
   * Sold listing metadata (public-safe; eBay-style historical market data).
   * Backwards compatible: older sold listings may not have these fields.
   */
  soldAt?: Date | null;
  soldPriceCents?: number | null;
  saleType?: 'auction' | 'offer' | 'buy_now' | 'classified';
  
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

  // Moderation lifecycle (admin approval / rejection)
  pendingReason?: 'admin_approval' | 'compliance_review' | null;
  rejectedAt?: Date | null;
  rejectedBy?: string;
  rejectionReason?: string;
  approvedAt?: Date | null;
  approvedBy?: string;

  // Resubmission tracking (one resubmit per rejection)
  resubmittedAt?: Date | null;
  resubmittedForRejectionAt?: Date | null;
  resubmissionCount?: number;
  
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
  
  // AI Admin Summary (admin-only, read-only, optional)
  aiAdminSummary?: string | null; // AI-generated summary for admin review
  aiAdminSummaryAt?: Date | null; // When summary was generated
  aiAdminSummaryModel?: string | null; // OpenAI model used (e.g., "gpt-4o-mini")

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

  /**
   * Purchase reservation (server-only; prevents double-buy during checkout / async payments).
   * - Set when a buyer starts checkout (card/ACH/wire) to lock the listing.
   * - Cleared when checkout expires/cancels, or when the listing is marked sold.
   */
  purchaseReservedByOrderId?: string;
  purchaseReservedAt?: Date;
  purchaseReservedUntil?: Date;
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
// NEW: Fulfillment-based transaction status (replaces escrow statuses)
export type TransactionStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'AWAITING_TRANSFER_COMPLIANCE'  // Regulated whitetail: awaiting TPWD transfer permit confirmation
  | 'FULFILLMENT_REQUIRED'
  | 'READY_FOR_PICKUP'        // BUYER_TRANSPORT
  | 'PICKUP_SCHEDULED'        // BUYER_TRANSPORT (optional)
  | 'PICKED_UP'               // BUYER_TRANSPORT
  | 'DELIVERY_SCHEDULED'      // SELLER_TRANSPORT
  | 'OUT_FOR_DELIVERY'        // SELLER_TRANSPORT (optional)
  | 'DELIVERED_PENDING_CONFIRMATION' // SELLER_TRANSPORT
  | 'COMPLETED'
  | 'DISPUTE_OPENED'
  | 'SELLER_NONCOMPLIANT'
  | 'REFUNDED'
  | 'CANCELLED';

// LEGACY: Keep old OrderStatus for backward compatibility during migration
export type OrderStatus =
  | 'pending'
  // High-ticket rails (async / offline-like)
  | 'awaiting_bank_transfer'
  | 'awaiting_wire'
  // Canonical paid+held (funds in platform, not released) - DEPRECATED: Use TransactionStatus instead
  | 'paid_held'
  // Legacy paid (still present in older docs) - DEPRECATED: Use TransactionStatus.PAID instead
  | 'paid'
  | 'in_transit'
  | 'delivered'
  | 'buyer_confirmed'
  // Legacy accepted (still present in older docs) - DEPRECATED
  | 'accepted'
  | 'ready_to_release' // DEPRECATED: No longer used - seller paid immediately
  | 'disputed'
  | 'completed'
  | 'refunded'
  | 'cancelled';

export type DisputeReason = 'death' | 'serious_illness' | 'injury' | 'escape' | 'wrong_animal';

export type DisputeStatus = 'none' | 'open' | 'needs_evidence' | 'under_review' | 'resolved_refund' | 'resolved_partial_refund' | 'resolved_release' | 'cancelled';

export type PayoutHoldReason =
  | 'none'
  | 'protection_window'
  | 'dispute_open'
  | 'admin_hold'
  | 'chargeback'
  // Compliance-driven payout holds (policy-based; written server-side)
  | 'MISSING_TAHC_CVI'
  | 'EXOTIC_CERVID_REVIEW_REQUIRED'
  | 'ESA_REVIEW_REQUIRED'
  | 'OTHER_EXOTIC_REVIEW_REQUIRED';

export type OrderPaymentMethod = 'card' | 'ach_debit' | 'bank_transfer' | 'wire';

export interface DisputeEvidence {
  type: 'photo' | 'video' | 'vet_report' | 'delivery_doc' | 'tag_microchip';
  url: string;
  uploadedAt: Date;
}

// ============================================
// ORDER SNAPSHOTS (FAST PURCHASES LIST VIEW)
// ============================================
export interface OrderListingSnapshot {
  listingId: string;
  title: string;
  type?: ListingType;
  category?: ListingCategory;
  coverPhotoUrl?: string;
  locationLabel?: string; // e.g. "Uvalde, TX"
}

export interface OrderSellerSnapshot {
  sellerId: string;
  displayName: string;
  photoURL?: string;
}

// ============================================
// ORDER TIMELINE (SERVER-AUTHORED)
// ============================================
export type OrderTimelineActor = 'system' | 'buyer' | 'seller' | 'admin' | 'tpwd' | 'facility';
export type OrderTimelineVisibility = 'buyer' | 'seller' | 'internal';

export type OrderTimelineEventType =
  | 'ORDER_PLACED'
  | 'CHECKOUT_SESSION_CREATED'
  | 'PAYMENT_AUTHORIZED'
  | 'FUNDS_HELD'
  | 'COMPLIANCE_REQUIRED'
  | 'TRANSFER_PERMIT_REQUESTED'
  | 'TRANSFER_PERMIT_SUBMITTED'
  | 'TRANSFER_PERMIT_APPROVED'
  | 'SELLER_PREPARING'
  | 'SELLER_SHIPPED'
  | 'DELIVERED'
  | 'BUYER_CONFIRMED'
  | 'FUNDS_RELEASED'
  | 'DISPUTE_OPENED'
  | 'DISPUTE_RESOLVED';

export interface OrderTimelineEvent {
  id: string; // deterministic for idempotency
  type: OrderTimelineEventType;
  label: string;
  timestamp: Date;
  actor: OrderTimelineActor;
  visibility?: OrderTimelineVisibility;
  meta?: Record<string, any>;
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
  /**
   * Multi-quantity purchases (optional; back-compat: defaults to 1).
   * For fixed-price listings, `unitPrice` is the per-unit price at time of checkout (snapshot).
   */
  quantity?: number;
  unitPrice?: number;
  status: OrderStatus; // Legacy status (for backward compatibility)
  /**
   * NEW: Fulfillment-based transaction status (replaces escrow statuses).
   * Seller is paid immediately upon successful payment; status only tracks fulfillment progress.
   */
  transactionStatus?: TransactionStatus;
  /**
   * Transport option: Who handles transportation
   * - SELLER_TRANSPORT: Seller will deliver (seller handles transport)
   * - BUYER_TRANSPORT: Buyer must handle pickup/transport
   * Inherited from listing at checkout time
   */
  transportOption?: 'SELLER_TRANSPORT' | 'BUYER_TRANSPORT';
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  /**
   * Stripe settlement visibility (server-authored via webhooks).
   * This is used by Admin Ops to show when funds become transferable.
   */
  stripeChargeId?: string;
  stripeBalanceTransactionId?: string;
  stripeBalanceTransactionStatus?: 'pending' | 'available' | string;
  stripeFundsAvailableOn?: Date;
  stripeTransferId?: string;
  stripeRefundId?: string; // Stripe refund ID
  sellerStripeAccountId?: string; // Seller's Stripe Connect account ID (for admin payout release transfers)
  releasedBy?: string; // Admin UID who released the payment
  releasedAt?: Date; // When payment was released
  refundedBy?: string; // Admin UID who processed the refund
  refundedAt?: Date; // When refund was processed
  refundReason?: string; // Reason for refund
  refundAmount?: number; // Partial refund amount (if applicable)
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  /**
   * Public-safe snapshots for fast order list rendering.
   * Written server-side at order creation (checkout create-session / webhook / wire intent).
   */
  listingSnapshot?: OrderListingSnapshot;
  sellerSnapshot?: OrderSellerSnapshot;
  timeline?: OrderTimelineEvent[];
  
  // Payment tracking (seller paid immediately via destination charge - no payout holds)
  paymentMethod?: OrderPaymentMethod; // How buyer paid (card vs bank rails)
  paidAt?: Date; // When payment was confirmed (seller already paid immediately via destination charge)
  disputeDeadlineAt?: Date; // Deadline for buyer to dispute (for internal enforcement only, does not affect Stripe payout)
  /**
   * Fulfillment progress markers (seller paid immediately - these only track fulfillment, not payout timing).
   */
  sellerPreparingAt?: Date; // Seller marked "preparing for delivery"
  inTransitAt?: Date; // Seller marked "in transit"
  deliveredAt?: Date; // When seller marked as delivered
  /**
   * @deprecated Prefer buyerConfirmedAt/buyerAcceptedAt.
   * Legacy field used by older UI code paths.
   */
  acceptedAt?: Date; // When buyer accepted/received (legacy)
  buyerConfirmedAt?: Date; // When buyer confirms receipt (canonical)
  
  // FULFILLMENT WORKFLOW FIELDS (replaces escrow/payout release logic)
  /**
   * Pickup workflow (BUYER_TRANSPORT)
   */
  pickup?: {
    location?: string;
    windows?: Array<{ start: Date; end: Date }>;
    selectedWindow?: { start: Date; end: Date };
    pickupCode?: string;
    confirmedAt?: Date;
    proofPhotos?: string[];
  };
  
  /**
   * Delivery workflow (SELLER_TRANSPORT)
   */
  delivery?: {
    eta?: Date;
    transporter?: { name?: string; phone?: string; plate?: string };
    proofUploads?: Array<{ type: string; url: string; uploadedAt: Date }>;
    deliveredAt?: Date;
    buyerConfirmedAt?: Date;
  };
  
  /**
   * Dispute/issue tracking
   */
  issues?: {
    openedAt?: Date;
    reason?: string;
    notes?: string;
    photos?: string[];
  };
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
  /**
   * Admin-only payout approval for policy-driven holds (exotics/cervids/ESA overlays).
   * Optional/back-compat: absence means "not approved".
   */
  adminPayoutApproval?: boolean;
  adminPayoutApprovalBy?: string;
  adminPayoutApprovalAt?: Date;
  protectedTransactionDaysSnapshot?: 7 | 14 | null; // Snapshot of listing protection days at purchase
  protectedTermsVersion?: string; // Snapshot of terms version at purchase
  
  // Compliance fields for orders
  transferPermitStatus?: 'none' | 'requested' | 'uploaded' | 'approved' | 'rejected'; // TPWD transfer approval status
  transferPermitRequired?: boolean; // Whether transfer permit is required for this order
  
  /**
   * TPWD Transfer Permit Compliance Confirmation (for regulated whitetail breeder buck transactions)
   * Both buyer and seller must confirm compliance before fulfillment can proceed.
   */
  complianceTransfer?: {
    buyerConfirmed: boolean;
    buyerConfirmedAt?: Date;
    buyerUploadUrl?: string; // Optional: buyer-uploaded permit document
    sellerConfirmed: boolean;
    sellerConfirmedAt?: Date;
    sellerUploadUrl?: string; // Optional: seller-uploaded permit document
    unlockedAt?: Date; // When both confirmations were received and fulfillment was unlocked
  };

  // Bill of Sale / Written Transfer (attestation timestamps; server-authored)
  billOfSaleGeneratedAt?: Date;
  billOfSaleBuyerSignedAt?: Date;
  billOfSaleBuyerSignedBy?: string;
  billOfSaleSellerSignedAt?: Date;
  billOfSaleSellerSignedBy?: string;

  // Order document compliance snapshot (server-computed)
  complianceDocsStatus?: {
    required: DocumentType[];
    provided: DocumentType[];
    missing: DocumentType[];
  };

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
  
  // AI Admin Summary (admin-only, read-only, optional)
  aiAdminSummary?: string | null; // AI-generated summary for admin review
  aiAdminSummaryAt?: Date | null; // When summary was generated
  aiAdminSummaryModel?: string | null; // OpenAI model used (e.g., "gpt-4o-mini")
  
  // AI Dispute Summary (admin-only, read-only, optional)
  aiDisputeSummary?: string | null; // AI-generated dispute summary for admin review
  aiDisputeFacts?: string[] | null; // Key facts / timeline bullets extracted from dispute
  aiDisputeReviewedAt?: Date | null; // When dispute summary was generated
  aiDisputeModel?: string | null; // OpenAI model used (e.g., "gpt-4o-mini")
  
  // Reminder tracking (optional, for automated reminder engine)
  lastStatusChangedAt?: Date; // Track when transactionStatus last changed (for stalled order detection)
  reminders?: {
    buyerLastAt?: Date; // Last reminder sent to buyer
    sellerLastAt?: Date; // Last reminder sent to seller
    buyerCount?: number; // Total reminders sent to buyer
    sellerCount?: number; // Total reminders sent to seller
  };
}

export interface FilterState {
  category?: ListingCategory;
  type?: ListingType;
  /**
   * Optional keyword query for Saved Searches.
   * NOTE: Browse currently stores the live query in component state, not in `filters`.
   * We keep this here so savedSearch criteria can include the typed query safely.
   */
  query?: string;
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
  sellerOffersDelivery?: boolean; // Seller offers delivery (seller-provided; platform does not arrange transport)
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
   * Seller tier (single source of truth).
   * NOTE: This tier is for placement/badges only and does NOT imply compliance approval.
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
   * @deprecated Fee overrides are not used in the Seller Tiers model (marketplace fee is flat).
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
      displayNamePreference?: 'personal' | 'business'; // Which name to show on listings/seller cards
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

  // Public-ish seller stats (non-sensitive). Some fields are derived server-side.
  sellerStats?: {
    followersCount?: number;
  };

  // Legal acceptance (server-authored)
  legal?: {
    tos?: { version: string; acceptedAt: Date };
    marketplacePolicies?: { version: string; acceptedAt: Date };
    buyerAcknowledgment?: { version: string; acceptedAt: Date };
    sellerPolicy?: { version: string; acceptedAt: Date };
  };
  
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  
  // Seller Stats (tied to on-platform transactions)
  completedSalesCount?: number; // Number of completed on-platform transactions
  totalListingsCount?: number; // Total listings created
  completionRate?: number; // completedSalesCount / totalListingsCount (percentage)
  verifiedTransactionsCount?: number; // Same as completedSalesCount for now
  
  // AI Admin Summary (admin-only, read-only, optional)
  aiAdminSummary?: string | null; // AI-generated summary for admin review
  aiAdminSummaryAt?: Date | null; // When summary was generated
  aiAdminSummaryModel?: string | null; // OpenAI model used (e.g., "gpt-4o-mini")
}

// ============================================
// SAVED SELLERS (FOLLOW SYSTEM)
// ============================================
export interface SavedSellerDoc {
  sellerId: string;
  followedAt: Date;

  sellerUsername: string; // e.g. "double7ranch" (may be empty if not set)
  sellerDisplayName: string;
  sellerPhotoURL?: string;

  ratingAverage: number;
  ratingCount: number;
  positivePercent: number;
  itemsSold: number;
}

// ============================================
// PUBLIC SELLER TRUST (BADGES)
// ============================================
export type SellerBadgeId =
  | 'verified_seller' // Stripe Verified (payouts enabled)
  | 'stripe_payouts_enabled'
  | 'stripe_payments_enabled'
  | 'identity_verified'
  | 'tpwd_breeder_permit_verified';

export interface PublicSellerTrust {
  userId: string;
  badgeIds: SellerBadgeId[];
  // Optional structured detail for specific badges (all public-safe)
  tpwdBreederPermit?: {
    status: 'verified' | 'rejected';
    verifiedAt?: Date;
    expiresAt?: Date;
  };
  stripe?: {
    onboardingStatus?: 'not_started' | 'pending' | 'complete' | string;
    payoutsEnabled?: boolean;
    chargesEnabled?: boolean;
    detailsSubmitted?: boolean;
    hasPendingRequirements?: boolean;
    updatedAt?: Date;
  };
  updatedAt: Date;
}

// Message Thread Types
export type NotificationType = 
  | 'message_received'
  | 'bid_received'
  | 'bid_outbid'
  // Best Offer (eBay-style)
  | 'offer_received'
  | 'offer_countered'
  | 'offer_accepted'
  | 'offer_declined'
  | 'offer_expired'
  | 'order_created'
  | 'order_paid'
  | 'order_completed'
  | 'order_disputed'
  | 'listing_approved'
  | 'listing_rejected'
  | 'payout_released'
  | 'compliance_approved'
  | 'compliance_rejected'
  // Admin notifications
  | 'admin_breeder_permit_submitted'
  | 'admin_listing_submitted'
  | 'admin_support_ticket_submitted';

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
  flagCount?: number;
  flaggedBy?: string[];
  flaggedAt?: Date;
  flaggedReason?: string;
  flaggedDetails?: string;

  moderationStatus?: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  adminReviewed?: boolean;
  adminReviewedBy?: string;
  adminReviewedAt?: Date;
  moderationNotes?: Array<{
    by: string;
    at: Date;
    text: string;
  }>;
  archived?: boolean;

  /**
   * App-like UX fields (optional; back-compat with older docs).
   * These are used for richer messaging behaviors: read state, typing indicators, and per-participant settings.
   */
  buyerLastReadAt?: Date;
  sellerLastReadAt?: Date;
  buyerTypingUntil?: Date;
  sellerTypingUntil?: Date;
  buyerMuted?: boolean;
  sellerMuted?: boolean;
  buyerPinned?: boolean;
  sellerPinned?: boolean;
}

export type MessageKind = 'text' | 'system' | 'offer_card' | 'order_card';

export type MessageAttachmentKind = 'image';

export interface MessageAttachment {
  id: string;
  kind: MessageAttachmentKind;
  url: string;
  contentType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
  name?: string;
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

  // Rich messaging (optional; back-compat)
  kind?: MessageKind;
  attachments?: MessageAttachment[];
  replyTo?: {
    messageId: string;
    senderId: string;
    bodyPreview?: string;
  };
  // Simple reactions model (optional): emoji -> list of userIds.
  reactions?: Record<string, string[]>;
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

// Knowledge Base Article Types
export type KBArticleAudience = 'buyer' | 'seller' | 'all';

export interface KnowledgeBaseArticle {
  id: string; // Document ID (same as slug for easy lookup)
  slug: string; // Unique, stable identifier (e.g., "getting-started-buying")
  title: string;
  content: string; // Markdown or plain text
  category: string; // e.g., "getting-started", "account", "listings", "bidding", "payments", etc.
  audience: KBArticleAudience[]; // Array of audiences this article targets
  tags: string[]; // Searchable tags
  enabled: boolean; // Whether article is active and searchable
  version: number; // Auto-incremented on each edit
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string; // Admin UID who created
  updatedBy?: string; // Admin UID who last updated
}
