import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth } from '@/lib/firebase/admin';
import { getDefaultNotificationPreferences, notificationPreferencesSchema } from './preferences';
import { decideChannels, getEventRule } from './rules';
import { buildInAppNotification } from './inApp';
import { checkAndIncrementRateLimit } from './rateLimit';
import { stableHash } from './eventKey';
import type { NotificationEventDoc, NotificationEventPayload, NotificationEventType, NotificationChannel } from './types';

export interface ProcessEventResult {
  ok: boolean;
  eventId: string;
  processed: boolean;
  error?: string;
}

function safeString(v: any): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

function clampInt32(n: number): number {
  // Clamp to int32 safe range: -2147483648 to 2147483647
  return Math.max(-2147483648, Math.min(2147483647, Math.round(n)));
}

async function loadUserContact(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<{ email: string | null; phone: string | null; name: string }> {
  try {
    const snap = await db.collection('users').doc(userId).get();
    const data = snap.exists ? (snap.data() as any) : null;
    const emailFromProfile = data?.email;
    const phoneFromProfile = typeof data?.phoneNumber === 'string' ? data.phoneNumber : null;
    const name =
      data?.displayName ||
      data?.profile?.fullName ||
      data?.profile?.businessName ||
      'there';

    // IMPORTANT:
    // Some environments do not store user email in Firestore (privacy/minimization),
    // but we still need an email to deliver notification emails. Fall back to Firebase Auth.
    if (typeof emailFromProfile === 'string' && emailFromProfile.includes('@')) {
      return { email: emailFromProfile, phone: phoneFromProfile, name: String(name || 'there') };
    }

    try {
      const auth = getAdminAuth();
      const user = await auth.getUser(userId);
      const email = user?.email;
      const authName = user?.displayName;
      return {
        email: typeof email === 'string' && email.includes('@') ? email : null,
        phone: phoneFromProfile,
        name: String(authName || name || 'there'),
      };
    } catch {
      return { email: null, phone: phoneFromProfile, name: String(name || 'there') };
    }
  } catch {
    return { email: null, phone: null, name: 'there' };
  }
}

function normalizePhone(v: any): string | null {
  const raw = typeof v === 'string' ? v.trim() : '';
  if (!raw) return null;
  // Very light validation: require E.164-ish "+1..." or at least digits count >= 10.
  if (raw.startsWith('+') && raw.length >= 11) return raw;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length >= 10) return `+${digits}`; // best-effort; encourage storing E.164 in profile
  return null;
}

