/**
 * Subscription Webhook Handlers
 * 
 * Handles Stripe subscription lifecycle events
 */

import { getFirestore, Timestamp, Firestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { createAuditLog } from '@/lib/audit/logger';
import { logInfo, logWarn, logError } from '@/lib/monitoring/logger';
import { PLAN_CONFIG } from '@/lib/pricing/plans';

/**
 * Handle customer.subscription.created event
 * Syncs subscription to Firestore user doc
 */
export async function handleSubscriptionCreated(
  db: Firestore,
  subscription: any,
  requestId?: string
) {
  try {
    const subscriptionId = subscription.id;
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const planId = subscription.metadata?.planId || 'free';
    const userId = subscription.metadata?.userId;

    logInfo('Processing subscription created', {
      requestId,
      route: '/api/stripe/webhook',
      subscriptionId,
      customerId,
      planId,
      userId,
    });

    if (!userId) {
      // Find user by Stripe customer ID
      const usersRef = db.collection('users');
      const snapshot = await usersRef.where('stripeCustomerId', '==', customerId).limit(1).get();
      
      if (snapshot.empty) {
        logWarn('No user found for subscription customer', {
          requestId,
          route: '/api/stripe/webhook',
          customerId,
          subscriptionId,
        });
        return;
      }

      const userDoc = snapshot.docs[0];
      const userRef = userDoc.ref;
      
      // Update user with subscription info
      await userRef.update({
        stripeSubscriptionId: subscriptionId,
        subscriptionPlan: planId,
        subscriptionStatus: subscription.status,
        subscriptionCurrentPeriodEnd: subscription.current_period_end
          ? Timestamp.fromMillis(subscription.current_period_end * 1000)
          : undefined,
        subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        updatedAt: Timestamp.now(),
      });

      // Create audit log
      await createAuditLog(db, {
        actorUid: 'webhook',
        actorRole: 'webhook',
        actionType: 'subscription_created',
        listingId: undefined,
        beforeState: {
          subscriptionPlan: userDoc.data()?.subscriptionPlan || 'free',
        },
        afterState: {
          subscriptionPlan: planId,
          subscriptionStatus: subscription.status,
        },
        metadata: {
          subscriptionId,
          customerId,
          planId,
        },
        source: 'webhook',
      });
    } else {
      // User ID is in metadata - update directly
      const userRef = db.collection('users').doc(userId);
      await userRef.update({
        stripeSubscriptionId: subscriptionId,
        subscriptionPlan: planId,
        subscriptionStatus: subscription.status,
        subscriptionCurrentPeriodEnd: subscription.current_period_end
          ? Timestamp.fromMillis(subscription.current_period_end * 1000)
          : undefined,
        subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        updatedAt: Timestamp.now(),
      });
    }
  } catch (error) {
    logError('Error handling subscription.created', error, {
      requestId,
      route: '/api/stripe/webhook',
    });
    throw error;
  }
}

/**
 * Handle customer.subscription.updated event
 * Syncs subscription status changes to Firestore
 */
export async function handleSubscriptionUpdated(
  db: Firestore,
  subscription: any,
  requestId?: string
) {
  try {
    const subscriptionId = subscription.id;
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const planId = subscription.metadata?.planId || 'free';
    const userId = subscription.metadata?.userId;

    logInfo('Processing subscription updated', {
      requestId,
      route: '/api/stripe/webhook',
      subscriptionId,
      status: subscription.status,
    });

    // Find user by subscription ID or customer ID
    let userRef;
    if (userId) {
      userRef = db.collection('users').doc(userId);
    } else {
      const usersRef = db.collection('users');
      const snapshot = await usersRef.where('stripeSubscriptionId', '==', subscriptionId).limit(1).get();
      
      if (snapshot.empty) {
        // Try by customer ID
        const customerSnapshot = await usersRef.where('stripeCustomerId', '==', customerId).limit(1).get();
        if (customerSnapshot.empty) {
          logWarn('No user found for subscription', {
            requestId,
            route: '/api/stripe/webhook',
            subscriptionId,
            customerId,
          });
          return;
        }
        userRef = customerSnapshot.docs[0].ref;
      } else {
        userRef = snapshot.docs[0].ref;
      }
    }

    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Determine effective plan based on subscription status
    let effectivePlan = planId;
    if (subscription.status === 'canceled' || subscription.status === 'unpaid' || subscription.status === 'past_due') {
      effectivePlan = 'free'; // Revert to free if subscription is not active
    }

    // Check for admin override
    const adminOverridePlan = userData?.adminPlanOverride;
    if (adminOverridePlan) {
      effectivePlan = adminOverridePlan; // Admin override takes precedence
    }

    // Update user doc
    await userRef.update({
      subscriptionPlan: effectivePlan,
      subscriptionStatus: subscription.status,
      subscriptionCurrentPeriodEnd: subscription.current_period_end
        ? Timestamp.fromMillis(subscription.current_period_end * 1000)
        : undefined,
      subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end || false,
      updatedAt: Timestamp.now(),
    });

    // Create audit log
    await createAuditLog(db, {
      actorUid: 'webhook',
      actorRole: 'webhook',
      actionType: 'subscription_updated',
      beforeState: {
        subscriptionPlan: userData?.subscriptionPlan || 'free',
        subscriptionStatus: userData?.subscriptionStatus,
      },
      afterState: {
        subscriptionPlan: effectivePlan,
        subscriptionStatus: subscription.status,
      },
      metadata: {
        subscriptionId,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      source: 'webhook',
    });
  } catch (error) {
    logError('Error handling subscription.updated', error, {
      requestId,
      route: '/api/stripe/webhook',
    });
    throw error;
  }
}

/**
 * Handle customer.subscription.deleted event
 * Reverts user to free plan
 */
export async function handleSubscriptionDeleted(
  db: Firestore,
  subscription: any,
  requestId?: string
) {
  try {
    const subscriptionId = subscription.id;
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const userId = subscription.metadata?.userId;

    logInfo('Processing subscription deleted', {
      requestId,
      route: '/api/stripe/webhook',
      subscriptionId,
    });

    // Find user by subscription ID or customer ID
    let userRef;
    if (userId) {
      userRef = db.collection('users').doc(userId);
    } else {
      const usersRef = db.collection('users');
      const snapshot = await usersRef.where('stripeSubscriptionId', '==', subscriptionId).limit(1).get();
      
      if (snapshot.empty) {
        const customerSnapshot = await usersRef.where('stripeCustomerId', '==', customerId).limit(1).get();
        if (customerSnapshot.empty) {
          logWarn('No user found for deleted subscription', {
            requestId,
            route: '/api/stripe/webhook',
            subscriptionId,
          });
          return;
        }
        userRef = customerSnapshot.docs[0].ref;
      } else {
        userRef = snapshot.docs[0].ref;
      }
    }

    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Check for admin override
    const adminOverridePlan = userData?.adminPlanOverride;
    const effectivePlan = adminOverridePlan || 'free'; // Revert to free unless admin override

    // Update user doc
    await userRef.update({
      subscriptionPlan: effectivePlan,
      subscriptionStatus: 'canceled',
      stripeSubscriptionId: null,
      subscriptionCurrentPeriodEnd: null,
      subscriptionCancelAtPeriodEnd: false,
      updatedAt: Timestamp.now(),
    });

    // Create audit log
    await createAuditLog(db, {
      actorUid: 'webhook',
      actorRole: 'webhook',
      actionType: 'subscription_canceled',
      beforeState: {
        subscriptionPlan: userData?.subscriptionPlan || 'free',
        subscriptionStatus: userData?.subscriptionStatus,
      },
      afterState: {
        subscriptionPlan: effectivePlan,
        subscriptionStatus: 'canceled',
      },
      metadata: {
        subscriptionId,
      },
      source: 'webhook',
    });
  } catch (error) {
    logError('Error handling subscription.deleted', error, {
      requestId,
      route: '/api/stripe/webhook',
    });
    throw error;
  }
}

/**
 * Handle invoice.payment_succeeded event
 * Confirms subscription is active and paid
 */
export async function handleInvoicePaymentSucceeded(
  db: Firestore,
  invoice: any,
  requestId?: string
) {
  try {
    const subscriptionId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

    if (!subscriptionId) {
      return; // Not a subscription invoice
    }

    logInfo('Processing invoice payment succeeded', {
      requestId,
      route: '/api/stripe/webhook',
      invoiceId: invoice.id,
      subscriptionId,
    });

    // Find user by subscription ID
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('stripeSubscriptionId', '==', subscriptionId).limit(1).get();

    if (snapshot.empty) {
      logWarn('No user found for subscription invoice', {
        requestId,
        route: '/api/stripe/webhook',
        subscriptionId,
      });
      return;
    }

    const userRef = snapshot.docs[0].ref;

    // Update subscription status to active (if it was past_due)
    await userRef.update({
      subscriptionStatus: 'active',
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    logError('Error handling invoice.payment_succeeded', error, {
      requestId,
      route: '/api/stripe/webhook',
    });
    throw error;
  }
}

/**
 * Handle invoice.payment_failed event
 * Marks subscription as past_due
 */
export async function handleInvoicePaymentFailed(
  db: Firestore,
  invoice: any,
  requestId?: string
) {
  try {
    const subscriptionId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

    if (!subscriptionId) {
      return; // Not a subscription invoice
    }

    logInfo('Processing invoice payment failed', {
      requestId,
      route: '/api/stripe/webhook',
      invoiceId: invoice.id,
      subscriptionId,
    });

    // Find user by subscription ID
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('stripeSubscriptionId', '==', subscriptionId).limit(1).get();

    if (snapshot.empty) {
      logWarn('No user found for subscription invoice', {
        requestId,
        route: '/api/stripe/webhook',
        subscriptionId,
      });
      return;
    }

    const userRef = snapshot.docs[0].ref;
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Mark subscription as past_due - this will cause new transactions to use higher fee
    // Check for admin override
    const adminOverridePlan = userData?.adminPlanOverride;
    const effectivePlan = adminOverridePlan || 'free'; // Revert to free if payment fails (unless admin override)

    await userRef.update({
      subscriptionStatus: 'past_due',
      subscriptionPlan: effectivePlan, // Revert to free plan fee
      updatedAt: Timestamp.now(),
    });

    // Create audit log
    await createAuditLog(db, {
      actorUid: 'webhook',
      actorRole: 'webhook',
      actionType: 'subscription_payment_failed',
      beforeState: {
        subscriptionPlan: userData?.subscriptionPlan || 'free',
        subscriptionStatus: userData?.subscriptionStatus,
      },
      afterState: {
        subscriptionPlan: effectivePlan,
        subscriptionStatus: 'past_due',
      },
      metadata: {
        subscriptionId,
        invoiceId: invoice.id,
      },
      source: 'webhook',
    });
  } catch (error) {
    logError('Error handling invoice.payment_failed', error, {
      requestId,
      route: '/api/stripe/webhook',
    });
    throw error;
  }
}
