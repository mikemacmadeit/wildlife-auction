/**
 * POST /api/stripe/webhook
 * 
 * Handles Stripe webhook events
 * - account.updated: Updates user's Stripe Connect status
 * - checkout.session.completed: Creates order and marks listing as sold
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import Stripe from 'stripe';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { logInfo, logWarn, logError, getRequestId } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';
import {
  handleCheckoutSessionCompleted,
  handleChargeDisputeCreated,
  handleChargeDisputeClosed,
  handleChargeDisputeFundsWithdrawn,
  handleChargeDisputeFundsReinstated,
} from './handlers';
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
} from './subscription-handlers';

// Initialize Firebase Admin (if not already initialized)
let adminApp: App;
if (!getApps().length) {
  try {
    const serviceAccount = process.env.FIREBASE_PRIVATE_KEY
      ? {
          projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }
      : undefined;

    if (serviceAccount?.projectId && serviceAccount?.clientEmail && serviceAccount?.privateKey) {
      adminApp = initializeApp({
        credential: cert(serviceAccount as any),
      });
    } else {
      try {
        // Try Application Default Credentials (for production)
        adminApp = initializeApp();
      } catch {
        throw new Error('Failed to initialize Firebase Admin SDK');
      }
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    throw error;
  }
} else {
  adminApp = getApps()[0];
}

const adminDb = getFirestore(adminApp);

/**
 * Get raw body for webhook signature verification
 */