function buildSmsBody(params: { eventType: NotificationEventType; payload: NotificationEventPayload }): string | null {
  const { eventType, payload } = params;
  switch (eventType) {
    case 'Order.Confirmed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.Confirmed' }>;
      return `Payment received for "${p.listingTitle}". View order: ${p.orderUrl}`;
    }
    case 'Order.Preparing': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.Preparing' }>;
      return `Seller is preparing delivery for "${p.listingTitle}". View order: ${p.orderUrl}`;
    }
    case 'Order.InTransit': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.InTransit' }>;
      return `In transit: "${p.listingTitle}". View order: ${p.orderUrl}`;
    }
    case 'Order.Delivered': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.Delivered' }>;
      return `Order delivered: "${p.listingTitle}". Please confirm receipt: ${p.orderUrl}`;
    }
    case 'Order.Accepted': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.Accepted' }>;
      return `Buyer accepted order for "${p.listingTitle}". Payment was processed when the buyer paid: ${p.orderUrl}`;
    }
    case 'Order.DeliveryCheckIn': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryCheckIn' }>;
      return `Quick check-in: confirm receipt or report an issue for "${p.listingTitle}". ${p.orderUrl}`;
    }
    case 'Order.Received': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.Received' }>;
      return `Buyer confirmed receipt for "${p.listingTitle}". View: ${p.orderUrl}`;
    }
    case 'Order.DeliveryScheduled': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryScheduled' }>;
      if (p.eta) return `Delivery scheduled for "${p.listingTitle}". ETA: ${new Date(p.eta).toLocaleString()}. ${p.orderUrl}`;
      return `The seller offered delivery times for "${p.listingTitle}". Choose your date: ${p.orderUrl}`;
    }
    case 'Order.DeliveryAgreed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryAgreed' }>;
      return `Buyer chose a delivery date for "${p.listingTitle}". ${new Date(p.windowStart).toLocaleString()}. ${p.orderUrl}`;
    }
    case 'Order.DeliveryAddressSet': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryAddressSet' }>;
      return `Buyer set delivery address for "${p.listingTitle}". Propose a delivery date: ${p.orderUrl}`;
    }
    case 'Order.DeliveryTrackingStarted': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryTrackingStarted' }>;
      return `Your seller started delivery for "${p.listingTitle}". Track it: ${p.orderUrl}`;
    }
    case 'Order.DeliveryTrackingStopped': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryTrackingStopped' }>;
      return p.delivered
        ? `Delivery completed for "${p.listingTitle}". Confirm receipt: ${p.orderUrl}`
        : `Live tracking ended for "${p.listingTitle}". ${p.orderUrl}`;
    }
    case 'Order.PickupReady': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.PickupReady' }>;
      return `Pickup ready for "${p.listingTitle}" at ${p.location}. Select a time window: ${p.orderUrl}`;
    }
    case 'Order.PickupWindowSelected': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.PickupWindowSelected' }>;
      return `Buyer proposed pickup window for "${p.listingTitle}". Agree to confirm: ${p.orderUrl}`;
    }
    case 'Order.PickupWindowAgreed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.PickupWindowAgreed' }>;
      return `Seller agreed to pickup window for "${p.listingTitle}". ${new Date(p.windowStart).toLocaleString()}. ${p.orderUrl}`;
    }
    case 'Order.PickupConfirmed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.PickupConfirmed' }>;
      return `Buyer confirmed pickup for "${p.listingTitle}". Transaction complete. ${p.orderUrl}`;
    }
    case 'Order.ReceiptConfirmed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.ReceiptConfirmed' }>;
      return `Buyer confirmed receipt for "${p.listingTitle}". Transaction complete. ${p.orderUrl}`;
    }
    case 'Review.Request': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Review.Request' }>;
      return `Review requested for "${p.listingTitle}". ${p.reviewUrl}`;
    }
    case 'Order.SlaApproaching': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.SlaApproaching' }>;
      return `Action required: "${p.listingTitle}" deadline approaching (${p.hoursRemaining}h remaining). ${p.orderUrl}`;
    }
    case 'Order.SlaOverdue': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.SlaOverdue' }>;
      return `URGENT: "${p.listingTitle}" is overdue (${p.hoursOverdue}h past deadline). ${p.orderUrl}`;
    }
    case 'Order.TransferComplianceRequired': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.TransferComplianceRequired' }>;
      return `TPWD transfer permit compliance required for "${p.listingTitle}". Confirm compliance: ${p.orderUrl}`;
    }
    case 'Order.ComplianceBuyerConfirmed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.ComplianceBuyerConfirmed' }>;
      return `Buyer confirmed TPWD transfer compliance for "${p.listingTitle}". View: ${p.orderUrl}`;
    }
    case 'Order.ComplianceSellerConfirmed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.ComplianceSellerConfirmed' }>;
      return `Seller confirmed TPWD transfer compliance for "${p.listingTitle}". View: ${p.orderUrl}`;
    }
    case 'Order.ComplianceUnlocked': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.ComplianceUnlocked' }>;
      return `Compliance confirmed! Fulfillment unlocked for "${p.listingTitle}". View: ${p.orderUrl}`;
    }
    default:
      return null;
  }
}

