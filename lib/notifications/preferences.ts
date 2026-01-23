import { z } from 'zod';

export interface NotificationQuietHours {
  enabled: boolean;
  startHour: number; // 0-23
  endHour: number; // 0-23
}

export interface NotificationChannelPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
}

export interface NotificationCategoryPreferences {
  auctions: {
    watchStarted: boolean;
    highBidder: boolean;
    outbid: boolean;
    endingSoon: boolean;
    wonLost: boolean;
  };
  orders: {
    confirmed: boolean;
    deliveryConfirmed: boolean;
    deliveryCheckIn: boolean;
    payoutReleased: boolean;
  };
  onboarding: {
    welcome: boolean;
    profileIncomplete: boolean;
  };
  marketing: {
    weeklyDigest: boolean;
    savedSearchAlerts: boolean;
  };
  messages: {
    messageReceived: boolean;
  };
  admin: {
    listingSubmitted: boolean;
    complianceReview: boolean;
    adminApproval: boolean;
    listingApprovedRejected: boolean;
    disputes: boolean;
    breederPermitSubmitted: boolean;
  };
}

export interface NotificationPreferencesDoc {
  timezone: string;
  quietHours: NotificationQuietHours;
  channels: NotificationChannelPreferences;
  categories: NotificationCategoryPreferences;
  updatedAt?: any; // Timestamp
}

export const notificationPreferencesSchema = z.object({
  timezone: z.string().min(1).default('America/Chicago'),
  quietHours: z
    .object({
      enabled: z.boolean().default(true),
      startHour: z.number().int().min(0).max(23).default(21),
      endHour: z.number().int().min(0).max(23).default(8),
    })
    .default({ enabled: true, startHour: 21, endHour: 8 }),
  channels: z
    .object({
      email: z.boolean().default(true),
      push: z.boolean().default(false),
      sms: z.boolean().default(false),
    })
    .default({ email: true, push: false, sms: false }),
  categories: z
    .object({
      auctions: z
        .object({
          watchStarted: z.boolean().default(true),
          highBidder: z.boolean().default(true),
          outbid: z.boolean().default(true),
          endingSoon: z.boolean().default(true),
          wonLost: z.boolean().default(true),
        })
        .default({
          watchStarted: true,
          highBidder: true,
          outbid: true,
          endingSoon: true,
          wonLost: true,
        }),
      orders: z
        .object({
          confirmed: z.boolean().default(true),
          deliveryConfirmed: z.boolean().default(true),
          deliveryCheckIn: z.boolean().default(true),
          payoutReleased: z.boolean().default(true),
        })
        .default({
          confirmed: true,
          deliveryConfirmed: true,
          deliveryCheckIn: true,
          payoutReleased: true,
        }),
      onboarding: z
        .object({
          welcome: z.boolean().default(true),
          profileIncomplete: z.boolean().default(true),
        })
        .default({ welcome: true, profileIncomplete: true }),
      marketing: z
        .object({
          weeklyDigest: z.boolean().default(false),
          savedSearchAlerts: z.boolean().default(false),
        })
        .default({ weeklyDigest: false, savedSearchAlerts: false }),
      messages: z
        .object({
          messageReceived: z.boolean().default(true),
        })
        .default({ messageReceived: true }),
      admin: z
        .object({
          listingSubmitted: z.boolean().default(true),
          complianceReview: z.boolean().default(true),
          adminApproval: z.boolean().default(true),
          listingApprovedRejected: z.boolean().default(true),
          disputes: z.boolean().default(true),
          breederPermitSubmitted: z.boolean().default(true),
        })
        .default({
          listingSubmitted: true,
          complianceReview: true,
          adminApproval: true,
          listingApprovedRejected: true,
          disputes: true,
          breederPermitSubmitted: true,
        }),
    })
    .default({
      auctions: { watchStarted: true, highBidder: true, outbid: true, endingSoon: true, wonLost: true },
      orders: { confirmed: true, deliveryConfirmed: true, deliveryCheckIn: true, payoutReleased: true },
      onboarding: { welcome: true, profileIncomplete: true },
      marketing: { weeklyDigest: false, savedSearchAlerts: false },
      messages: { messageReceived: true },
      admin: {
        listingSubmitted: true,
        complianceReview: true,
        adminApproval: true,
        listingApprovedRejected: true,
        disputes: true,
        breederPermitSubmitted: true,
      },
    }),
});

export function getDefaultNotificationPreferences(): NotificationPreferencesDoc {
  return notificationPreferencesSchema.parse({});
}