async function getRawBody(request: NextRequest): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  if (!reader) {
    throw new Error('No request body');
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  const responseHeaders = new Headers();
  responseHeaders.set('x-request-id', requestId);

  // Check if Stripe is configured
  if (!isStripeConfigured() || !stripe) {
    logError('Stripe not configured for webhook', undefined, { requestId, route: '/api/stripe/webhook' });
    return NextResponse.json(
      { error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.' },
      { status: 503, headers: responseHeaders }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logError('STRIPE_WEBHOOK_SECRET not set', undefined, { requestId, route: '/api/stripe/webhook' });
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500, headers: responseHeaders }
    );
  }

  try {
    // Get raw body for signature verification
    const rawBody = await getRawBody(request);
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      logWarn('Missing stripe-signature header', { requestId, route: '/api/stripe/webhook' });
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400, headers: responseHeaders }
      );
    }

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      logInfo('Webhook event received', {
        requestId,
        route: '/api/stripe/webhook',
        eventType: event.type,
        eventId: event.id,
      });
    } catch (error: any) {
      logError('Webhook signature verification failed', error, {
        requestId,
        route: '/api/stripe/webhook',
      });
      captureException(error instanceof Error ? error : new Error(String(error)), {
        requestId,
        route: '/api/stripe/webhook',
      });
      return NextResponse.json(
        { error: `Webhook signature verification failed: ${error.message}` },
        { status: 400, headers: responseHeaders }
      );
    }

    // IDEMPOTENCY: Check if event was already processed using Firestore transaction
    const eventId = event.id;
    const eventRef = adminDb.collection('stripeEvents').doc(eventId);
    
    // Use transaction to atomically check and set (prevents race conditions)
    let eventWasAlreadyProcessed = false;
    try {
      await adminDb.runTransaction(async (transaction) => {
        const eventDoc = await transaction.get(eventRef);
        
        if (eventDoc.exists) {
          // Event already processed
          const existingEvent = eventDoc.data()!;
          logInfo('Webhook event already processed (idempotent)', {
            requestId,
            route: '/api/stripe/webhook',
            eventId,
            eventType: event.type,
            processedAt: existingEvent.createdAt?.toDate()?.toISOString(),
          });
          eventWasAlreadyProcessed = true;
          return; // Exit transaction early
        }
        
        // Record event in Firestore
        const eventData: any = {
          type: event.type,
          createdAt: Timestamp.now(),
        };
        
        // Store relevant IDs based on event type
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object as Stripe.Checkout.Session;
          eventData.checkoutSessionId = session.id;
          eventData.paymentIntentId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;
        } else if (event.type.startsWith('charge.dispute')) {
          const dispute = event.data.object as Stripe.Dispute;
          eventData.disputeId = dispute.id;
          eventData.chargeId = dispute.charge;
          eventData.paymentIntentId = dispute.payment_intent;
        }
        
        transaction.set(eventRef, eventData);
        logInfo('Webhook event recorded for idempotency', {
          requestId,
          route: '/api/stripe/webhook',
          eventId,
          eventType: event.type,
        });
      });
    } catch (transactionError: any) {
      // If transaction fails, check if event was already processed
      const eventDoc = await eventRef.get();
      if (eventDoc.exists) {
        logInfo('Webhook event already processed (transaction failed but event exists)', {
          requestId,
          route: '/api/stripe/webhook',
          eventId,
          eventType: event.type,
        });
        return NextResponse.json({ received: true, idempotent: true }, { headers: responseHeaders });
      }
      // If transaction failed for other reasons, log and continue (but this is risky)
      logError('Webhook transaction error', transactionError, {
        requestId,
        route: '/api/stripe/webhook',
        eventId,
        eventType: event.type,
      });
      // Continue processing - transaction failure shouldn't block webhook
    }

    // If event was already processed, return early
    if (eventWasAlreadyProcessed) {
      return NextResponse.json({ received: true, idempotent: true }, { headers: responseHeaders });
    }

    // Handle different event types
    try {
      switch (event.type) {
        case 'account.updated': {
          const account = event.data.object as Stripe.Account;
          await handleAccountUpdated(account);
          break;
        }

        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutSessionCompleted(adminDb, session, requestId);
          break;
        }

        case 'charge.dispute.created': {
          const dispute = event.data.object as Stripe.Dispute;
          await handleChargeDisputeCreated(adminDb, dispute, requestId);
          break;
        }

        case 'charge.dispute.closed': {
          const dispute = event.data.object as Stripe.Dispute;
          await handleChargeDisputeClosed(adminDb, dispute, requestId);
          break;
        }

        case 'charge.dispute.funds_withdrawn': {
          const dispute = event.data.object as Stripe.Dispute;
          await handleChargeDisputeFundsWithdrawn(adminDb, dispute, requestId);
          break;
        }

        case 'charge.dispute.funds_reinstated': {
          const dispute = event.data.object as Stripe.Dispute;
          await handleChargeDisputeFundsReinstated(adminDb, dispute, requestId);
          break;
        }

        case 'customer.subscription.created': {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionCreated(adminDb, subscription, requestId);
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionUpdated(adminDb, subscription, requestId);
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(adminDb, subscription, requestId);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoicePaymentSucceeded(adminDb, invoice, requestId);
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoicePaymentFailed(adminDb, invoice, requestId);
          break;
        }

        default:
          logWarn('Unhandled webhook event type', {
            requestId,
            route: '/api/stripe/webhook',
            eventId,
            eventType: event.type,
          });
      }

      // Update webhook health doc (non-blocking)
      try {
        await adminDb.collection('opsHealth').doc('stripeWebhook').set({
          lastWebhookAt: Timestamp.now(),
          lastEventType: event.type,
          lastEventId: event.id,
          updatedAt: Timestamp.now(),
        }, { merge: true });
      } catch (healthError) {
        // Non-blocking, just log
        logWarn('Failed to update webhook health', {
          requestId,
          route: '/api/stripe/webhook',
          error: String(healthError),
        });
      }

      logInfo('Webhook event processed successfully', {
        requestId,
        route: '/api/stripe/webhook',
        eventId,
        eventType: event.type,
      });

      return NextResponse.json({ received: true }, { headers: responseHeaders });
    } catch (handlerError: any) {
      logError('Webhook handler error', handlerError, {
        requestId,
        route: '/api/stripe/webhook',
        eventId,
        eventType: event.type,
      });
      captureException(handlerError instanceof Error ? handlerError : new Error(String(handlerError)), {
        requestId,
        route: '/api/stripe/webhook',
        eventId,
        eventType: event.type,
      });
      throw handlerError; // Re-throw to be caught by outer catch
    }
  } catch (error: any) {
    logError('Webhook error', error, {
      requestId,
      route: '/api/stripe/webhook',
    });
    captureException(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      route: '/api/stripe/webhook',
    });
    return NextResponse.json(
      { error: 'Webhook handler failed', message: error.message },
      { status: 500, headers: responseHeaders }
    );
  }
}

/**
 * Handle account.updated event (not extracted for testing yet)
 * Updates user's Stripe Connect status based on account capabilities
 */
async function handleAccountUpdated(account: Stripe.Account) {
  try {
    // Find user by stripeAccountId
    const usersRef = adminDb.collection('users');
    const snapshot = await usersRef.where('stripeAccountId', '==', account.id).get();

    if (snapshot.empty) {
      console.warn(`No user found with stripeAccountId: ${account.id}`);
      return;
    }

    const userDoc = snapshot.docs[0];
    const updateData: any = {
      chargesEnabled: account.capabilities?.card_payments === 'active',
      payoutsEnabled: account.capabilities?.transfers === 'active',
      stripeDetailsSubmitted: account.details_submitted || false,
      updatedAt: new Date(),
    };

    // Determine onboarding status
    if (account.details_submitted && account.capabilities?.transfers === 'active') {
      updateData.stripeOnboardingStatus = 'complete';
    } else if (account.details_submitted) {
      updateData.stripeOnboardingStatus = 'pending';
    } else {
      updateData.stripeOnboardingStatus = 'pending';
    }

    await userDoc.ref.update(updateData);
    console.log(`Updated Stripe account status for user: ${userDoc.id}`);
  } catch (error) {
    console.error('Error handling account.updated:', error);
    throw error;
  }
}

// Handlers extracted to handlers.ts for testability
