/**
 * Email Registry (preview/render helpers)
 *
 * IMPORTANT:
 * - This file must NOT import the sender (Resend/Brevo/etc). Rendering only.
 * - Safe to use in admin preview tooling.
 */

import { z } from 'zod';
import {
  getOrderConfirmationEmail,
  getDeliveryConfirmationEmail,
  getOrderInTransitEmail,
  getPayoutNotificationEmail,
  getAuctionWinnerEmail,
  getAuctionOutbidEmail,
  getWelcomeEmail,
  getAuctionHighBidderEmail,
  getAuctionEndingSoonEmail,
  getAuctionLostEmail,
  getDeliveryCheckInEmail,
  getOrderReceivedEmail,
  getProfileIncompleteReminderEmail,
  getWeeklyDigestEmail,
  getSavedSearchAlertEmail,
  type OrderConfirmationEmailData,
  type DeliveryConfirmationEmailData,
  type OrderInTransitEmailData,
  type PayoutNotificationEmailData,
  type AuctionWinnerEmailData,
  type AuctionOutbidEmailData,
  type WelcomeEmailData,
  type AuctionHighBidderEmailData,
  type AuctionEndingSoonEmailData,
  type AuctionLostEmailData,
  type DeliveryCheckInEmailData,
  type OrderReceivedEmailData,
  type ProfileIncompleteReminderEmailData,
  type WeeklyDigestEmailData,
  type SavedSearchAlertEmailData,
} from './templates';

function coerceDate(v: unknown): Date | undefined {
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

const dateSchema = z.preprocess(
  (v) => coerceDate(v),
  z.date({ required_error: 'Date is required', invalid_type_error: 'Invalid date' })
);

const urlSchema = z.string().url('Must be a valid URL');

const orderConfirmationSchema = z.object({
  buyerName: z.string().min(1),
  orderId: z.string().min(1),
  listingTitle: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  orderDate: dateSchema,
  orderUrl: urlSchema,
});

const deliveryConfirmationSchema = z.object({
  buyerName: z.string().min(1),
  orderId: z.string().min(1),
  listingTitle: z.string().min(1),
  deliveryDate: dateSchema,
  orderUrl: urlSchema,
});

const orderInTransitSchema = z.object({
  buyerName: z.string().min(1),
  orderId: z.string().min(1),
  listingTitle: z.string().min(1),
  orderUrl: urlSchema,
});

const payoutNotificationSchema = z.object({
  sellerName: z.string().min(1),
  orderId: z.string().min(1),
  listingTitle: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  transferId: z.string().min(1),
  payoutDate: dateSchema,
});

const auctionWinnerSchema = z.object({
  winnerName: z.string().min(1),
  listingTitle: z.string().min(1),
  winningBid: z.number().finite().nonnegative(),
  orderUrl: urlSchema,
  auctionEndDate: dateSchema,
});

const auctionOutbidSchema = z.object({
  outbidderName: z.string().min(1),
  listingTitle: z.string().min(1),
  newBidAmount: z.number().finite().nonnegative(),
  listingUrl: urlSchema,
  auctionEndsAt: dateSchema.optional(),
});

const welcomeSchema = z.object({
  userName: z.string().min(1),
  dashboardUrl: urlSchema,
});

const auctionHighBidderSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  yourBidAmount: z.number().finite().nonnegative(),
  listingUrl: urlSchema,
  auctionEndsAt: dateSchema.optional(),
});

const auctionEndingSoonSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  threshold: z.enum(['24h', '1h', '10m', '2m']),
  listingUrl: urlSchema,
  auctionEndsAt: dateSchema,
  currentBidAmount: z.number().finite().nonnegative().optional(),
});

const auctionLostSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  listingUrl: urlSchema,
  finalBidAmount: z.number().finite().nonnegative().optional(),
});

const deliveryCheckInSchema = z.object({
  buyerName: z.string().min(1),
  orderId: z.string().min(1),
  listingTitle: z.string().min(1),
  daysSinceDelivery: z.number().int().nonnegative(),
  orderUrl: urlSchema,
});