function buildEmailJobPayload(params: {
  eventType: NotificationEventType;
  payload: NotificationEventPayload;
  recipientName: string;
}): { template: string; templatePayload: Record<string, any> } | null {
  const { eventType, payload, recipientName } = params;

  switch (eventType) {
    case 'Auction.Outbid': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Auction.Outbid' }>;
      return {
        template: 'auction_outbid',
        templatePayload: {
          outbidderName: recipientName,
          listingTitle: p.listingTitle,
          newBidAmount: p.newHighBidAmount,
          listingUrl: p.listingUrl,
          auctionEndsAt: p.endsAt || undefined,
        },
      };
    }
    case 'Bid.Placed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Bid.Placed' }>;
      return {
        template: 'bid_placed',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          bidAmount: p.bidAmount,
          currentBidAmount: p.currentBidAmount,
          isHighBidder: p.isHighBidder,
          listingUrl: p.listingUrl,
          auctionEndsAt: p.endsAt || undefined,
        },
      };
    }
    case 'Auction.HighBidder': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Auction.HighBidder' }>;
      return {
        template: 'auction_high_bidder',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          yourBidAmount: p.yourBidAmount,
          listingUrl: p.listingUrl,
          auctionEndsAt: p.endsAt || undefined,
        },
      };
    }
    case 'Auction.EndingSoon': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Auction.EndingSoon' }>;
      return {
        template: 'auction_ending_soon',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          threshold: p.threshold,
          listingUrl: p.listingUrl,
          auctionEndsAt: p.endsAt,
          currentBidAmount: p.currentBidAmount,
        },
      };
    }
    case 'Auction.Won': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Auction.Won' }>;
      return {
        template: 'auction_winner',
        templatePayload: {
          winnerName: recipientName,
          listingTitle: p.listingTitle,
          winningBid: p.winningBidAmount,
          orderUrl: p.checkoutUrl || p.listingUrl,
          auctionEndDate: p.endsAt || new Date().toISOString(),
        },
      };
    }
    case 'Auction.Lost': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Auction.Lost' }>;
      return {
        template: 'auction_lost',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          listingUrl: p.listingUrl,
          finalBidAmount: p.finalBidAmount,
        },
      };
    }
    case 'Review.Request': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Review.Request' }>;
      return {
        template: 'review_request',
        templatePayload: {
          userName: recipientName,
          sellerDisplayName: p.sellerDisplayName,
          listingTitle: p.listingTitle,
          orderId: p.orderId,
          reviewUrl: p.reviewUrl,
        },
      };
    }
    case 'Order.Confirmed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.Confirmed' }>;
      return {
        template: 'order_confirmation',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          amount: p.amount,
          orderDate: new Date().toISOString(),
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.Preparing': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.Preparing' }>;
      return {
        template: 'order_preparing',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.InTransit': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.InTransit' }>;
      return {
        template: 'order_in_transit',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.Delivered': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.Delivered' }>;
      return {
        template: 'order_delivered',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.Accepted': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.Accepted' }>;
      return {
        template: 'order_accepted',
        templatePayload: {
          sellerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          amount: p.amount,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.DeliveryConfirmed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryConfirmed' }>;
      return {
        template: 'delivery_confirmation',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          deliveryDate: p.deliveryDate,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.DeliveryCheckIn': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryCheckIn' }>;
      // Clamp to prevent negative values from causing int32 serialization errors
      const safeDaysSinceDelivery = clampInt32(p.daysSinceDelivery);
      return {
        template: 'order_delivery_checkin',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          daysSinceDelivery: safeDaysSinceDelivery,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.DeliveryScheduled': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryScheduled' }>;
      return {
        template: 'order_in_transit',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.DeliveryAgreed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryAgreed' }>;
      return {
        template: 'order_received',
        templatePayload: {
          sellerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.DeliveryAddressSet': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryAddressSet' }>;
      return {
        template: 'order_in_transit',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.DeliveryTrackingStarted': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryTrackingStarted' }>;
      return {
        template: 'order_in_transit',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.DeliveryTrackingStopped': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.DeliveryTrackingStopped' }>;
      return {
        template: p.delivered ? 'order_delivered' : 'order_in_transit',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.PickupReady': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.PickupReady' }>;
      // Use order_in_transit template for now (can be enhanced later)
      return {
        template: 'order_in_transit',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.PickupWindowSelected': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.PickupWindowSelected' }>;
      return {
        template: 'order_received',
        templatePayload: {
          sellerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.PickupWindowAgreed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.PickupWindowAgreed' }>;
      return {
        template: 'order_in_transit',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.PickupConfirmed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.PickupConfirmed' }>;
      // Use order_received template
      return {
        template: 'order_received',
        templatePayload: {
          sellerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.ReceiptConfirmed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.ReceiptConfirmed' }>;
      // Use order_received template
      return {
        template: 'order_received',
        templatePayload: {
          sellerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.SlaApproaching': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.SlaApproaching' }>;
      // Use order_delivery_checkin template for now (can be enhanced later)
      // Clamp hoursRemaining to prevent negative values from causing int32 serialization errors
      const safeHoursRemaining = clampInt32(p.hoursRemaining);
      return {
        template: 'order_delivery_checkin',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
          daysSinceDelivery: 0,
        },
      };
    }
    case 'Order.SlaOverdue': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.SlaOverdue' }>;
      // Use order_delivery_checkin template for now (can be enhanced later)
      // Clamp hoursOverdue to prevent negative values from causing int32 serialization errors
      const safeHoursOverdue = clampInt32(p.hoursOverdue);
      const safeDaysSinceDelivery = clampInt32(safeHoursOverdue / 24);
      return {
        template: 'order_delivery_checkin',
        templatePayload: {
          buyerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
          daysSinceDelivery: safeDaysSinceDelivery,
        },
      };
    }
    case 'Order.TransferComplianceRequired': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.TransferComplianceRequired' }>;
      return {
        template: 'order_transfer_compliance_required',
        templatePayload: {
          recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.ComplianceBuyerConfirmed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.ComplianceBuyerConfirmed' }>;
      return {
        template: 'order_compliance_buyer_confirmed',
        templatePayload: {
          recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.ComplianceSellerConfirmed': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.ComplianceSellerConfirmed' }>;
      return {
        template: 'order_compliance_seller_confirmed',
        templatePayload: {
          recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.ComplianceUnlocked': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.ComplianceUnlocked' }>;
      return {
        template: 'order_compliance_unlocked',
        templatePayload: {
          recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Order.Received': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Order.Received' }>;
      return {
        template: 'order_received',
        templatePayload: {
          sellerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          orderUrl: p.orderUrl,
        },
      };
    }
    case 'Payout.Released': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Payout.Released' }>;
      return {
        template: 'payout_released',
        templatePayload: {
          sellerName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle,
          amount: p.amount,
          transferId: p.transferId,
          payoutDate: p.payoutDate,
        },
      };
    }
    case 'User.Welcome': {
      const p = payload as Extract<NotificationEventPayload, { type: 'User.Welcome' }>;
      return {
        template: 'user_welcome',
        templatePayload: {
          userName: recipientName,
          dashboardUrl: p.dashboardUrl,
        },
      };
    }
    case 'User.ProfileIncompleteReminder': {
      const p = payload as Extract<NotificationEventPayload, { type: 'User.ProfileIncompleteReminder' }>;
      return {
        template: 'profile_incomplete_reminder',
        templatePayload: {
          userName: recipientName,
          settingsUrl: p.settingsUrl,
          missingFields: p.missingFields || undefined,
        },
      };
    }
    case 'Marketing.WeeklyDigest': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Marketing.WeeklyDigest' }>;
      return {
        template: 'marketing_weekly_digest',
        templatePayload: {
          userName: recipientName,
          listings: (p.listings || []).map((l) => ({
            title: l.title,
            url: l.url,
            price: l.price,
            endsAt: l.endsAt || undefined,
          })),
          unsubscribeUrl: p.unsubscribeUrl || undefined,
        },
      };
    }
    case 'Marketing.SavedSearchAlert': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Marketing.SavedSearchAlert' }>;
      return {
        template: 'marketing_saved_search_alert',
        templatePayload: {
          userName: recipientName,
          queryName: p.queryName,
          resultsCount: p.resultsCount,
          searchUrl: p.searchUrl,
          unsubscribeUrl: p.unsubscribeUrl || undefined,
        },
      };
    }
    case 'Message.Received': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Message.Received' }>;
      return {
        template: 'message_received',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          threadUrl: p.threadUrl,
          listingUrl: p.listingUrl,
          senderRole: p.senderRole,
          preview: p.preview || undefined,
        },
      };
    }
    case 'Offer.Accepted': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Offer.Accepted' }>;
      return {
        template: 'offer_accepted',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          amount: p.amount,
          offerUrl: p.offerUrl,
        },
      };
    }
    case 'Offer.Submitted': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Offer.Submitted' }>;
      return {
        template: 'offer_submitted',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          amount: p.amount,
          offerUrl: p.offerUrl,
          expiresAt: p.expiresAt || undefined,
        },
      };
    }
    case 'Offer.Received': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Offer.Received' }>;
      return {
        template: 'offer_received',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          amount: p.amount,
          offerUrl: p.offerUrl,
          expiresAt: p.expiresAt || undefined,
        },
      };
    }
    case 'Offer.Countered': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Offer.Countered' }>;
      return {
        template: 'offer_countered',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          amount: p.amount,
          offerUrl: p.offerUrl,
          expiresAt: p.expiresAt || undefined,
        },
      };
    }
    case 'Offer.Declined': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Offer.Declined' }>;
      return {
        template: 'offer_declined',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          offerUrl: p.offerUrl,
        },
      };
    }
    case 'Offer.Expired': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Offer.Expired' }>;
      return {
        template: 'offer_expired',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          offerUrl: p.offerUrl,
        },
      };
    }
    case 'Listing.Approved': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Listing.Approved' }>;
      return {
        template: 'listing_approved',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          listingUrl: p.listingUrl,
        },
      };
    }
    case 'Listing.Rejected': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Listing.Rejected' }>;
      return {
        template: 'listing_rejected',
        templatePayload: {
          userName: recipientName,
          listingTitle: p.listingTitle,
          editUrl: p.editUrl,
          reason: (p as any).reason || undefined,
        },
      };
    }
    case 'Admin.Listing.Submitted': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Admin.Listing.Submitted' }>;
      return {
        template: 'admin_listing_submitted',
        templatePayload: {
          adminName: recipientName,
          listingTitle: p.listingTitle,
          listingId: p.listingId,
          sellerId: p.sellerId,
          sellerName: p.sellerName || undefined,
          pendingReason: p.pendingReason || 'unknown',
          category: p.category || undefined,
          listingType: p.listingType || undefined,
          complianceStatus: p.complianceStatus || undefined,
          listingUrl: p.listingUrl,
          adminQueueUrl: p.adminQueueUrl,
          adminComplianceUrl: p.adminComplianceUrl || undefined,
        },
      };
    }
    case 'Admin.Listing.ComplianceReviewRequired': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Admin.Listing.ComplianceReviewRequired' }>;
      return {
        template: 'admin_listing_compliance_review',
        templatePayload: {
          adminName: recipientName,
          listingTitle: p.listingTitle,
          listingId: p.listingId,
          sellerId: p.sellerId,
          sellerName: p.sellerName || undefined,
          complianceStatus: p.complianceStatus || undefined,
          listingUrl: p.listingUrl,
          adminComplianceUrl: p.adminComplianceUrl,
        },
      };
    }
    case 'Admin.Listing.AdminApprovalRequired': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Admin.Listing.AdminApprovalRequired' }>;
      return {
        template: 'admin_listing_admin_approval',
        templatePayload: {
          adminName: recipientName,
          listingTitle: p.listingTitle,
          listingId: p.listingId,
          sellerId: p.sellerId,
          sellerName: p.sellerName || undefined,
          listingUrl: p.listingUrl,
          adminQueueUrl: p.adminQueueUrl,
        },
      };
    }
    case 'Admin.Listing.Approved': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Admin.Listing.Approved' }>;
      return {
        template: 'admin_listing_approved',
        templatePayload: {
          adminName: recipientName,
          listingTitle: p.listingTitle,
          listingId: p.listingId,
          sellerId: p.sellerId,
          sellerName: p.sellerName || undefined,
          listingUrl: p.listingUrl,
          adminQueueUrl: p.adminQueueUrl,
        },
      };
    }
    case 'Admin.Listing.Rejected': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Admin.Listing.Rejected' }>;
      return {
        template: 'admin_listing_rejected',
        templatePayload: {
          adminName: recipientName,
          listingTitle: p.listingTitle,
          listingId: p.listingId,
          sellerId: p.sellerId,
          sellerName: p.sellerName || undefined,
          reason: p.reason || undefined,
          adminQueueUrl: p.adminQueueUrl,
        },
      };
    }
    case 'Admin.Order.DisputeOpened': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Admin.Order.DisputeOpened' }>;
      return {
        template: 'admin_dispute_opened',
        templatePayload: {
          adminName: recipientName,
          orderId: p.orderId,
          listingTitle: p.listingTitle || undefined,
          listingId: p.listingId || undefined,
          buyerId: p.buyerId,
          disputeType: p.disputeType,
          reason: p.reason,
          adminOpsUrl: p.adminOpsUrl,
        },
      };
    }
    case 'Admin.BreederPermit.Submitted': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Admin.BreederPermit.Submitted' }>;
      return {
        template: 'admin_breeder_permit_submitted',
        templatePayload: {
          adminName: recipientName,
          sellerId: p.sellerId,
          sellerName: p.sellerName || undefined,
          permitNumber: p.permitNumber ?? undefined,
          storagePath: p.storagePath,
          documentUrl: p.documentUrl ?? undefined,
          adminComplianceUrl: p.adminComplianceUrl,
        },
      };
    }
    default:
      return null;
  }
}

