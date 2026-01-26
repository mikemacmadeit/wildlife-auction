/**
 * POST /api/stripe/webhook
 * 
 * Handles Stripe webhook events
 * - account.updated: Updates user's Stripe Connect status
 * - checkout.session.completed: Creates order and marks listing as sold
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
// Ensure Sentry server config is loaded
import '../../../sentry.server.config';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { stripe, isStripeConfigured } from '@/lib/stripe/config';
import { logInfo, logWarn, logError, getRequestId } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  handleCheckoutSessionCompleted,
  handleCheckoutSessionAsyncPaymentSucceeded,
  handleCheckoutSessionAsyncPaymentFailed,
  handleCheckoutSessionExpired,
  handleWirePaymentIntentSucceeded,
  handleWirePaymentIntentCanceled,
  handleChargeDisputeCreated,
  handleChargeDisputeUpdated,
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

// IMPORTANT:
// Do NOT initialize Firebase Admin at module scope in Netlify/Next route handlers.
// Use the shared initializer (supports bundled service account file) inside the handler so we can return a 503 if misconfigured.

function json(body: any, init?: { status?: number; headers?: Headers | Record<string, string> }) {
  const headers =
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init?.headers as Record<string, string> | undefined);

  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(headers || {}),
    },
  });
}

// Small shim so we don't have to rewrite every `NextResponse.json(...)` call in this file.
const NextResponse = { json };

/**
 * Get raw body for webhook signature verification
 */
async function getRawBody(request: Request): Promise<Buffer> {
  const ab = await request.arrayBuffer();
  return Buffer.from(ab);
}

export async function POST(request: Request) {
  const requestId = getRequestId(request.headers);
  const responseHeaders = new Headers();
  responseHeaders.set('x-request-id', requestId);

  // Initialize Admin DB (Netlify-safe)
  let adminDb: ReturnType<typeof getFirestore>;
  try {
    adminDb = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
  } catch (e: any) {
    logError('Firebase Admin init failed for Stripe webhook', e, {
      requestId,
      route: '/api/stripe/webhook',
      code: e?.code,
      missing: e?.missing,
    });
    return NextResponse.json(
      {
        error: 'Server is not configured to process webhooks yet',
        code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
        message: e?.message || 'Failed to initialize Firebase Admin SDK',
        missing: e?.missing || undefined,
      },
      { status: 503, headers: responseHeaders }
    );
  }

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
    let event: Stripe.Event;
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
        } else if (event.type.startsWith('payment_intent.')) {
          const pi = event.data.object as Stripe.PaymentIntent;
          eventData.paymentIntentId = pi.id;
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
          await handleAccountUpdated(adminDb, account);
          break;
        }

        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutSessionCompleted(adminDb, session, requestId);
          break;
        }

        // Async payment methods (bank transfer rails) succeed/fail after the checkout session is "completed".
        // We use these events to transition orders from awaiting_* → paid_held and mark listing sold.
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutSessionAsyncPaymentSucceeded(adminDb, session, requestId);
          break;
        }

        case 'checkout.session.async_payment_failed': {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutSessionAsyncPaymentFailed(adminDb, session, requestId);
          break;
        }

        case 'checkout.session.expired': {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutSessionExpired(adminDb, session, requestId);
          break;
        }

        case 'payment_intent.succeeded': {
          const pi = event.data.object as Stripe.PaymentIntent;
          await handleWirePaymentIntentSucceeded(adminDb, pi, requestId);
          break;
        }

        case 'payment_intent.canceled': {
          const pi = event.data.object as Stripe.PaymentIntent;
          await handleWirePaymentIntentCanceled(adminDb, pi, requestId);
          break;
        }

        case 'charge.dispute.created': {
          const dispute = event.data.object as Stripe.Dispute;
          await handleChargeDisputeCreated(adminDb, dispute, requestId);
          break;
        }

        case 'charge.dispute.updated': {
          const dispute = event.data.object as Stripe.Dispute;
          await handleChargeDisputeUpdated(adminDb, dispute, requestId);
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
async function handleAccountUpdated(db: ReturnType<typeof getFirestore>, account: Stripe.Account) {
  let userId: string | undefined;
  try {
    // Find user by stripeAccountId
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('stripeAccountId', '==', account.id).get();

    if (snapshot.empty) {
      console.warn(`No user found with stripeAccountId: ${account.id}`);
      return;
    }

    const userDoc = snapshot.docs[0];
    userId = userDoc.id;
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
    console.log(`Updated Stripe account status for user: ${userId}`);
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      event: 'account.updated',
      userId: userId || 'unknown',
      stripeAccountId: account.id,
    });
    throw error;
  }
}

// Handlers extracted to handlers.ts for testability