const orderReceivedSchema = z.object({
  sellerName: z.string().min(1),
  orderId: z.string().min(1),
  listingTitle: z.string().min(1),
  orderUrl: urlSchema,
});

const profileIncompleteReminderSchema = z.object({
  userName: z.string().min(1),
  settingsUrl: urlSchema,
  missingFields: z.array(z.string()).optional(),
});

const weeklyDigestSchema = z.object({
  userName: z.string().min(1),
  listings: z.array(
    z.object({
      title: z.string().min(1),
      url: urlSchema,
      price: z.number().finite().nonnegative().optional(),
      endsAt: dateSchema.optional(),
    })
  ),
  unsubscribeUrl: urlSchema.optional(),
});

const savedSearchAlertSchema = z.object({
  userName: z.string().min(1),
  queryName: z.string().min(1),
  resultsCount: z.number().int().nonnegative(),
  searchUrl: urlSchema,
  unsubscribeUrl: urlSchema.optional(),
});

export const EMAIL_EVENT_REGISTRY = [
  {
    type: 'order_confirmation',
    displayName: 'Order Confirmation',
    description: 'Sent to buyer after payment is received and escrow begins.',
    schema: orderConfirmationSchema,
    samplePayload: {
      buyerName: 'Alex Johnson',
      orderId: 'ORD_123456',
      listingTitle: 'Trophy Whitetail Buck - 180+ Class Score',
      amount: 18500,
      orderDate: new Date().toISOString(),
      orderUrl: 'https://wildlife.exchange/dashboard/orders?orderId=ORD_123456',
    },
    render: (data: OrderConfirmationEmailData) => {
      const { subject, html } = getOrderConfirmationEmail(data);
      return { subject, preheader: `Order confirmed for ${data.listingTitle}`, html };
    },
  },
  {
    type: 'delivery_confirmation',
    displayName: 'Delivery Confirmed',
    description: 'Sent to buyer when seller marks the order delivered.',
    schema: deliveryConfirmationSchema,
    samplePayload: {
      buyerName: 'Alex Johnson',
      orderId: 'ORD_123456',
      listingTitle: 'Axis Doe (Breeder Stock)',
      deliveryDate: new Date().toISOString(),
      orderUrl: 'https://wildlife.exchange/dashboard/orders?orderId=ORD_123456',
    },
    render: (data: DeliveryConfirmationEmailData) => {
      const { subject, html } = getDeliveryConfirmationEmail(data);
      return { subject, preheader: `Delivery confirmed: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'order_in_transit',
    displayName: 'Order In Transit',
    description: 'Sent to buyer when seller marks the order in transit.',
    schema: orderInTransitSchema,
    samplePayload: {
      buyerName: 'Alex Johnson',
      orderId: 'ORD_123456',
      listingTitle: 'Axis Doe (Breeder Stock)',
      orderUrl: 'https://wildlife.exchange/dashboard/orders/ORD_123456',
    },
    render: (data: OrderInTransitEmailData) => {
      const { subject, html } = getOrderInTransitEmail(data);
      return { subject, preheader: `In transit: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'payout_released',
    displayName: 'Payout Released',
    description: 'Sent to seller when payout is released.',
    schema: payoutNotificationSchema,
    samplePayload: {
      sellerName: 'Jordan Smith',
      orderId: 'ORD_123456',
      listingTitle: 'Ranch Equipment: Livestock Trailer',
      amount: 12000,
      transferId: 'tr_12345',
      payoutDate: new Date().toISOString(),
    },
    render: (data: PayoutNotificationEmailData) => {
      const { subject, html } = getPayoutNotificationEmail(data);
      return { subject, preheader: `Payout released for ${data.listingTitle}`, html };
    },
  },
  {
    type: 'auction_winner',
    displayName: 'Auction Winner',
    description: 'Sent to the winning bidder when an auction ends.',
    schema: auctionWinnerSchema,
    samplePayload: {
      winnerName: 'Alex Johnson',
      listingTitle: 'Blackbuck Trophy Buck',
      winningBid: 9500,
      orderUrl: 'https://wildlife.exchange/listing/abc123',
      auctionEndDate: new Date().toISOString(),
    },
    render: (data: AuctionWinnerEmailData) => {
      const { subject, html } = getAuctionWinnerEmail(data);
      return { subject, preheader: `You won: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'auction_outbid',
    displayName: 'Auction: Outbid',
    description: 'Sent to the previous high bidder when they are outbid.',
    schema: auctionOutbidSchema,
    samplePayload: {
      outbidderName: 'Alex Johnson',
      listingTitle: 'Blackbuck Trophy Buck',
      newBidAmount: 9850,
      listingUrl: 'https://wildlife.exchange/listing/abc123',
      auctionEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
    },
    render: (data: AuctionOutbidEmailData) => {
      const { subject, html } = getAuctionOutbidEmail(data);
      return { subject, preheader: `Outbid on: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'user_welcome',
    displayName: 'User: Welcome',
    description: 'Sent to a new user after signup (opted-in transactional).',
    schema: welcomeSchema,
    samplePayload: {
      userName: 'Alex',
      dashboardUrl: 'https://wildlife.exchange/dashboard/notifications',
    },
    render: (data: WelcomeEmailData) => {
      const { subject, html } = getWelcomeEmail(data);
      return { subject, preheader: `Welcome to Wildlife Exchange`, html };
    },
  },
  {
    type: 'auction_high_bidder',
    displayName: 'Auction: High Bidder',
    description: 'Sent to the current high bidder (you are winning).',
    schema: auctionHighBidderSchema,
    samplePayload: {
      userName: 'Alex',
      listingTitle: 'Blackbuck Trophy Buck',
      yourBidAmount: 9900,
      listingUrl: 'https://wildlife.exchange/listing/abc123',
      auctionEndsAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    },
    render: (data: AuctionHighBidderEmailData) => {
      const { subject, html } = getAuctionHighBidderEmail(data);
      return { subject, preheader: `You’re winning: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'auction_ending_soon',
    displayName: 'Auction: Ending Soon',
    description: 'Sent when an auction is ending soon (24h/1h/10m/2m thresholds).',
    schema: auctionEndingSoonSchema,
    samplePayload: {
      userName: 'Alex',
      listingTitle: 'Axis Doe (Breeder Stock)',
      threshold: '10m',
      listingUrl: 'https://wildlife.exchange/listing/abc123',
      auctionEndsAt: new Date(Date.now() + 1000 * 60 * 10).toISOString(),
      currentBidAmount: 4500,
    },
    render: (data: AuctionEndingSoonEmailData) => {
      const { subject, html } = getAuctionEndingSoonEmail(data);
      return { subject, preheader: `Ending soon: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'auction_lost',
    displayName: 'Auction: Lost',
    description: 'Sent to a bidder when an auction ends and they did not win (soft landing).',
    schema: auctionLostSchema,
    samplePayload: {
      userName: 'Alex',
      listingTitle: 'Blackbuck Trophy Buck',
      listingUrl: 'https://wildlife.exchange/listing/abc123',
      finalBidAmount: 11000,
    },
    render: (data: AuctionLostEmailData) => {
      const { subject, html } = getAuctionLostEmail(data);
      return { subject, preheader: `Auction ended: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'order_delivery_checkin',
    displayName: 'Order: Delivery Check-in',
    description: 'Sent to buyer N days after delivery to confirm everything is OK.',
    schema: deliveryCheckInSchema,
    samplePayload: {
      buyerName: 'Alex',
      orderId: 'ORD_123456',
      listingTitle: 'Axis Doe (Breeder Stock)',
      daysSinceDelivery: 3,
      orderUrl: 'https://wildlife.exchange/dashboard/orders/ORD_123456',
    },
    render: (data: DeliveryCheckInEmailData) => {
      const { subject, html } = getDeliveryCheckInEmail(data);
      return { subject, preheader: `Quick check-in: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'order_received',
    displayName: 'Order: Receipt Confirmed (Seller)',
    description: 'Sent to seller when buyer confirms receipt.',
    schema: orderReceivedSchema,
    samplePayload: {
      sellerName: 'Jordan',
      orderId: 'ORD_123456',
      listingTitle: 'Axis Doe (Breeder Stock)',
      orderUrl: 'https://wildlife.exchange/seller/orders/ORD_123456',
    },
    render: (data: OrderReceivedEmailData) => {
      const { subject, html } = getOrderReceivedEmail(data);
      return { subject, preheader: `Receipt confirmed: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'profile_incomplete_reminder',
    displayName: 'User: Profile Incomplete',
    description: 'Reminder to complete profile.',
    schema: profileIncompleteReminderSchema,
    samplePayload: {
      userName: 'Alex',
      settingsUrl: 'https://wildlife.exchange/dashboard/account',
      missingFields: ['phone', 'location'],
    },
    render: (data: ProfileIncompleteReminderEmailData) => {
      const { subject, html } = getProfileIncompleteReminderEmail(data);
      return { subject, preheader: `Finish your profile`, html };
    },
  },
  {
    type: 'marketing_weekly_digest',
    displayName: 'Marketing: Weekly Digest',
    description: 'Opt-in weekly digest email.',
    schema: weeklyDigestSchema,
    samplePayload: {
      userName: 'Alex',
      listings: [
        { title: 'Blackbuck Trophy Buck', url: 'https://wildlife.exchange/listing/abc123', price: 9500, endsAt: new Date().toISOString() },
      ],
      unsubscribeUrl: 'https://wildlife.exchange/dashboard/settings/notifications',
    },
    render: (data: WeeklyDigestEmailData) => {
      const { subject, html } = getWeeklyDigestEmail(data);
      return { subject, preheader: `Weekly digest`, html };
    },
  },
  {
    type: 'marketing_saved_search_alert',
    displayName: 'Marketing: Saved Search Alert',
    description: 'Opt-in saved search alerts.',
    schema: savedSearchAlertSchema,
    samplePayload: {
      userName: 'Alex',
      queryName: 'Whitetail under $12k',
      resultsCount: 4,
      searchUrl: 'https://wildlife.exchange/browse?type=auction',
      unsubscribeUrl: 'https://wildlife.exchange/dashboard/settings/notifications',
    },
    render: (data: SavedSearchAlertEmailData) => {
      const { subject, html } = getSavedSearchAlertEmail(data);
      return { subject, preheader: `New matches`, html };
    },
  },
] as const;

export type EmailEventType = (typeof EMAIL_EVENT_REGISTRY)[number]['type'];

export function listEmailEvents(): { type: EmailEventType; displayName: string; description: string }[] {
  return EMAIL_EVENT_REGISTRY.map((e) => ({
    type: e.type,
    displayName: e.displayName,
    description: e.description,
  }));
}

export function getSamplePayload(eventType: EmailEventType): object {
  const entry = EMAIL_EVENT_REGISTRY.find((e) => e.type === eventType);
  return entry?.samplePayload ? (entry.samplePayload as object) : {};
}

export function validatePayload(
  eventType: EmailEventType,
  payload: unknown
): { ok: true; data: unknown } | { ok: false; errors: z.ZodIssue[] } {
  const entry = EMAIL_EVENT_REGISTRY.find((e) => e.type === eventType);
  if (!entry) return { ok: false, errors: [{ code: 'custom', path: ['event'], message: 'Unknown event type' }] as any };
  const parsed = entry.schema.safeParse(payload);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues };
  return { ok: true, data: parsed.data };
}

export function renderEmail(eventType: EmailEventType, payload: unknown): { subject: string; preheader: string; html: string } {
  const entry = EMAIL_EVENT_REGISTRY.find((e) => e.type === eventType);
  if (!entry) {
    throw new Error(`Unknown email event type: ${eventType}`);
  }
  const parsed = entry.schema.parse(payload);
  // `render` expects a typed object; zod parse guarantees it.
  return (entry as any).render(parsed);
}

