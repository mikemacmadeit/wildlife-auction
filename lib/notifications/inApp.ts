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
        body: `Someone placed a higher bid on “${p.listingTitle}”.`,
        deepLinkUrl: p.listingUrl,
        linkLabel: 'Raise bid',
        metadata: { newHighBidAmount: p.newHighBidAmount },
      };
    }
    case 'Auction.HighBidder': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Auction.HighBidder' }>;
      return {
        ...base,
        type: 'auction_high_bidder',
        title: 'You’re winning',
        body: `You’re currently the high bidder on “${p.listingTitle}”.`,
        deepLinkUrl: p.listingUrl,
        linkLabel: 'View auction',
        metadata: { currentBidAmount: p.currentBidAmount, yourBidAmount: p.yourBidAmount },
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
    case 'Order.Confirmed': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Order.Confirmed' }>;
      return {
        ...base,
        type: 'order_created',
        title: 'Order confirmed',
        body: `Payment received for “${p.listingTitle}”. Funds are held securely until delivery and issue windows are complete.`,
        deepLinkUrl: p.orderUrl,
        linkLabel: 'View timeline',
        metadata: { amount: p.amount, paymentMethod: p.paymentMethod },
      };
    }
    case 'Order.Received': {
      const p = params.payload as Extract<NotificationEventPayload, { type: 'Order.Received' }>;
      return {
        ...base,
        type: 'order_received',
        title: 'New order received',
        body: `You received an order for “${p.listingTitle}”.`,
        deepLinkUrl: p.orderUrl,
        linkLabel: 'View order',
        metadata: { amount: p.amount },
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
        metadata: { deliveryDate: p.deliveryDate },
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
        metadata: { daysSinceDelivery: p.daysSinceDelivery },
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
        metadata: { amount: p.amount, transferId: p.transferId },
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
        ...base,
        type: 'message_received',
        title: 'New message',
        body: `${p.senderRole === 'buyer' ? 'Buyer' : 'Seller'} messaged you about “${p.listingTitle}”.`,
        deepLinkUrl: p.threadUrl,
        linkLabel: 'View message',
        metadata: { preview: p.preview || '' },
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
        metadata: { offerId: p.offerId, amount: p.amount, expiresAt: p.expiresAt || null },
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
        metadata: { offerId: p.offerId, amount: p.amount, expiresAt: p.expiresAt || null },
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
        metadata: { offerId: p.offerId, amount: p.amount },
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
        metadata: { offerId: p.offerId },
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
        metadata: { offerId: p.offerId },
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

