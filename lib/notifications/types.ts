
/**
 * Unified Notification Event Types
 *
 * These are canonical "facts" emitted by the app. They are later fanned out into:
 * - in-app notifications
 * - email jobs
 * - push jobs
 * - (optional) sms jobs
 */

export const NOTIFICATION_EVENT_TYPES = [
  // AUCTIONS
  'Auction.WatchStarted',
  'Auction.HighBidder',
  'Auction.Outbid',
  'Auction.EndingSoon',
  'Auction.Won',
  'Auction.Lost',
  'Auction.BidReceived',
  'Bid.Placed',

  // LISTINGS (seller-facing moderation outcomes)
  'Listing.Approved',
  'Listing.Rejected',
  'Listing.ComplianceApproved',
  'Listing.ComplianceRejected',

  // ORDERS / PAYOUTS
  'Order.Confirmed',
  'Order.Received',
  'Order.Preparing',
  'Order.InTransit',
  'Order.Delivered',
  'Order.DeliveryConfirmed',
  'Order.Accepted',
  'Order.DeliveryCheckIn',
  'Order.DeliveryScheduled', // Seller proposed/scheduled delivery (SELLER_TRANSPORT)
  'Order.DeliveryAgreed', // Buyer agreed to delivery window (SELLER_TRANSPORT)
  'Order.DeliveryAddressSet', // Buyer set delivery address; seller can now propose date (SELLER_TRANSPORT)
  'Order.DeliveryTrackingStarted', // Seller started live delivery tracking (buyer can watch map)
  'Order.DeliveryTrackingStopped', // Seller stopped tracking or marked delivered
  'Order.PickupReady', // Seller set pickup info (BUYER_TRANSPORT)
  'Order.PickupWindowSelected', // Buyer selected pickup window (BUYER_TRANSPORT)
  'Order.PickupWindowAgreed', // Seller agreed to pickup window (BUYER_TRANSPORT)
  'Order.PickupConfirmed', // Buyer confirmed pickup
  'Order.ReceiptConfirmed', // Buyer confirmed receipt (SELLER_TRANSPORT)
  'Order.FinalPaymentDue', // Buyer has balance due on delivery – show "Pay now" in To Do
  'Order.FinalPaymentConfirmed', // Buyer paid final balance (deposit flow); notify seller
  'Order.SlaApproaching', // NEW: SLA deadline approaching reminder
  'Order.SlaOverdue', // NEW: SLA deadline passed
  'Order.TransferComplianceRequired', // NEW: Regulated whitetail - compliance gate activated
  'Order.ComplianceBuyerConfirmed', // NEW: Buyer confirmed TPWD transfer compliance
  'Order.ComplianceSellerConfirmed', // NEW: Seller confirmed TPWD transfer compliance
  'Order.ComplianceUnlocked', // NEW: Both parties confirmed - fulfillment unlocked
  'Payout.Released',
  'Review.Request',
  'Review.Received', // Seller notified when a buyer leaves a review

  // ONBOARDING / TRUST
  'User.Welcome',
  'User.ProfileIncompleteReminder',

  // MARKETING (opt-in only)
  'Marketing.WeeklyDigest',
  'Marketing.SavedSearchAlert',

  // (Existing repo behavior) MESSAGES
  'Message.Received',

  // OFFERS (Best Offer)
  'Offer.Submitted',
  'Offer.Received',
  'Offer.Countered',
  'Offer.Accepted',
  'Offer.Declined',
  'Offer.Expired',

  // ADMIN (ops / moderation)
  'Admin.Listing.Submitted',
  'Admin.Listing.ComplianceReviewRequired',
  'Admin.Listing.AdminApprovalRequired',
  'Admin.Listing.Approved',
  'Admin.Listing.Rejected',
  'Admin.Order.DisputeOpened',
  'Admin.BreederPermit.Submitted',
  'Admin.Support.TicketSubmitted',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export type NotificationEntityType = 'listing' | 'order' | 'user' | 'message_thread' | 'system';

export type NotificationChannel = 'inApp' | 'email' | 'push' | 'sms';

export type NotificationUrgency = 'low' | 'normal' | 'high' | 'critical';

export type AuctionEndingSoonThreshold = '24h' | '1h' | '10m' | '2m';

// ------------------------
// Payloads (strict union)
// ------------------------

export type NotificationEventPayload =
  | {
      type: 'Auction.WatchStarted';
      listingId: string;
      listingTitle: string;
      listingUrl: string;
      endsAt?: string;
    }
  | {
      type: 'Auction.HighBidder';
      listingId: string;
      listingTitle: string;
      listingUrl: string;
      // Visible current price (may not equal max bid in proxy bidding)
      yourBidAmount: number;
      currentBidAmount: number;
      // New: user's max bid (helps explain why current price may not move)
      yourMaxBidAmount?: number;
      // New: whether the visible price changed due to this action
      priceMoved?: boolean;
      endsAt?: string;
    }
  | {
      type: 'Auction.Outbid';
      listingId: string;
      listingTitle: string;
      listingUrl: string;
      newHighBidAmount: number;
      // New: the outbid user's max bid (for proxy bidding clarity)
      yourMaxBidAmount?: number;
      endsAt?: string;
    }
  | {
      type: 'Auction.EndingSoon';
      listingId: string;
      listingTitle: string;
      listingUrl: string;
      threshold: AuctionEndingSoonThreshold;
      endsAt: string;
      currentBidAmount?: number;
    }
  | {
      type: 'Auction.Won';
      listingId: string;
      listingTitle: string;
      listingUrl: string;
      winningBidAmount: number;
      endsAt?: string;
      checkoutUrl?: string;
    }
  | {
      type: 'Auction.Lost';
      listingId: string;
      listingTitle: string;
      listingUrl: string;
      finalBidAmount?: number;
      endsAt?: string;
    }
  | {
      type: 'Auction.BidReceived';
      listingId: string;
      listingTitle: string;
      listingUrl: string;
      bidAmount: number;
    }
  | {
      type: 'Bid.Placed';
      listingId: string;
      listingTitle: string;
      listingUrl: string;
      bidAmount: number;
      currentBidAmount: number;
      isHighBidder: boolean;
      endsAt?: string;
    }
  | {
      type: 'Listing.Approved';
      listingId: string;
      listingTitle: string;
      listingUrl: string;
    }
  | {
      type: 'Listing.Rejected';
      listingId: string;
      listingTitle: string;
      editUrl: string;
      reason?: string;
    }
  | {
      type: 'Listing.ComplianceApproved';
      listingId: string;
      listingTitle: string;
      listingUrl: string;
      published?: boolean;
    }
  | {
      type: 'Listing.ComplianceRejected';
      listingId: string;
      listingTitle: string;
      editUrl: string;
      reason: string;
    }
  | {
      type: 'Order.Confirmed';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      amount: number;
      paymentMethod?: string;
    }
  | {
      type: 'Order.Received';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      amount: number;
    }
  | {
      type: 'Order.Preparing';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
    }
  | {
      type: 'Order.InTransit';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      /** Optional: when set, in-app copy can mention paying remaining balance on delivery */
      finalPaymentAmount?: number;
    }
  | {
      type: 'Order.Delivered';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
    }
  | {
      type: 'Order.DeliveryConfirmed';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      deliveryDate: string;
    }
  | {
      type: 'Order.Accepted';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      amount: number;
    }
  | {
      type: 'Order.DeliveryCheckIn';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      daysSinceDelivery: number;
    }
  | {
      type: 'Order.DeliveryScheduled';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      eta?: string; // ISO 8601 (legacy)
      proposedWindows?: Array<{ start: string; end: string }>; // ISO 8601 strings
      message?: string;
    }
  | {
      type: 'Order.DeliveryAgreed';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      windowStart: string;
      windowEnd: string;
    }
  | {
      type: 'Order.DeliveryAddressSet';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
    }
  | {
      type: 'Order.DeliveryTrackingStarted';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
    }
  | {
      type: 'Order.DeliveryTrackingStopped';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      delivered?: boolean;
    }
  | {
      type: 'Order.PickupReady';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      location: string;
    }
  | {
      type: 'Order.PickupWindowSelected';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      windowStart: string; // ISO 8601 datetime
      windowEnd: string; // ISO 8601 datetime
    }
  | {
      type: 'Order.PickupWindowAgreed';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      windowStart: string;
      windowEnd: string;
    }
  | {
      type: 'Order.PickupConfirmed';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
    }
  | {
      type: 'Order.ReceiptConfirmed';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
    }
  | {
      type: 'Order.FinalPaymentDue';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      amount: number;
    }
  | {
      type: 'Order.FinalPaymentConfirmed';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      amount: number;
    }
  | {
      type: 'Review.Request';
      orderId: string;
      listingId: string;
      listingTitle: string;
      sellerId: string;
      sellerDisplayName: string;
      reviewUrl: string;
    }
  | {
      type: 'Review.Received';
      orderId: string;
      listingId: string;
      listingTitle: string;
      rating: number;
      reviewText: string | null;
      reputationUrl: string;
    }
  | {
      type: 'Order.SlaApproaching';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      hoursRemaining: number;
      deadline: string; // ISO 8601 datetime
    }
  | {
      type: 'Order.SlaOverdue';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
      hoursOverdue: number;
      deadline: string; // ISO 8601 datetime
    }
  | {
      type: 'Order.TransferComplianceRequired';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
    }
  | {
      type: 'Order.ComplianceBuyerConfirmed';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
    }
  | {
      type: 'Order.ComplianceSellerConfirmed';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
    }
  | {
      type: 'Order.ComplianceUnlocked';
      orderId: string;
      listingId: string;
      listingTitle: string;
      orderUrl: string;
    }
  | {
      type: 'Payout.Released';
      orderId: string;
      listingId: string;
      listingTitle: string;
      amount: number;
      transferId: string;
      payoutDate: string;
    }
  | {
      type: 'User.Welcome';
      userId: string;
      displayName?: string;
      dashboardUrl: string;
    }
  | {
      type: 'User.ProfileIncompleteReminder';
      userId: string;
      displayName?: string;
      settingsUrl: string;
      missingFields?: string[];
    }
  | {
      type: 'Marketing.WeeklyDigest';
      userId: string;
      listings: Array<{ listingId: string; title: string; url: string; price?: number; endsAt?: string }>;
      unsubscribeUrl?: string;
      channels?: { email?: boolean };
    }
  | {
      type: 'Marketing.SavedSearchAlert';
      userId: string;
      queryName: string;
      resultsCount: number;
      searchUrl: string;
      unsubscribeUrl?: string;
      channels?: { inApp?: boolean; push?: boolean; email?: boolean };
    }
  | {
      type: 'Message.Received';
      threadId: string;
      listingId: string;
      listingTitle: string;
      listingUrl: string;
      threadUrl: string;
      senderRole: 'buyer' | 'seller';
      preview?: string;
    }
  | {
      type: 'Offer.Submitted';
      offerId: string;
      listingId: string;
      listingTitle: string;
      offerUrl: string;
      amount: number;
      expiresAt?: string;
    }
  | {
      type: 'Offer.Received';
      offerId: string;
      listingId: string;
      listingTitle: string;
      offerUrl: string;
      amount: number;
      expiresAt?: string;
    }
  | {
      type: 'Offer.Countered';
      offerId: string;
      listingId: string;
      listingTitle: string;
      offerUrl: string;
      amount: number;
      expiresAt?: string;
    }
  | {
      type: 'Offer.Accepted';
      offerId: string;
      listingId: string;
      listingTitle: string;
      offerUrl: string;
      amount: number;
    }
  | {
      type: 'Offer.Declined';
      offerId: string;
      listingId: string;
      listingTitle: string;
      offerUrl: string;
    }
  | {
      type: 'Offer.Expired';
      offerId: string;
      listingId: string;
      listingTitle: string;
      offerUrl: string;
    }
  | {
      type: 'Admin.Listing.Submitted';
      listingId: string;
      listingTitle: string;
      sellerId: string;
      sellerName?: string;
      category?: string;
      listingType?: string;
      complianceStatus?: string;
      pendingReason?: 'admin_approval' | 'compliance_review' | 'unknown';
      listingUrl: string;
      adminQueueUrl: string;
      adminComplianceUrl?: string;
    }
  | {
      type: 'Admin.Listing.ComplianceReviewRequired';
      listingId: string;
      listingTitle: string;
      sellerId: string;
      sellerName?: string;
      complianceStatus?: string;
      listingUrl: string;
      adminComplianceUrl: string;
    }
  | {
      type: 'Admin.Listing.AdminApprovalRequired';
      listingId: string;
      listingTitle: string;
      sellerId: string;
      sellerName?: string;
      listingUrl: string;
      adminQueueUrl: string;
    }
  | {
      type: 'Admin.Listing.Approved';
      listingId: string;
      listingTitle: string;
      sellerId: string;
      sellerName?: string;
      listingUrl: string;
      adminQueueUrl: string;
    }
  | {
      type: 'Admin.Listing.Rejected';
      listingId: string;
      listingTitle: string;
      sellerId: string;
      sellerName?: string;
      reason?: string;
      adminQueueUrl: string;
    }
  | {
      type: 'Admin.Order.DisputeOpened';
      orderId: string;
      listingId?: string;
      listingTitle?: string;
      buyerId: string;
      disputeType: 'order_dispute' | 'protected_transaction_dispute';
      reason: string;
      adminOpsUrl: string;
    }
  | {
      type: 'Admin.BreederPermit.Submitted';
      sellerId: string;
      sellerName?: string;
      permitNumber?: string | null;
      storagePath: string;
      documentUrl?: string | null;
      adminComplianceUrl: string;
    }
  | {
      type: 'Admin.Support.TicketSubmitted';
      ticketId: string;
      subject: string;
      userId: string;
      userName: string;
      category?: string;
      adminSupportUrl: string;
    };

// ------------------------
// Firestore docs
// ------------------------

export type EventStatus = 'pending' | 'processed' | 'failed';

export interface NotificationEventDoc {
  id: string;
  type: NotificationEventType;
  createdAt: any; // Firestore Timestamp (admin/client differ)
  actorId: string | null;
  entityType: NotificationEntityType;
  entityId: string;
  targetUserIds: string[];
  payload: NotificationEventPayload;
  status: EventStatus;
  processing: {
    attempts: number;
    lastAttemptAt: any | null; // Firestore Timestamp
    error?: string;
  };
  eventKey: string;
  test?: boolean;
}

export type JobStatus = 'queued' | 'processing' | 'sent' | 'failed' | 'skipped';

export interface EmailJobDoc {
  id: string;
  eventId: string;
  userId: string;
  toEmail: string;
  template: string;
  templatePayload: Record<string, any>;
  status: JobStatus;
  createdAt: any;
  attempts: number;
  lastAttemptAt: any | null;
  error?: string;
  test?: boolean;
}

export interface PushJobDoc {
  id: string;
  eventId: string;
  userId: string;
  token: string;
  platform?: string;
  payload: {
    title: string;
    body: string;
    deepLinkUrl?: string;
    notificationType: string;
    entityId?: string;
  };
  status: JobStatus;
  createdAt: any;
  attempts: number;
  lastAttemptAt: any | null;
  error?: string;
  test?: boolean;
}

export interface SmsJobDoc {
  id: string;
  eventId: string;
  userId: string;
  toPhone: string;
  body: string;
  status: JobStatus;
  createdAt: any;
  attempts: number;
  lastAttemptAt: any | null;
  error?: string;
  test?: boolean;
}

