/**
 * Stripe Webhook Test Harness
 * 
 * Generates valid Stripe-signed webhook payloads for testing
 * without requiring Stripe CLI or real network calls
 */

import Stripe from 'stripe';
import { NextRequest } from 'next/server';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

/**
 * Build a Stripe webhook event payload
 */
export function buildStripeEvent(type: string, data: Record<string, any>, id?: string): Stripe.Event {
  const eventId = id || `evt_test_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  
  return {
    id: eventId,
    object: 'event',
    api_version: '2024-11-20.acacia',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: data,
      previous_attributes: null,
    },
    livemode: false,
    pending_webhooks: 0,
    request: {
      id: null,
      idempotency_key: null,
    },
    type: type as Stripe.Event.Type,
  };
}

/**
 * Build checkout.session.completed event payload
 */
export function buildCheckoutSessionCompletedEvent(params: {
  sessionId?: string;
  paymentIntentId?: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  sellerStripeAccountId: string;
  amount?: number;
  sellerAmount?: string;
  platformFee?: string;
  eventId?: string;
}): Stripe.Event {
  const sessionId = params.sessionId || `cs_test_${Date.now()}`;
  const paymentIntentId = params.paymentIntentId || `pi_test_${Date.now()}`;
  const amount = params.amount || 10000; // $100.00 in cents

  const session: Stripe.Checkout.Session = {
    id: sessionId,
    object: 'checkout.session',
    after_expiration: null,
    allow_promotion_codes: null,
    amount_subtotal: amount,
    amount_total: amount,
    automatic_tax: {
      enabled: false,
      status: null,
    },
    billing_address_collection: null,
    cancel_url: null,
    client_reference_id: null,
    client_secret: null,
    consent: null,
    consent_collection: null,
    currency: 'usd',
    currency_conversion: null,
    custom_fields: [],
    custom_text: {
      after_submit: null,
      shipping_address: null,
      submit: null,
      terms_of_service_acceptance: null,
    },
    customer: null,
    customer_creation: 'always',
    customer_details: null,
    customer_email: null,
    expires_at: null,
    invoice: null,
    invoice_creation: null,
    livemode: false,
    locale: null,
    metadata: {
      listingId: params.listingId,
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      sellerStripeAccountId: params.sellerStripeAccountId,
      ...(params.sellerAmount && { sellerAmount: params.sellerAmount }),
      ...(params.platformFee && { platformFee: params.platformFee }),
    },
    mode: 'payment',
    payment_intent: paymentIntentId,
    payment_link: null,
    payment_method_collection: 'always',
    payment_method_configuration_details: null,
    payment_method_options: null,
    payment_method_types: ['card'],
    payment_status: 'paid',
    phone_number_collection: {
      enabled: false,
    },
    recovered_from: null,
    setup_intent: null,
    shipping_address_collection: null,
    shipping_cost: null,
    shipping_details: null,
    shipping_options: [],
    status: 'complete',
    submit_type: null,
    subscription: null,
    success_url: null,
    total_details: {
      amount_discount: 0,
      amount_shipping: 0,
      amount_tax: 0,
    },
    ui_mode: 'hosted',
    url: null,
  };

  return buildStripeEvent('checkout.session.completed', session, params.eventId);
}

/**
 * Build charge.dispute.created event payload
 */
export function buildChargeDisputeCreatedEvent(params: {
  disputeId?: string;
  chargeId?: string;
  paymentIntentId: string;
  amount?: number;
  currency?: string;
  reason?: string;
  eventId?: string;
}): Stripe.Event {
  const disputeId = params.disputeId || `dp_test_${Date.now()}`;
  const chargeId = params.chargeId || `ch_test_${Date.now()}`;
  const amount = params.amount || 10000; // $100.00 in cents

  const dispute: Stripe.Dispute = {
    id: disputeId,
    object: 'dispute',
    amount: amount,
    charge: chargeId,
    created: Math.floor(Date.now() / 1000),
    currency: params.currency || 'usd',
    evidence: {
      access_activity_log: null,
      billing_address: null,
      cancellation_policy: null,
      cancellation_policy_disclosure: null,
      cancellation_rebuttal: null,
      customer_communication: null,
      customer_email_address: null,
      customer_name: null,
      customer_purchase_ip: null,
      customer_signature: null,
      duplicate_charge_documentation: null,
      duplicate_charge_explanation: null,
      duplicate_charge_id: null,
      product_description: null,
      receipt: null,
      refund_policy: null,
      refund_policy_disclosure: null,
      refund_refusal_explanation: null,
      service_date: null,
      service_documentation: null,
      shipping_address: null,
      shipping_carrier: null,
      shipping_date: null,
      shipping_documentation: null,
      shipping_tracking_number: null,
      uncategorized_file: null,
      uncategorized_text: null,
    },
    evidence_details: {
      due_by: null,
      has_evidence: false,
      past_due: false,
      submission_count: 0,
    },
    is_charge_refundable: false,
    livemode: false,
    metadata: {},
    payment_intent: params.paymentIntentId,
    reason: (params.reason as Stripe.Dispute.Reason) || 'fraudulent',
    status: 'warning_needs_response',
  };

  return buildStripeEvent('charge.dispute.created', dispute, params.eventId);
}

/**
 * Generate a Stripe webhook signature for a payload
 */
export function generateStripeSignature(payload: string | Buffer): string {
  const stripe = new Stripe('sk_test_dummy', { apiVersion: '2024-11-20.acacia' });
  const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Stripe uses HMAC-SHA256 to sign webhooks
  const signedPayload = `${timestamp}.${payloadString}`;
  const crypto = require('crypto');
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');
  
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Send a Stripe webhook event to the Next.js route handler
 * This calls the route handler directly without HTTP
 */
export async function sendStripeEventToHandler(
  event: Stripe.Event
): Promise<{ status: number; body: any }> {
  const { POST } = await import('@/app/api/stripe/webhook/route');
  
  const payload = JSON.stringify(event);
  const signature = generateStripeSignature(payload);
  
  // Create a NextRequest with the webhook payload
  const request = new NextRequest('http://localhost:3000/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    body: payload,
  });

  try {
    const response = await POST(request);
    const body = await response.json();
    return {
      status: response.status,
      body,
    };
  } catch (error) {
    return {
      status: 500,
      body: { error: String(error) },
    };
  }
}

/**
 * Alternative: Send webhook via HTTP to running server
 */
export async function sendStripeEventViaHTTP(
  event: Stripe.Event,
  baseURL: string = 'http://localhost:3000'
): Promise<{ status: number; body: any }> {
  const payload = JSON.stringify(event);
  const signature = generateStripeSignature(payload);
  
  const response = await fetch(`${baseURL}/api/stripe/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    body: payload,
  });

  const body = await response.json();
  return {
    status: response.status,
    body,
  };
}
