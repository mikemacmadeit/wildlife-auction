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
  getOrderPreparingEmail,
  getPayoutNotificationEmail,
  getAuctionWinnerEmail,
  getAuctionOutbidEmail,
  getWelcomeEmail,
  getAuctionHighBidderEmail,
  getAuctionEndingSoonEmail,
  getAuctionLostEmail,
  getBidPlacedEmail,
  getDeliveryCheckInEmail,
  getOrderReceivedEmail,
  getProfileIncompleteReminderEmail,
  getWeeklyDigestEmail,
  getSavedSearchAlertEmail,
  getMessageReceivedEmail,
  getVerifyEmailEmail,
  getOfferSubmittedEmail,
  getOfferAcceptedEmail,
  getOfferReceivedEmail,
  getOfferCounteredEmail,
  getOfferDeclinedEmail,
  getOfferExpiredEmail,
  getListingApprovedEmail,
  getListingRejectedEmail,
  getAdminListingSubmittedEmail,
  getAdminListingComplianceReviewEmail,
  getAdminListingAdminApprovalEmail,
  getAdminListingApprovedEmail,
  getAdminListingRejectedEmail,
  getAdminDisputeOpenedEmail,
  getAdminBreederPermitSubmittedEmail,
  type OrderConfirmationEmailData,
  type DeliveryConfirmationEmailData,
  type OrderInTransitEmailData,
  type OrderPreparingEmailData,
  type PayoutNotificationEmailData,
  type AuctionWinnerEmailData,
  type AuctionOutbidEmailData,
  type WelcomeEmailData,
  type AuctionHighBidderEmailData,
  type AuctionEndingSoonEmailData,
  type AuctionLostEmailData,
  type BidPlacedEmailData,
  type DeliveryCheckInEmailData,
  type OrderReceivedEmailData,
  type ProfileIncompleteReminderEmailData,
  type WeeklyDigestEmailData,
  type SavedSearchAlertEmailData,
  type MessageReceivedEmailData,
  type VerifyEmailEmailData,
  type OfferSubmittedEmailData,
  type OfferAcceptedEmailData,
  type OfferReceivedEmailData,
  type OfferCounteredEmailData,
  type OfferDeclinedEmailData,
  type OfferExpiredEmailData,
  type ListingApprovedEmailData,
  type ListingRejectedEmailData,
  type AdminListingSubmittedEmailData,
  type AdminListingComplianceReviewEmailData,
  type AdminListingAdminApprovalEmailData,
  type AdminListingApprovedEmailData,
  type AdminListingRejectedEmailData,
  type AdminDisputeOpenedEmailData,
  type AdminBreederPermitSubmittedEmailData,
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

const orderPreparingSchema = z.object({
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

const bidPlacedSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  bidAmount: z.number().finite().nonnegative(),
  currentBidAmount: z.number().finite().nonnegative(),
  isHighBidder: z.boolean(),
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

const adminBreederPermitSubmittedSchema = z.object({
  adminName: z.string().min(1),
  sellerId: z.string().min(1),
  sellerName: z.string().optional(),
  permitNumber: z.string().optional(),
  storagePath: z.string().min(1),
  documentUrl: urlSchema.optional(),
  adminComplianceUrl: urlSchema,
});

const messageReceivedSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  threadUrl: urlSchema,
  listingUrl: urlSchema,
  senderRole: z.enum(['buyer', 'seller']),
  preview: z.string().optional(),
});

const verifyEmailSchema = z.object({
  userName: z.string().min(1),
  verifyUrl: urlSchema,
  dashboardUrl: urlSchema,
});

const offerSubmittedSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  offerUrl: urlSchema,
  expiresAt: dateSchema.optional(),
});

const offerAcceptedSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  offerUrl: urlSchema,
});

const offerReceivedSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  offerUrl: urlSchema,
  expiresAt: z.string().optional(),
});

const offerCounteredSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  offerUrl: urlSchema,
  expiresAt: z.string().optional(),
});

const offerDeclinedSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  offerUrl: urlSchema,
});

const offerExpiredSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  offerUrl: urlSchema,
});

const listingApprovedSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  listingUrl: urlSchema,
});

const listingRejectedSchema = z.object({
  userName: z.string().min(1),
  listingTitle: z.string().min(1),
  editUrl: urlSchema,
  reason: z.string().optional(),
});

const adminListingSubmittedSchema = z.object({
  adminName: z.string().min(1),
  listingTitle: z.string().min(1),
  listingId: z.string().min(1),
  sellerId: z.string().min(1),
  sellerName: z.string().optional(),
  pendingReason: z.enum(['admin_approval', 'compliance_review', 'unknown']),
  category: z.string().optional(),
  listingType: z.string().optional(),
  complianceStatus: z.string().optional(),
  listingUrl: urlSchema,
  adminQueueUrl: urlSchema,
  adminComplianceUrl: urlSchema.optional(),
});

const adminListingComplianceReviewSchema = z.object({
  adminName: z.string().min(1),
  listingTitle: z.string().min(1),
  listingId: z.string().min(1),
  sellerId: z.string().min(1),
  sellerName: z.string().optional(),
  complianceStatus: z.string().optional(),
  listingUrl: urlSchema,
  adminComplianceUrl: urlSchema,
});

const adminListingAdminApprovalSchema = z.object({
  adminName: z.string().min(1),
  listingTitle: z.string().min(1),
  listingId: z.string().min(1),
  sellerId: z.string().min(1),
  sellerName: z.string().optional(),
  listingUrl: urlSchema,
  adminQueueUrl: urlSchema,
});

const adminListingApprovedSchema = z.object({
  adminName: z.string().min(1),
  listingTitle: z.string().min(1),
  listingId: z.string().min(1),
  sellerId: z.string().min(1),
  sellerName: z.string().optional(),
  listingUrl: urlSchema,
  adminQueueUrl: urlSchema,
});

const adminListingRejectedSchema = z.object({
  adminName: z.string().min(1),
  listingTitle: z.string().min(1),
  listingId: z.string().min(1),
  sellerId: z.string().min(1),
  sellerName: z.string().optional(),
  reason: z.string().optional(),
  adminQueueUrl: urlSchema,
});

const adminDisputeOpenedSchema = z.object({
  adminName: z.string().min(1),
  orderId: z.string().min(1),
  listingTitle: z.string().optional(),
  listingId: z.string().optional(),
  buyerId: z.string().min(1),
  disputeType: z.enum(['order_dispute', 'protected_transaction_dispute']),
  reason: z.string().min(1),
  adminOpsUrl: urlSchema,
});

