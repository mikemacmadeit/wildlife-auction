import { FieldValue } from 'firebase-admin/firestore';
import type { NotificationCategory } from './rules';
import type { NotificationEventPayload, NotificationEventType, NotificationEntityType } from './types';

export interface UserNotificationDoc {
  id: string;
  userId: string;
  category: NotificationCategory;
  type: string; // UI-facing type string (kept flexible to avoid breaking existing unions)
  title: string;
  body: string;
  read: boolean;
  readAt?: any | null;
  clickedAt?: any | null;
  createdAt: any;
  deepLinkUrl?: string;
  linkLabel?: string;
  entityType: NotificationEntityType;
  entityId: string;
  eventId: string;
  eventType: NotificationEventType;
  metadata?: Record<string, any>;
  test?: boolean;
}

export function buildInAppNotification(params: {
  eventId: string;
  eventType: NotificationEventType;
  category: NotificationCategory;
  userId: string;
  actorId: string | null;
  entityType: NotificationEntityType;
  entityId: string;
  payload: NotificationEventPayload;
  test?: boolean;
}): Omit<UserNotificationDoc, 'createdAt'> & { createdAt: any } {
  const base = {
    id: params.eventId,
    userId: params.userId,
    category: params.category,
    entityType: params.entityType,
    entityId: params.entityId,
    eventId: params.eventId,
    eventType: params.eventType,
    createdAt: FieldValue.serverTimestamp(),
    read: false,
    ...(params.test ? { test: true } : {}),
  };

  switch (params.eventType) {
    case 'Auction.Outbid': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Auction.Outbid' }>;
      return {
        ...base,
        type: 'bid_outbid',
        title: 'You were outbid',
        body: p.yourMaxBidAmount
          ? `You were outbid on “${p.listingTitle}”. Your max bid was $${Number(p.yourMaxBidAmount).toLocaleString()}.`
          : `Someone placed a higher bid on “${p.listingTitle}”.`,
        deepLinkUrl: p.listingUrl,
        linkLabel: 'Raise bid',
        metadata: { newHighBidAmount: p.newHighBidAmount, yourMaxBidAmount: p.yourMaxBidAmount },
      };
    }
    case 'Auction.HighBidder': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Auction.HighBidder' }>;
      return {
        ...base,
        type: 'auction_high_bidder',
        title: 'You’re winning',
        body: p.yourMaxBidAmount && p.priceMoved === false
          ? `Max bid set on “${p.listingTitle}”. Current bid is still $${Number(p.currentBidAmount).toLocaleString()}.`
          : `You’re currently the high bidder on “${p.listingTitle}”.`,
        deepLinkUrl: p.listingUrl,
        linkLabel: 'View auction',
        metadata: {
          currentBidAmount: p.currentBidAmount,
          yourBidAmount: p.yourBidAmount,
          yourMaxBidAmount: p.yourMaxBidAmount,
          priceMoved: p.priceMoved,
        },
      };
    }
    case 'Auction.EndingSoon': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Auction.EndingSoon' }>;
      return {
        ...base,
        type: 'auction_ending_soon',
        title: `Ending soon (${p.threshold})`,
        body: `“${p.listingTitle}” is ending soon.`,
        deepLinkUrl: p.listingUrl,
        linkLabel: 'View auction',
        metadata: { threshold: p.threshold, endsAt: p.endsAt, currentBidAmount: p.currentBidAmount },
      };
    }
    case 'Auction.Won': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Auction.Won' }>;
      return {
        ...base,
        type: 'auction_won',
        title: 'You won!',
        body: `You won “${p.listingTitle}”. Complete checkout to secure it.`,
        deepLinkUrl: p.checkoutUrl || p.listingUrl,
        linkLabel: 'Complete checkout',
        metadata: { winningBidAmount: p.winningBidAmount },
      };
    }
    case 'Auction.Lost': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Auction.Lost' }>;
      return {
        ...base,
        type: 'auction_lost',
        title: 'Auction ended',
        body: `“${p.listingTitle}” ended. Keep watching—new inventory drops weekly.`,
        deepLinkUrl: p.listingUrl,
        linkLabel: 'View listing',
        metadata: { finalBidAmount: p.finalBidAmount },
      };
    }
    case 'Listing.Approved': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Listing.Approved' }>;
      return {
        ...base,
        type: 'listing_approved',
        title: 'Listing approved',
        body: `Your listing “${p.listingTitle}” is now live.`,
        deepLinkUrl: p.listingUrl,
        linkLabel: 'View listing',
      };
    }
    case 'Listing.Rejected': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Listing.Rejected' }>;
      const reason = p.reason ? ` Reason: ${p.reason}` : '';
      return {
        ...base,
        type: 'listing_rejected',
        title: 'Listing rejected',
        body: `Your listing “${p.listingTitle}” was rejected.${reason}`,
        deepLinkUrl: p.editUrl,
        linkLabel: 'Edit listing',
        ...(p.reason ? { metadata: { reason: p.reason } } : {}),
      };
    }
    case 'Listing.ComplianceApproved': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Listing.ComplianceApproved' }>;
      return {
        ...base,
        type: 'compliance_approved',
        title: 'Compliance approved',
        body: p.published
          ? `Your listing “${p.listingTitle}” passed compliance and is now live.`
          : `Your listing “${p.listingTitle}” passed compliance review.`,
        deepLinkUrl: p.listingUrl,
        linkLabel: 'View listing',
        metadata: { complianceStatus: 'approved', ...(typeof p.published === 'boolean' ? { published: p.published } : {}) },
      };
    }
    case 'Listing.ComplianceRejected': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Listing.ComplianceRejected' }>;
      return {
        ...base,
        type: 'compliance_rejected',
        title: 'Compliance rejected',
        body: `Your listing “${p.listingTitle}” was rejected during compliance review. Reason: ${p.reason}`,
        deepLinkUrl: p.editUrl,
        linkLabel: 'Edit listing',
        metadata: { complianceStatus: 'rejected', reason: p.reason },
      };
    }
    case 'Order.Confirmed': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Order.Confirmed' }>;
      return {
        ...base,
        type: 'order_created',
        title: 'Order confirmed',
        body: `Payment received for “${p.listingTitle}”. Funds are held securely until delivery and issue windows are complete.`,
        deepLinkUrl: p.orderUrl,
        linkLabel: 'View timeline',
        metadata: { listingId: p.listingId, orderId: p.orderId, amount: p.amount, paymentMethod: p.paymentMethod },
      };
    }
    case 'Order.Received': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Order.Received' }>;
      return {
        ...base,
        type: 'order_received',
        title: 'Receipt confirmed',
        body: `The buyer confirmed receipt for “${p.listingTitle}”.`,
        deepLinkUrl: p.orderUrl,
        linkLabel: 'View order',
        metadata: { listingId: p.listingId, orderId: p.orderId, amount: p.amount },
      };
    }
    case 'Order.Preparing': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Order.Preparing' }>;
      return {
        ...base,
        type: 'order_preparing',
        title: 'Seller is preparing delivery',
        body: `The seller is preparing your order for “${p.listingTitle}”.`,
        deepLinkUrl: p.orderUrl,
        linkLabel: 'View order',
        metadata: { listingId: p.listingId, orderId: p.orderId },
      };
    }
    case 'Order.InTransit': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Order.InTransit' }>;
      return {
        ...base,
        type: 'order_in_transit',
        title: 'In transit',
        body: `Your order for “${p.listingTitle}” is in transit.`,
        deepLinkUrl: p.orderUrl,
        linkLabel: 'View order',
        metadata: { listingId: p.listingId, orderId: p.orderId },
      };
    }
    case 'Order.DeliveryConfirmed': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryConfirmed' }>;
      return {
        ...base,
        type: 'order_completed',
        title: 'Delivery confirmed',
        body: `Delivery confirmed for “${p.listingTitle}”.`,
        deepLinkUrl: p.orderUrl,
        linkLabel: 'View order',
        metadata: { listingId: p.listingId, orderId: p.orderId, deliveryDate: p.deliveryDate },
      };
    }
    case 'Order.DeliveryCheckIn': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryCheckIn' }>;
      return {
        ...base,
        type: 'order_delivery_checkin',
        title: 'Quick check-in',
        body: `How did “${p.listingTitle}” go? Confirm receipt or report an issue.`,
        deepLinkUrl: p.orderUrl,
        linkLabel: 'Open order',
        metadata: { listingId: p.listingId, orderId: p.orderId, daysSinceDelivery: p.daysSinceDelivery },
      };
    }
    case 'Payout.Released': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Payout.Released' }>;
      return {
        ...base,
        type: 'payout_released',
        title: 'Payout released',
        body: `Your payout for “${p.listingTitle}” was released.`,
        deepLinkUrl: `/seller/payouts`,
        linkLabel: 'View payouts',
        metadata: { listingId: p.listingId, orderId: p.orderId, amount: p.amount, transferId: p.transferId },
      };
    }
    case 'User.Welcome': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'User.Welcome' }>;
      return {
        ...base,
        type: 'user_welcome',
        title: 'Welcome to Wildlife Exchange',
        body: 'Your next great deal is one bid away.',
        deepLinkUrl: p.dashboardUrl,
        linkLabel: 'Go to dashboard',
      };
    }
    case 'User.ProfileIncompleteReminder': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'User.ProfileIncompleteReminder' }>;
      return {
        ...base,
        type: 'profile_incomplete',
        title: 'Finish your profile',
        body: 'Complete a few details to unlock smoother buying and selling.',
        deepLinkUrl: p.settingsUrl,
        linkLabel: 'Update profile',
        metadata: { missingFields: p.missingFields || [] },
      };
    }
    case 'Message.Received': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Message.Received' }>;
      return {
        // Collapse messages to one notification per thread (updates in place + bumps to top).
        ...base,
        id: `msg_thread:${p.threadId}`,
        type: 'message_received',
        title: 'New message',
        body: `${p.senderRole === 'buyer' ? 'Buyer' : 'Seller'} messaged you about “${p.listingTitle}”.`,
        deepLinkUrl: p.threadUrl,
        linkLabel: 'View message',
        // Ensure a previously-read thread becomes "unread" again when new messages arrive.
        read: false,
        readAt: null,
        clickedAt: null,
        metadata: { preview: p.preview || '', threadId: p.threadId, listingId: p.listingId || null },
      };
    }
    case 'Admin.BreederPermit.Submitted': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Admin.BreederPermit.Submitted' }>;
      const who = p.sellerName ? `${p.sellerName}` : `Seller ${p.sellerId}`;
      return {
        ...base,
        type: 'admin_breeder_permit_submitted',
        title: 'New breeder permit to review',
        body: p.permitNumber ? `${who} submitted a TPWD breeder permit (${p.permitNumber}).` : `${who} submitted a TPWD breeder permit.`,
        deepLinkUrl: p.adminComplianceUrl,
        linkLabel: 'Open compliance queue',
        metadata: {
          sellerId: p.sellerId,
          permitNumber: p.permitNumber || null,
          storagePath: p.storagePath,
          documentUrl: p.documentUrl || null,
        },
      };
    }
    case 'Offer.Received': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Offer.Received' }>;
      return {
        ...base,
        type: 'offer_received',
        title: 'New offer received',
        body: `You received an offer of $${Number(p.amount).toLocaleString()} on “${p.listingTitle}”.`,
        deepLinkUrl: p.offerUrl,
        linkLabel: 'Review offer',
        metadata: { listingId: p.listingId, offerId: p.offerId, amount: p.amount, expiresAt: p.expiresAt || null },
      };
    }
    case 'Offer.Countered': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Offer.Countered' }>;
      return {
        ...base,
        type: 'offer_countered',
        title: 'Offer updated',
        body: `Counter offer: $${Number(p.amount).toLocaleString()} for “${p.listingTitle}”.`,
        deepLinkUrl: p.offerUrl,
        linkLabel: 'View offer',
        metadata: { listingId: p.listingId, offerId: p.offerId, amount: p.amount, expiresAt: p.expiresAt || null },
      };
    }
    case 'Offer.Accepted': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Offer.Accepted' }>;
      return {
        ...base,
        type: 'offer_accepted',
        title: 'Offer accepted',
        body: `Offer accepted for “${p.listingTitle}” at $${Number(p.amount).toLocaleString()}.`,
        deepLinkUrl: p.offerUrl,
        linkLabel: 'Next steps',
        metadata: { listingId: p.listingId, offerId: p.offerId, amount: p.amount },
      };
    }
    case 'Offer.Declined': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Offer.Declined' }>;
      return {
        ...base,
        type: 'offer_declined',
        title: 'Offer declined',
        body: `Offer declined for “${p.listingTitle}”.`,
        deepLinkUrl: p.offerUrl,
        linkLabel: 'View offers',
        metadata: { listingId: p.listingId, offerId: p.offerId },
      };
    }
    case 'Offer.Expired': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Offer.Expired' }>;
      return {
        ...base,
        type: 'offer_expired',
        title: 'Offer expired',
        body: `Offer expired for “${p.listingTitle}”.`,
        deepLinkUrl: p.offerUrl,
        linkLabel: 'View offers',
        metadata: { listingId: p.listingId, offerId: p.offerId },
      };
    }
    case 'Admin.Listing.Submitted': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Admin.Listing.Submitted' }>;
      const reason =
        p.pendingReason === 'admin_approval'
          ? 'admin approval'
          : p.pendingReason === 'compliance_review'
            ? 'compliance review'
            : 'review';
      return {
        ...base,
        type: 'admin_listing_submitted',
        title: 'New listing submitted',
        body: `“${p.listingTitle}” needs ${reason}.`,
        deepLinkUrl: p.adminQueueUrl,
        linkLabel: 'Open review queue',
        metadata: { listingId: p.listingId, sellerId: p.sellerId, pendingReason: p.pendingReason || null },
      };
    }
    case 'Admin.Listing.ComplianceReviewRequired': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Admin.Listing.ComplianceReviewRequired' }>;
      return {
        ...base,
        type: 'admin_compliance_review',
        title: 'Compliance review needed',
        body: `Review compliance for “${p.listingTitle}”.`,
        deepLinkUrl: p.adminComplianceUrl,
        linkLabel: 'Open compliance',
        metadata: { listingId: p.listingId, sellerId: p.sellerId, complianceStatus: p.complianceStatus || null },
      };
    }
    case 'Admin.Listing.AdminApprovalRequired': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Admin.Listing.AdminApprovalRequired' }>;
      return {
        ...base,
        type: 'admin_listing_admin_approval',
        title: 'Admin approval needed',
        body: `Approve/reject “${p.listingTitle}”.`,
        deepLinkUrl: p.adminQueueUrl,
        linkLabel: 'Open approvals',
        metadata: { listingId: p.listingId, sellerId: p.sellerId },
      };
    }
    case 'Admin.Listing.Approved': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Admin.Listing.Approved' }>;
      return {
        ...base,
        type: 'admin_listing_approved',
        title: 'Listing approved',
        body: `“${p.listingTitle}” was approved.`,
        deepLinkUrl: p.listingUrl,
        linkLabel: 'View listing',
        metadata: { listingId: p.listingId, sellerId: p.sellerId },
      };
    }
    case 'Admin.Listing.Rejected': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Admin.Listing.Rejected' }>;
      return {
        ...base,
        type: 'admin_listing_rejected',
        title: 'Listing rejected',
        body: p.reason ? `“${p.listingTitle}” was rejected: ${p.reason}` : `“${p.listingTitle}” was rejected.`,
        deepLinkUrl: p.adminQueueUrl,
        linkLabel: 'Open queue',
        metadata: { listingId: p.listingId, sellerId: p.sellerId, reason: p.reason || null },
      };
    }
    case 'Admin.Order.DisputeOpened': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Admin.Order.DisputeOpened' }>;
      return {
        ...base,
        type: 'admin_dispute_opened',
        title: 'Dispute opened',
        body: p.listingTitle ? `Dispute opened for "${p.listingTitle}".` : `A dispute was opened on an order.`,
        deepLinkUrl: p.adminOpsUrl,
        linkLabel: 'Open admin',
        metadata: { orderId: p.orderId, buyerId: p.buyerId, disputeType: p.disputeType, reason: p.reason },
      };
    }
    case 'Admin.Support.TicketSubmitted': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Admin.Support.TicketSubmitted' }>;
      return {
        ...base,
        type: 'Admin.Support.TicketSubmitted',
        title: 'New support ticket',
        body: `${p.userName} submitted: "${p.subject}"`,
        deepLinkUrl: p.adminSupportUrl,
        linkLabel: 'Open support',
        metadata: { ticketId: p.ticketId, userId: p.userId, category: p.category || null },
      };
    }
    case 'Auction.BidReceived': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Auction.BidReceived' }>;
      return {
        ...base,
        type: 'bid_received',
        title: 'New bid received',
        body: `New bid on “${p.listingTitle}”.`,
        deepLinkUrl: p.listingUrl,
        linkLabel: 'View listing',
        metadata: { bidAmount: p.bidAmount },
      };
    }
    default:
      return {
        ...base,
        type: 'system',
        title: 'Update',
        body: 'You have a new update.',
      };
  }
}

