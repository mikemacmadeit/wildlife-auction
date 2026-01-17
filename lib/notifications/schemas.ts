import { z } from 'zod';
import { NOTIFICATION_EVENT_TYPES, type NotificationEventPayload, type NotificationEventType } from './types';

const urlSchema = z.string().url();

const thresholdSchema = z.enum(['24h', '1h', '10m', '2m']);

const baseString = z.string().min(1);

export const notificationEventPayloadSchema: z.ZodType<NotificationEventPayload> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Auction.WatchStarted'),
    listingId: baseString,
    listingTitle: baseString,
    listingUrl: urlSchema,
    endsAt: z.string().optional(),
  }),
  z.object({
    type: z.literal('Auction.HighBidder'),
    listingId: baseString,
    listingTitle: baseString,
    listingUrl: urlSchema,
    yourBidAmount: z.number().finite().nonnegative(),
    currentBidAmount: z.number().finite().nonnegative(),
    endsAt: z.string().optional(),
  }),
  z.object({
    type: z.literal('Auction.Outbid'),
    listingId: baseString,
    listingTitle: baseString,
    listingUrl: urlSchema,
    newHighBidAmount: z.number().finite().nonnegative(),
    endsAt: z.string().optional(),
  }),
  z.object({
    type: z.literal('Auction.EndingSoon'),
    listingId: baseString,
    listingTitle: baseString,
    listingUrl: urlSchema,
    threshold: thresholdSchema,
    endsAt: baseString,
    currentBidAmount: z.number().finite().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('Auction.Won'),
    listingId: baseString,
    listingTitle: baseString,
    listingUrl: urlSchema,
    winningBidAmount: z.number().finite().nonnegative(),
    endsAt: z.string().optional(),
    checkoutUrl: urlSchema.optional(),
  }),
  z.object({
    type: z.literal('Auction.Lost'),
    listingId: baseString,
    listingTitle: baseString,
    listingUrl: urlSchema,
    finalBidAmount: z.number().finite().nonnegative().optional(),
    endsAt: z.string().optional(),
  }),
  z.object({
    type: z.literal('Auction.BidReceived'),
    listingId: baseString,
    listingTitle: baseString,
    listingUrl: urlSchema,
    bidAmount: z.number().finite().nonnegative(),
  }),
  z.object({
    type: z.literal('Order.Confirmed'),
    orderId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    orderUrl: urlSchema,
    amount: z.number().finite().nonnegative(),
    paymentMethod: z.string().optional(),
  }),
  z.object({
    type: z.literal('Order.Received'),
    orderId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    orderUrl: urlSchema,
    amount: z.number().finite().nonnegative(),
  }),
  z.object({
    type: z.literal('Order.InTransit'),
    orderId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    orderUrl: urlSchema,
  }),
  z.object({
    type: z.literal('Order.DeliveryConfirmed'),
    orderId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    orderUrl: urlSchema,
    deliveryDate: baseString,
  }),
  z.object({
    type: z.literal('Order.DeliveryCheckIn'),
    orderId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    orderUrl: urlSchema,
    daysSinceDelivery: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('Payout.Released'),
    orderId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    amount: z.number().finite().nonnegative(),
    transferId: baseString,
    payoutDate: baseString,
  }),
  z.object({
    type: z.literal('User.Welcome'),
    userId: baseString,
    displayName: z.string().optional(),
    dashboardUrl: urlSchema,
  }),
  z.object({
    type: z.literal('User.ProfileIncompleteReminder'),
    userId: baseString,
    displayName: z.string().optional(),
    settingsUrl: urlSchema,
    missingFields: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('Marketing.WeeklyDigest'),
    userId: baseString,
    listings: z.array(
      z.object({
        listingId: baseString,
        title: baseString,
        url: urlSchema,
        price: z.number().finite().nonnegative().optional(),
        endsAt: z.string().optional(),
      })
    ),
    unsubscribeUrl: urlSchema.optional(),
    channels: z
      .object({
        email: z.boolean().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('Marketing.SavedSearchAlert'),
    userId: baseString,
    queryName: baseString,
    resultsCount: z.number().int().nonnegative(),
    searchUrl: urlSchema,
    unsubscribeUrl: urlSchema.optional(),
    channels: z
      .object({
        inApp: z.boolean().optional(),
        push: z.boolean().optional(),
        email: z.boolean().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('Message.Received'),
    threadId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    threadUrl: urlSchema,
    senderRole: z.enum(['buyer', 'seller']),
    preview: z.string().optional(),
  }),
  z.object({
    type: z.literal('Offer.Received'),
    offerId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    offerUrl: urlSchema,
    amount: z.number(),
    expiresAt: z.string().optional(),
  }),
  z.object({
    type: z.literal('Offer.Countered'),
    offerId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    offerUrl: urlSchema,
    amount: z.number(),
    expiresAt: z.string().optional(),
  }),
  z.object({
    type: z.literal('Offer.Accepted'),
    offerId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    offerUrl: urlSchema,
    amount: z.number(),
  }),
  z.object({
    type: z.literal('Offer.Declined'),
    offerId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    offerUrl: urlSchema,
  }),
  z.object({
    type: z.literal('Offer.Expired'),
    offerId: baseString,
    listingId: baseString,
    listingTitle: baseString,
    offerUrl: urlSchema,
  }),
]);

export const notificationEventTypeSchema = z.enum(NOTIFICATION_EVENT_TYPES);

export const notificationEventDocInputSchema = z.object({
  id: z.string().min(1),
  type: notificationEventTypeSchema,
  actorId: z.string().nullable(),
  entityType: z.enum(['listing', 'order', 'user', 'message_thread', 'system']),
  entityId: z.string().min(1),
  targetUserIds: z.array(z.string().min(1)).min(1),
  payload: notificationEventPayloadSchema,
  status: z.enum(['pending', 'processed', 'failed']),
  processing: z.object({
    attempts: z.number().int().nonnegative(),
    lastAttemptAt: z.any().nullable(),
    error: z.string().optional(),
  }),
  eventKey: z.string().min(1),
  test: z.boolean().optional(),
});

export function assertPayloadMatchesType(type: NotificationEventType, payload: NotificationEventPayload) {
  if (payload.type !== type) {
    throw new Error(`Event payload type mismatch: event.type=${type} payload.type=${payload.type}`);
  }
}

