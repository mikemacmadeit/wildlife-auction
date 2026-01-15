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
  getPayoutNotificationEmail,
  getAuctionWinnerEmail,
  type OrderConfirmationEmailData,
  type DeliveryConfirmationEmailData,
  type PayoutNotificationEmailData,
  type AuctionWinnerEmailData,
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