async function loadUserPrefs(db: FirebaseFirestore.Firestore, userId: string) {
  const ref = db.collection('users').doc(userId).collection('notificationPreferences').doc('default');
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() as any;
    // Parse with defaults.
    return notificationPreferencesSchema.parse(data || {});
  }

  // One-time migration path (legacy -> canonical):
  // If `users/{uid}/notificationPreferences/default` is missing but legacy `users/{uid}.profile.notifications.*` exists,
  // create the canonical doc so the pipeline has ONE source of truth.
  try {
    const userSnap = await db.collection('users').doc(userId).get();
    const user = userSnap.exists ? (userSnap.data() as any) : null;
    const legacy = user?.profile?.notifications;
    if (legacy && typeof legacy === 'object') {
      const bids = typeof legacy.bids === 'boolean' ? legacy.bids : true;
      const messages = typeof legacy.messages === 'boolean' ? legacy.messages : true;
      const promotions = typeof legacy.promotions === 'boolean' ? legacy.promotions : false;
      const email = typeof legacy.email === 'boolean' ? legacy.email : true;
      const sms = typeof legacy.sms === 'boolean' ? legacy.sms : false;

      const next = notificationPreferencesSchema.parse({
        channels: { email, push: false, sms },
        categories: {
          auctions: {
            watchStarted: bids,
            highBidder: bids,
            outbid: bids,
            endingSoon: bids,
            wonLost: bids,
          },
          messages: { messageReceived: messages },
          marketing: { weeklyDigest: promotions, savedSearchAlerts: promotions },
        },
      });

      await ref.set({ ...next, updatedAt: FieldValue.serverTimestamp() } as any, { merge: true });
      return next;
    }
  } catch {
    // If migration fails, fall back to defaults (do not fail the notification pipeline).
  }

  return getDefaultNotificationPreferences();
}

