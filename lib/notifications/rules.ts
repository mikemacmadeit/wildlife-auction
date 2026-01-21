import type { NotificationEventPayload, NotificationEventType, NotificationUrgency, NotificationChannel } from './types';
import type { NotificationPreferencesDoc } from './preferences';

export type NotificationCategory = 'auctions' | 'orders' | 'onboarding' | 'marketing' | 'messages' | 'admin';

export interface EventRule {
  category: NotificationCategory;
  urgency: NotificationUrgency;
  channels: Array<NotificationChannel>;
  dedupeWindowMs: number;
  rateLimitPerUser: Partial<
    Record<
      NotificationChannel,
      {
        perHour: number;
        perDay: number;
      }
    >
  >;
  allowDuringQuietHours: boolean;
}

export interface RuleDecision {
  allow: boolean;
  suppressedReason?: string;
  category: NotificationCategory;
  urgency: NotificationUrgency;
  channels: Record<NotificationChannel, { enabled: boolean; deliverAfterMs?: number; reason?: string }>;
}

function safeTimeZone(tz: string | undefined): string {
  if (!tz) return 'America/Chicago';
  try {
    // validate
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'America/Chicago';
  }
}

function getLocalHour(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === 'hour')?.value;
  const hour = hourPart ? Number(hourPart) : NaN;
  return Number.isFinite(hour) ? hour : date.getHours();
}

function isQuietHoursNow(date: Date, prefs: NotificationPreferencesDoc): boolean {
  if (!prefs.quietHours?.enabled) return false;
  const tz = safeTimeZone(prefs.timezone);
  const h = getLocalHour(date, tz);
  const start = prefs.quietHours.startHour;
  const end = prefs.quietHours.endHour;
  if (start === end) return false;
  // If start > end, quiet hours wraps past midnight.
  if (start > end) return h >= start || h < end;
  return h >= start && h < end;
}

function msUntilQuietHoursEnd(now: Date, prefs: NotificationPreferencesDoc): number {
  const tz = safeTimeZone(prefs.timezone);
  const endHour = prefs.quietHours.endHour;

  // Compute "next end hour" in local time by stepping hour-by-hour (robust, avoids timezone math libs).
  // Worst case <= 24 iterations.
  for (let i = 0; i <= 24; i++) {
    const d = new Date(now.getTime() + i * 60 * 60 * 1000);
    const localHour = getLocalHour(d, tz);
    if (localHour === endHour && !isQuietHoursNow(d, prefs)) {
      // deliver at this moment (rounded to this hour)
      const target = new Date(d);
      target.setMinutes(0, 0, 0);
      return Math.max(0, target.getTime() - now.getTime());
    }
  }
  return 0;
}