export const EMAIL_EVENT_REGISTRY = [
  {
    type: 'order_confirmation',
    displayName: 'Order Confirmation',
    description: 'Sent to buyer after payment is received and the payout-hold workflow begins.',
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
    type: 'order_preparing',
    displayName: 'Order Preparing',
    description: 'Sent to buyer when seller marks the order as preparing for delivery.',
    schema: orderPreparingSchema,
    samplePayload: {
      buyerName: 'Alex Johnson',
      orderId: 'ORD_123456',
      listingTitle: 'Axis Doe (Breeder Stock)',
      orderUrl: 'https://wildlife.exchange/dashboard/orders/ORD_123456',
    },
    render: (data: OrderPreparingEmailData) => {
      const { subject, html } = getOrderPreparingEmail(data);
      return { subject, preheader: `Preparing delivery: ${data.listingTitle}`, html };
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
    type: 'bid_placed',
    displayName: 'Bid: Placed',
    description: 'Sent to confirm a bid was placed successfully.',
    schema: bidPlacedSchema,
    samplePayload: {
      userName: 'Alex',
      listingTitle: 'Blackbuck Trophy Buck',
      bidAmount: 9900,
      currentBidAmount: 9900,
      isHighBidder: true,
      listingUrl: 'https://wildlife.exchange/listing/abc123',
      auctionEndsAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    },
    render: (data: BidPlacedEmailData) => {
      const { subject, html } = getBidPlacedEmail(data);
      return { subject, preheader: data.isHighBidder ? `You're winning: ${data.listingTitle}` : `Bid placed: ${data.listingTitle}`, html };
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
  {
    type: 'message_received',
    displayName: 'Message: New Message',
    description: 'Sent to the recipient when a new in-app message arrives.',
    schema: messageReceivedSchema,
    samplePayload: {
      userName: 'Jordan',
      listingTitle: 'Axis Doe (Breeder Stock)',
      threadUrl: 'https://wildlife.exchange/seller/messages?threadId=THREAD_123',
      listingUrl: 'https://wildlife.exchange/listing/LISTING_123',
      senderRole: 'buyer',
      preview: 'Hi! Is transport available this week?',
    },
    render: (data: MessageReceivedEmailData) => {
      const { subject, html } = getMessageReceivedEmail(data);
      return { subject, preheader: `New message — ${data.listingTitle}`, html };
    },
  },
  {
    type: 'verify_email',
    displayName: 'User: Verify Email',
    description: 'Sent to a user to verify their email address.',
    schema: verifyEmailSchema,
    samplePayload: {
      userName: 'Alex',
      verifyUrl: 'https://wildlife.exchange/__/auth/action?mode=verifyEmail&oobCode=abc123',
      dashboardUrl: 'https://wildlife.exchange/dashboard/account?verified=1',
    },
    render: (data: VerifyEmailEmailData) => {
      const { subject, html } = getVerifyEmailEmail(data);
      return { subject, preheader: `Verify your email`, html };
    },
  },
  {
    type: 'offer_accepted',
    displayName: 'Offer: Accepted',
    description: 'Sent when an offer is accepted (high intent).',
    schema: offerAcceptedSchema,
    samplePayload: {
      userName: 'Alex',
      listingTitle: 'Axis Doe (Breeder Stock)',
      amount: 8500,
      offerUrl: 'https://wildlife.exchange/dashboard/offers/ABC123',
    },
    render: (data: OfferAcceptedEmailData) => {
      const { subject, html } = getOfferAcceptedEmail(data);
      return { subject, preheader: `Offer accepted`, html };
    },
  },
  {
    type: 'offer_submitted',
    displayName: 'Offer: Submitted',
    description: 'Sent to a buyer when they submit an offer (confirmation).',
    schema: offerSubmittedSchema,
    samplePayload: {
      userName: 'Alex',
      listingTitle: 'Axis Doe (Breeder Stock)',
      amount: 8500,
      offerUrl: 'https://wildlife.exchange/dashboard/offers',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    },
    render: (data: OfferSubmittedEmailData) => {
      const { subject, html } = getOfferSubmittedEmail(data);
      return { subject, preheader: `Offer submitted`, html };
    },
  },
  {
    type: 'offer_received',
    displayName: 'Offer: Received',
    description: 'Sent to a seller when a new offer is received.',
    schema: offerReceivedSchema,
    samplePayload: {
      userName: 'Jordan',
      listingTitle: 'Axis Doe (Breeder Stock)',
      amount: 8500,
      offerUrl: 'https://wildlife.exchange/seller/offers',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    },
    render: (data: OfferReceivedEmailData) => {
      const { subject, html } = getOfferReceivedEmail(data);
      return { subject, preheader: `New offer`, html };
    },
  },
  {
    type: 'offer_countered',
    displayName: 'Offer: Countered',
    description: 'Sent when a counter offer is made.',
    schema: offerCounteredSchema,
    samplePayload: {
      userName: 'Alex',
      listingTitle: 'Axis Doe (Breeder Stock)',
      amount: 9000,
      offerUrl: 'https://wildlife.exchange/dashboard/offers',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    },
    render: (data: OfferCounteredEmailData) => {
      const { subject, html } = getOfferCounteredEmail(data);
      return { subject, preheader: `Counter offer`, html };
    },
  },
  {
    type: 'offer_declined',
    displayName: 'Offer: Declined',
    description: 'Sent when an offer is declined.',
    schema: offerDeclinedSchema,
    samplePayload: {
      userName: 'Alex',
      listingTitle: 'Axis Doe (Breeder Stock)',
      offerUrl: 'https://wildlife.exchange/dashboard/offers',
    },
    render: (data: OfferDeclinedEmailData) => {
      const { subject, html } = getOfferDeclinedEmail(data);
      return { subject, preheader: `Offer declined`, html };
    },
  },
  {
    type: 'offer_expired',
    displayName: 'Offer: Expired',
    description: 'Sent when an offer expires.',
    schema: offerExpiredSchema,
    samplePayload: {
      userName: 'Alex',
      listingTitle: 'Axis Doe (Breeder Stock)',
      offerUrl: 'https://wildlife.exchange/dashboard/offers',
    },
    render: (data: OfferExpiredEmailData) => {
      const { subject, html } = getOfferExpiredEmail(data);
      return { subject, preheader: `Offer expired`, html };
    },
  },
  {
    type: 'listing_approved',
    displayName: 'Seller: Listing Approved',
    description: 'Sent to the seller when their listing is approved and goes live.',
    schema: listingApprovedSchema,
    samplePayload: {
      userName: 'Jordan',
      listingTitle: 'Axis Doe (Breeder Stock)',
      listingUrl: 'https://wildlife.exchange/listing/LISTING_123',
    },
    render: (data: ListingApprovedEmailData) => {
      const { subject, html } = getListingApprovedEmail(data);
      return { subject, preheader: `Your listing is approved`, html };
    },
  },
  {
    type: 'listing_rejected',
    displayName: 'Seller: Listing Rejected',
    description: 'Sent to the seller when their listing is rejected and needs edits.',
    schema: listingRejectedSchema,
    samplePayload: {
      userName: 'Jordan',
      listingTitle: 'Axis Doe (Breeder Stock)',
      editUrl: 'https://wildlife.exchange/seller/listings/LISTING_123/edit',
      reason: 'Missing required permit documentation.',
    },
    render: (data: ListingRejectedEmailData) => {
      const { subject, html } = getListingRejectedEmail(data);
      return { subject, preheader: `Listing changes required`, html };
    },
  },
  {
    type: 'admin_listing_submitted',
    displayName: 'Admin: Listing Submitted',
    description: 'Sent to admins when a listing is submitted and requires review.',
    schema: adminListingSubmittedSchema,
    samplePayload: {
      adminName: 'Admin',
      listingTitle: 'Axis Doe (Breeder Stock)',
      listingId: 'LISTING_123',
      sellerId: 'SELLER_123',
      sellerName: 'Jordan Smith',
      pendingReason: 'compliance_review',
      category: 'wildlife_exotics',
      listingType: 'auction',
      complianceStatus: 'pending_review',
      listingUrl: 'https://wildlife.exchange/listing/LISTING_123',
      adminQueueUrl: 'https://wildlife.exchange/dashboard/admin/listings',
      adminComplianceUrl: 'https://wildlife.exchange/dashboard/admin/compliance',
    },
    render: (data: AdminListingSubmittedEmailData) => {
      const { subject, html } = getAdminListingSubmittedEmail(data);
      return { subject, preheader: `Listing submitted: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'admin_listing_compliance_review',
    displayName: 'Admin: Listing Compliance Review Required',
    description: 'Sent to admins when a listing requires compliance review.',
    schema: adminListingComplianceReviewSchema,
    samplePayload: {
      adminName: 'Admin',
      listingTitle: 'Whitetail Buck (Breeder)',
      listingId: 'LISTING_234',
      sellerId: 'SELLER_234',
      sellerName: 'Kerry Carpenter',
      complianceStatus: 'pending_review',
      listingUrl: 'https://wildlife.exchange/listing/LISTING_234',
      adminComplianceUrl: 'https://wildlife.exchange/dashboard/admin/compliance',
    },
    render: (data: AdminListingComplianceReviewEmailData) => {
      const { subject, html } = getAdminListingComplianceReviewEmail(data);
      return { subject, preheader: `Compliance review: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'admin_listing_admin_approval',
    displayName: 'Admin: Listing Approval Required',
    description: 'Sent to admins when a listing requires admin approval.',
    schema: adminListingAdminApprovalSchema,
    samplePayload: {
      adminName: 'Admin',
      listingTitle: 'Ranch Equipment: Livestock Trailer',
      listingId: 'LISTING_345',
      sellerId: 'SELLER_345',
      sellerName: 'New Seller',
      listingUrl: 'https://wildlife.exchange/listing/LISTING_345',
      adminQueueUrl: 'https://wildlife.exchange/dashboard/admin/listings',
    },
    render: (data: AdminListingAdminApprovalEmailData) => {
      const { subject, html } = getAdminListingAdminApprovalEmail(data);
      return { subject, preheader: `Approval needed: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'admin_listing_approved',
    displayName: 'Admin: Listing Approved',
    description: 'Sent to admins when a listing is approved.',
    schema: adminListingApprovedSchema,
    samplePayload: {
      adminName: 'Admin',
      listingTitle: 'Axis Doe (Breeder Stock)',
      listingId: 'LISTING_123',
      sellerId: 'SELLER_123',
      sellerName: 'Jordan Smith',
      listingUrl: 'https://wildlife.exchange/listing/LISTING_123',
      adminQueueUrl: 'https://wildlife.exchange/dashboard/admin/listings',
    },
    render: (data: AdminListingApprovedEmailData) => {
      const { subject, html } = getAdminListingApprovedEmail(data);
      return { subject, preheader: `Listing approved: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'admin_listing_rejected',
    displayName: 'Admin: Listing Rejected',
    description: 'Sent to admins when a listing is rejected.',
    schema: adminListingRejectedSchema,
    samplePayload: {
      adminName: 'Admin',
      listingTitle: 'Axis Doe (Breeder Stock)',
      listingId: 'LISTING_123',
      sellerId: 'SELLER_123',
      sellerName: 'Jordan Smith',
      reason: 'Missing required permit documentation.',
      adminQueueUrl: 'https://wildlife.exchange/dashboard/admin/listings',
    },
    render: (data: AdminListingRejectedEmailData) => {
      const { subject, html } = getAdminListingRejectedEmail(data);
      return { subject, preheader: `Listing rejected: ${data.listingTitle}`, html };
    },
  },
  {
    type: 'admin_dispute_opened',
    displayName: 'Admin: Dispute Opened',
    description: 'Sent to admins when a dispute is opened on an order.',
    schema: adminDisputeOpenedSchema,
    samplePayload: {
      adminName: 'Admin',
      orderId: 'ORD_123456',
      listingTitle: 'Axis Doe (Breeder Stock)',
      listingId: 'LISTING_123',
      buyerId: 'BUYER_123',
      disputeType: 'protected_transaction_dispute',
      reason: 'death',
      adminOpsUrl: 'https://wildlife.exchange/dashboard/admin/ops',
    },
    render: (data: AdminDisputeOpenedEmailData) => {
      const { subject, html } = getAdminDisputeOpenedEmail(data);
      return { subject, preheader: `Dispute opened: ${data.orderId}`, html };
    },
  },
  {
    type: 'admin_breeder_permit_submitted',
    displayName: 'Admin: Breeder Permit Submitted',
    description: 'Sent to super admins when a breeder permit document is submitted and requires review.',
    schema: adminBreederPermitSubmittedSchema,
    samplePayload: {
      adminName: 'Admin',
      sellerId: 'SELLER_123',
      sellerName: 'Jordan Smith',
      permitNumber: 'TPWD-123456',
      storagePath: 'breederPermits/SELLER_123/permit.pdf',
      documentUrl: 'https://storage.googleapis.com/example/permit.pdf',
      adminComplianceUrl: 'https://wildlife.exchange/dashboard/admin/compliance',
    },
    render: (data: AdminBreederPermitSubmittedEmailData) => {
      const { subject, html } = getAdminBreederPermitSubmittedEmail(data);
      return { subject, preheader: `Breeder permit submitted`, html };
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