async function isSuperAdminUser(db: FirebaseFirestore.Firestore, userId: string): Promise<boolean> {
  try {
    const snap = await db.collection('users').doc(userId).get();
    if (!snap.exists) return false;
    const u = snap.data() as any;
    return u?.role === 'super_admin' || u?.superAdmin === true;
  } catch {
    return false;
  }
}

async function listUserPushTokens(db: FirebaseFirestore.Firestore, userId: string): Promise<Array<{ token: string; platform?: string }>> {
  const snap = await db.collection('users').doc(userId).collection('pushTokens').get();
  const out: Array<{ token: string; platform?: string }> = [];
  snap.docs.forEach((d) => {
    const data = d.data() as any;
    if (typeof data?.token === 'string' && data.token.length > 20) {
      out.push({ token: data.token, platform: typeof data.platform === 'string' ? data.platform : undefined });
    }
  });
  return out;
}

function buildPushPayload(eventType: NotificationEventType, payload: NotificationEventPayload): { title: string; body: string; deepLinkUrl?: string; notificationType: string; entityId?: string } {
  switch (eventType) {
    case 'Auction.Outbid': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Auction.Outbid' }>;
      return { title: 'You were outbid', body: p.listingTitle, deepLinkUrl: p.listingUrl, notificationType: 'Auction.Outbid', entityId: p.listingId };
    }
    case 'Auction.EndingSoon': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Auction.EndingSoon' }>;
      return { title: `Ending soon (${p.threshold})`, body: p.listingTitle, deepLinkUrl: p.listingUrl, notificationType: 'Auction.EndingSoon', entityId: p.listingId };
    }
    case 'Auction.Won': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Auction.Won' }>;
      return { title: 'You won!', body: p.listingTitle, deepLinkUrl: p.checkoutUrl || p.listingUrl, notificationType: 'Auction.Won', entityId: p.listingId };
    }
    case 'Message.Received': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Message.Received' }>;
      return { title: 'New message', body: p.listingTitle, deepLinkUrl: p.threadUrl, notificationType: 'Message.Received', entityId: p.threadId };
    }
    case 'Offer.Accepted': {
      const p = payload as Extract<NotificationEventPayload, { type: 'Offer.Accepted' }>;
      return { title: 'Offer accepted', body: `Offer accepted on ${p.listingTitle}`, deepLinkUrl: p.offerUrl, notificationType: 'Offer.Accepted', entityId: p.offerId };
    }
    default:
      return { title: 'Update', body: 'You have a new update.', notificationType: eventType };
  }
}