export function getEventRule(type: NotificationEventType, payload: NotificationEventPayload): EventRule {
  switch (type) {
    case 'Auction.WatchStarted':
      return {
        category: 'auctions',
        urgency: 'low',
        channels: ['inApp', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24, // 24h
        rateLimitPerUser: { email: { perHour: 2, perDay: 6 } },
        allowDuringQuietHours: true,
      };
    case 'Auction.HighBidder':
      return {
        category: 'auctions',
        urgency: 'normal',
        channels: ['inApp', 'push', 'email'],
        dedupeWindowMs: 1000 * 60 * 5,
        rateLimitPerUser: { push: { perHour: 12, perDay: 50 }, email: { perHour: 4, perDay: 12 } },
        allowDuringQuietHours: false,
      };
    case 'Auction.Outbid':
      return {
        category: 'auctions',
        urgency: 'high',
        channels: ['inApp', 'push', 'email'],
        dedupeWindowMs: 1000 * 60 * 2,
        rateLimitPerUser: { push: { perHour: 20, perDay: 80 }, email: { perHour: 6, perDay: 18 } },
        allowDuringQuietHours: false,
      };
    case 'Auction.EndingSoon': {
      const threshold = (payload as any)?.threshold as string | undefined;
      const urgency: NotificationUrgency =
        threshold === '2m' ? 'critical' : threshold === '10m' ? 'high' : threshold === '1h' ? 'normal' : 'low';
      return {
        category: 'auctions',
        urgency,
        channels: ['inApp', 'push', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24,
        rateLimitPerUser: { push: { perHour: 10, perDay: 40 }, email: { perHour: 3, perDay: 10 } },
        allowDuringQuietHours: urgency === 'critical',
      };
    }
    case 'Auction.Won':
      return {
        category: 'auctions',
        urgency: 'critical',
        channels: ['inApp', 'push', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24,
        rateLimitPerUser: { email: { perHour: 2, perDay: 4 }, push: { perHour: 4, perDay: 10 } },
        allowDuringQuietHours: true,
      };
    case 'Auction.Lost':
      return {
        category: 'auctions',
        urgency: 'normal',
        channels: ['inApp', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24,
        rateLimitPerUser: { email: { perHour: 2, perDay: 6 } },
        allowDuringQuietHours: true,
      };
    case 'Auction.BidReceived':
      return {
        category: 'auctions',
        urgency: 'normal',
        channels: ['inApp'],
        dedupeWindowMs: 1000 * 60,
        rateLimitPerUser: {},
        allowDuringQuietHours: true,
      };
    case 'Listing.Approved':
    case 'Listing.Rejected':
    case 'Listing.ComplianceApproved':
    case 'Listing.ComplianceRejected':
      return {
        category: 'admin',
        urgency: 'normal',
        channels: ['inApp'],
        dedupeWindowMs: 1000 * 60 * 60 * 24,
        rateLimitPerUser: {},
        allowDuringQuietHours: true,
      };
    case 'Admin.BreederPermit.Submitted':
      return {
        category: 'admin',
        urgency: 'high',
        channels: ['inApp'],
        dedupeWindowMs: 1000 * 60 * 10,
        rateLimitPerUser: {},
        allowDuringQuietHours: true,
      };
    case 'Order.Confirmed':
      return {
        category: 'orders',
        urgency: 'normal',
        channels: ['inApp', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24,
        rateLimitPerUser: { email: { perHour: 4, perDay: 10 } },
        allowDuringQuietHours: true,
      };
    case 'Order.Received':
      return {
        category: 'orders',
        urgency: 'normal',
        channels: ['inApp', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24,
        rateLimitPerUser: { email: { perHour: 3, perDay: 8 } },
        allowDuringQuietHours: true,
      };
    case 'Order.InTransit':
      return {
        category: 'orders',
        urgency: 'normal',
        channels: ['inApp', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24,
        rateLimitPerUser: { email: { perHour: 4, perDay: 10 } },
        allowDuringQuietHours: true,
      };
    case 'Order.DeliveryConfirmed':
      return {
        category: 'orders',
        urgency: 'normal',
        channels: ['inApp', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24,
        rateLimitPerUser: { email: { perHour: 4, perDay: 10 } },
        allowDuringQuietHours: true,
      };
    case 'Order.DeliveryCheckIn':
      return {
        category: 'orders',
        urgency: 'low',
        channels: ['inApp', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24 * 7,
        rateLimitPerUser: { email: { perHour: 2, perDay: 4 } },
        allowDuringQuietHours: true,
      };
    case 'Payout.Released':
      return {
        category: 'orders',
        urgency: 'normal',
        channels: ['inApp', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24,
        rateLimitPerUser: { email: { perHour: 3, perDay: 8 } },
        allowDuringQuietHours: true,
      };
    case 'User.Welcome':
      return {
        category: 'onboarding',
        urgency: 'low',
        channels: ['inApp', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24,
        rateLimitPerUser: { email: { perHour: 2, perDay: 2 } },
        allowDuringQuietHours: true,
      };
    case 'User.ProfileIncompleteReminder':
      return {
        category: 'onboarding',
        urgency: 'low',
        channels: ['inApp', 'email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24 * 3,
        rateLimitPerUser: { email: { perHour: 1, perDay: 2 } },
        allowDuringQuietHours: true,
      };
    case 'Marketing.WeeklyDigest':
      return {
        category: 'marketing',
        urgency: 'low',
        channels: ['email'],
        dedupeWindowMs: 1000 * 60 * 60 * 24 * 6,
        rateLimitPerUser: { email: { perHour: 1, perDay: 1 } },
        allowDuringQuietHours: true,
      };
    case 'Marketing.SavedSearchAlert':
      return {
        category: 'marketing',
        urgency: 'low',
        channels: ['inApp', 'push', 'email'],
        dedupeWindowMs: 1000 * 60 * 30,
        rateLimitPerUser: { push: { perHour: 6, perDay: 20 }, email: { perHour: 2, perDay: 6 } },
        allowDuringQuietHours: true,
      };
    case 'Message.Received':
      return {
        category: 'messages',
        urgency: 'normal',
        channels: ['inApp', 'push', 'email'],
        dedupeWindowMs: 1000 * 30,
        rateLimitPerUser: { push: { perHour: 30, perDay: 200 }, email: { perHour: 10, perDay: 40 } },
        // Messaging should be immediate; do not delay during quiet hours.
        allowDuringQuietHours: true,
      };
    case 'Offer.Received':
    case 'Offer.Countered':
    case 'Offer.Accepted':
    case 'Offer.Declined':
    case 'Offer.Expired':
      return {
        // Offers are purchase intent and belong in the transaction lane.
        category: 'orders',
        urgency: type === 'Offer.Accepted' ? 'high' : 'normal',
        // eBay-like: email for key offer activity; push only for accepted (high intent).
        channels:
          type === 'Offer.Accepted'
            ? (['inApp', 'email', 'push'] as any)
            : (['inApp', 'email'] as any),
        dedupeWindowMs: 1000 * 60 * 10,
        rateLimitPerUser:
          type === 'Offer.Accepted'
            ? { push: { perHour: 10, perDay: 30 }, email: { perHour: 6, perDay: 15 } }
            : { email: { perHour: 10, perDay: 30 } },
        allowDuringQuietHours: true,
      };
    case 'Admin.Listing.Submitted':
    case 'Admin.Listing.ComplianceReviewRequired':
    case 'Admin.Listing.AdminApprovalRequired':
    case 'Admin.Listing.Approved':
    case 'Admin.Listing.Rejected':
    case 'Admin.Order.DisputeOpened':
      return {
        category: 'admin',
        urgency: type === 'Admin.Order.DisputeOpened' ? 'critical' : 'high',
        channels: ['inApp', 'email'],
        dedupeWindowMs: 1000 * 60 * 5,
        rateLimitPerUser: { email: { perHour: 30, perDay: 200 } },
        allowDuringQuietHours: true,
      };
    default:
      return {
        category: 'orders',
        urgency: 'normal',
        channels: ['inApp'],
        dedupeWindowMs: 1000 * 60 * 60,
        rateLimitPerUser: {},
        allowDuringQuietHours: true,
      };
  }
}

export function decideChannels(params: {
  eventType: NotificationEventType;
  payload: NotificationEventPayload;
  prefs: NotificationPreferencesDoc;
  now?: Date;
}): RuleDecision {
  const now = params.now || new Date();
  const rule = getEventRule(params.eventType, params.payload);
  const p = params.prefs;

  // Category toggle
  const cats = p.categories;
  const allowedByCategory = (() => {
    switch (rule.category) {
      case 'auctions': {
        if (params.eventType === 'Auction.WatchStarted') return cats.auctions.watchStarted;
        if (params.eventType === 'Auction.HighBidder') return cats.auctions.highBidder;
        if (params.eventType === 'Auction.Outbid') return cats.auctions.outbid;
        if (params.eventType === 'Auction.EndingSoon') return cats.auctions.endingSoon;
        if (params.eventType === 'Auction.Won' || params.eventType === 'Auction.Lost') return cats.auctions.wonLost;
        return true;
      }
      case 'orders': {
        if (params.eventType === 'Order.Confirmed') return cats.orders.confirmed;
        if (params.eventType === 'Order.Received') return cats.orders.confirmed;
        if (params.eventType === 'Order.DeliveryConfirmed') return cats.orders.deliveryConfirmed;
        if (params.eventType === 'Order.DeliveryCheckIn') return cats.orders.deliveryCheckIn;
        if (params.eventType === 'Payout.Released') return cats.orders.payoutReleased;
        return true;
      }
      case 'onboarding': {
        if (params.eventType === 'User.Welcome') return cats.onboarding.welcome;
        if (params.eventType === 'User.ProfileIncompleteReminder') return cats.onboarding.profileIncomplete;
        return true;
      }
      case 'marketing': {
        if (params.eventType === 'Marketing.WeeklyDigest') return cats.marketing.weeklyDigest;
        if (params.eventType === 'Marketing.SavedSearchAlert') return cats.marketing.savedSearchAlerts;
        return false;
      }
      case 'messages': {
        return cats.messages.messageReceived;
      }
      case 'admin': {
        if (params.eventType === 'Admin.Listing.Submitted') return cats.admin.listingSubmitted;
        if (params.eventType === 'Admin.Listing.ComplianceReviewRequired') return cats.admin.complianceReview;
        if (params.eventType === 'Admin.Listing.AdminApprovalRequired') return cats.admin.adminApproval;
        if (
          params.eventType === 'Admin.Listing.Approved' ||
          params.eventType === 'Admin.Listing.Rejected' ||
          params.eventType === 'Listing.Approved' ||
          params.eventType === 'Listing.Rejected'
        )
          return cats.admin.listingApprovedRejected;
        if (params.eventType === 'Admin.Order.DisputeOpened') return cats.admin.disputes;
        return true;
      }
      default:
        return true;
    }
  })();

  if (!allowedByCategory) {
    return {
      allow: false,
      suppressedReason: 'User preferences disabled this category',
      category: rule.category,
      urgency: rule.urgency,
      channels: {
        inApp: { enabled: false, reason: 'disabled_by_prefs' },
        email: { enabled: false, reason: 'disabled_by_prefs' },
        push: { enabled: false, reason: 'disabled_by_prefs' },
        sms: { enabled: false, reason: 'disabled_by_prefs' },
      },
    };
  }

  const inRule = new Set(rule.channels);
  const quiet = isQuietHoursNow(now, p);
  const deliverAfterMs = quiet && !rule.allowDuringQuietHours ? msUntilQuietHoursEnd(now, p) : undefined;

  // Engagement-aware escalation: delay email for certain high-frequency auction events so push/in-app
  // gets the first shot (eBay-style). If user clicks/reads before the email fires, dispatch will skip it.
  const emailEscalationDelayMs = (() => {
    if (params.eventType === 'Auction.Outbid') return 5 * 60_000; // 5 min
    if (params.eventType === 'Auction.HighBidder') return 30 * 60_000; // 30 min
    return 0;
  })();

  const channels: RuleDecision['channels'] = {
    inApp: { enabled: inRule.has('inApp') },
    email: {
      enabled: inRule.has('email') && p.channels.email,
      ...((deliverAfterMs || emailEscalationDelayMs)
        ? { deliverAfterMs: Math.max(deliverAfterMs || 0, emailEscalationDelayMs || 0) }
        : {}),
      ...(p.channels.email ? {} : { reason: 'email_disabled' }),
    },
    push: {
      enabled: inRule.has('push') && p.channels.push,
      ...(deliverAfterMs ? { deliverAfterMs } : {}),
      ...(p.channels.push ? {} : { reason: 'push_disabled' }),
    },
    sms: {
      enabled: inRule.has('sms') && p.channels.sms,
      ...(deliverAfterMs ? { deliverAfterMs } : {}),
      ...(p.channels.sms ? {} : { reason: 'sms_disabled' }),
    },
  };

  // Per-event channel overrides (used for saved searches).
  const override = (params.payload as any)?.channels as
    | { inApp?: boolean; push?: boolean; email?: boolean; sms?: boolean }
    | undefined;
  if (override) {
    if (override.inApp === false) channels.inApp = { enabled: false, reason: 'event_channel_disabled' };
    if (override.push === false) channels.push = { ...channels.push, enabled: false, reason: 'event_channel_disabled' };
    if (override.email === false) channels.email = { ...channels.email, enabled: false, reason: 'event_channel_disabled' };
  }

  const any = Object.values(channels).some((c) => c.enabled);
  return { allow: any, category: rule.category, urgency: rule.urgency, channels };
}