async function enforceRateLimit(params: {
  db: FirebaseFirestore.Firestore;
  userId: string;
  channel: NotificationChannel;
  perHour: number;
  perDay: number;
}): Promise<boolean> {
  const res = await checkAndIncrementRateLimit(params);
  return res.allowed;
}

export async function processEventDoc(params: {
  db: FirebaseFirestore.Firestore;
  eventRef: FirebaseFirestore.DocumentReference;
  eventData: NotificationEventDoc;
}): Promise<ProcessEventResult> {
  const { db, eventRef, eventData } = params;
  const eventId = eventData.id;

  const targetUserId = eventData.targetUserIds?.[0];
  if (!targetUserId) {
    await eventRef.set(
      { status: 'failed', processing: { ...(eventData.processing || { attempts: 0, lastAttemptAt: null }), error: 'Missing targetUserIds' } },
      { merge: true }
    );
    return { ok: false, eventId, processed: false, error: 'Missing target user' };
  }

  const prefs = await loadUserPrefs(db, targetUserId);
  const decisionBase = decideChannels({ eventType: eventData.type, payload: eventData.payload, prefs });
  const rule = getEventRule(eventData.type, eventData.payload);

  // Admin events: ensure super admins ALWAYS get email, and keep admin-email noise down for regular admins.
  const isAdminEvent = eventData.type.startsWith('Admin.');
  const isSuperAdmin = isAdminEvent ? await isSuperAdminUser(db, targetUserId) : false;

  const decision = (() => {
    if (!isAdminEvent) return decisionBase;
    if (isSuperAdmin) {
      return {
        ...decisionBase,
        allow: true,
        category: decisionBase.category,
        urgency: decisionBase.urgency,
        channels: {
          ...decisionBase.channels,
          // Always allow in-app for admins (keeps dashboards consistent)
          inApp: { enabled: true },
          // Force email for super admins regardless of preferences/quiet hours.
          email: { enabled: true },
        },
      };
    }
    // Non-super admins: suppress admin emails (in-app only) to avoid noise.
    return {
      ...decisionBase,
      channels: {
        ...decisionBase.channels,
        email: { enabled: false, reason: 'admin_email_super_admin_only' },
      },
    };
  })();

  // If marketing event and user has marketing disabled, decision.allow will be false.
  if (!decision.allow) {
    await eventRef.set({ status: 'processed', processing: { ...(eventData.processing || { attempts: 0, lastAttemptAt: null }) } }, { merge: true });
    return { ok: true, eventId, processed: true };
  }

  // 1) In-app
  if (decision.channels.inApp.enabled) {
    const notif = buildInAppNotification({
      eventId,
      eventType: eventData.type,
      category: decision.category,
      userId: targetUserId,
      actorId: eventData.actorId,
      entityType: eventData.entityType,
      entityId: eventData.entityId,
      payload: eventData.payload,
      test: eventData.test === true,
    });
    // Some notification types (e.g., Message.Received) intentionally collapse into a stable doc id
    // so the notification feed doesn't spam users with one row per message.
    const notifRef = db.collection('users').doc(targetUserId).collection('notifications').doc(notif.id);
    await notifRef.set(notif as any, { merge: true });
  }

  // 2) Email job
  if (decision.channels.email.enabled) {
    const allowed =
      isAdminEvent && isSuperAdmin
        ? true
        : await enforceRateLimit({
            db,
            userId: targetUserId,
            channel: 'email',
            perHour: rule.rateLimitPerUser.email?.perHour || 0,
            perDay: rule.rateLimitPerUser.email?.perDay || 0,
          });
    if (allowed) {
      const contact = await loadUserContact(db, targetUserId);
      const built = buildEmailJobPayload({ eventType: eventData.type, payload: eventData.payload as any, recipientName: contact.name });
      if (contact.email && built) {
        const jobRef = db.collection('emailJobs').doc(eventId);
        await jobRef.set(
          {
            id: eventId,
            eventId,
            userId: targetUserId,
            toEmail: contact.email,
            template: built.template,
            templatePayload: built.templatePayload,
            status: 'queued',
            createdAt: FieldValue.serverTimestamp(),
            attempts: 0,
            lastAttemptAt: null,
            ...(decision.channels.email.deliverAfterMs ? { deliverAfterAt: new Date(Date.now() + decision.channels.email.deliverAfterMs) } : {}),
            ...(eventData.test ? { test: true } : {}),
          } as any,
          { merge: true }
        );
      }
    }
  }

  // 3) Push jobs
  if (decision.channels.push.enabled) {
    const allowed = await enforceRateLimit({
      db,
      userId: targetUserId,
      channel: 'push',
      perHour: rule.rateLimitPerUser.push?.perHour || 0,
      perDay: rule.rateLimitPerUser.push?.perDay || 0,
    });
    if (allowed) {
      const tokens = await listUserPushTokens(db, targetUserId);
      if (tokens.length > 0) {
        const pushPayload = buildPushPayload(eventData.type, eventData.payload as any);
        for (const t of tokens) {
          const jobId = `${eventId}_${stableHash(t.token).slice(0, 10)}`;
          const jobRef = db.collection('pushJobs').doc(jobId);
          await jobRef.set(
            {
              id: jobId,
              eventId,
              userId: targetUserId,
              token: t.token,
              platform: t.platform || null,
              payload: pushPayload,
              status: 'queued',
              createdAt: FieldValue.serverTimestamp(),
              attempts: 0,
              lastAttemptAt: null,
              ...(decision.channels.push.deliverAfterMs ? { deliverAfterAt: new Date(Date.now() + decision.channels.push.deliverAfterMs) } : {}),
              ...(eventData.test ? { test: true } : {}),
            } as any,
            { merge: true }
          );
        }
      }
    }
  }

  // 4) SMS jobs
  if (decision.channels.sms.enabled) {
    const allowed = await enforceRateLimit({
      db,
      userId: targetUserId,
      channel: 'sms',
      perHour: rule.rateLimitPerUser.sms?.perHour || 0,
      perDay: rule.rateLimitPerUser.sms?.perDay || 0,
    });
    if (allowed) {
      const contact = await loadUserContact(db, targetUserId);
      const toPhone = normalizePhone(contact.phone);
      const body = buildSmsBody({ eventType: eventData.type, payload: eventData.payload as any });
      const jobRef = db.collection('smsJobs').doc(eventId);
      if (!toPhone || !body) {
        await jobRef.set(
          {
            id: eventId,
            eventId,
            userId: targetUserId,
            toPhone: toPhone || null,
            body: body || null,
            status: 'skipped',
            createdAt: FieldValue.serverTimestamp(),
            attempts: 0,
            lastAttemptAt: null,
            error: !toPhone ? 'Missing/invalid phone number' : 'Unsupported SMS event',
            ...(eventData.test ? { test: true } : {}),
          } as any,
          { merge: true }
        );
      } else {
        await jobRef.set(
          {
            id: eventId,
            eventId,
            userId: targetUserId,
            toPhone,
            body,
            status: 'queued',
            createdAt: FieldValue.serverTimestamp(),
            attempts: 0,
            lastAttemptAt: null,
            ...(decision.channels.sms.deliverAfterMs ? { deliverAfterAt: new Date(Date.now() + decision.channels.sms.deliverAfterMs) } : {}),
            ...(eventData.test ? { test: true } : {}),
          } as any,
          { merge: true }
        );
      }
    }
  }

  // Mark processed
  await eventRef.set({ status: 'processed', processing: { ...(eventData.processing || { attempts: 0, lastAttemptAt: null }), error: FieldValue.delete() } }, { merge: true });
  return { ok: true, eventId, processed: true };
}

