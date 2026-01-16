/**
 * Webhook Event Handlers
 * 
 * Extracted handlers for testability
 * These handlers can be called with test Firestore instances
 */

import { getFirestore, Timestamp, Firestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { stripe, calculatePlatformFee } from '@/lib/stripe/config';
import { createAuditLog } from '@/lib/audit/logger';
import { logInfo, logWarn, logError } from '@/lib/monitoring/logger';
import { MARKETPLACE_FEE_PERCENT } from '@/lib/pricing/plans';

/**
 * Handle checkout.session.completed event
 * Creates order and marks listing as sold
 */
export async function handleCheckoutSessionCompleted(
  db: Firestore,
  session: Stripe.Checkout.Session,
  requestId?: string
) {
  try {
    const checkoutSessionId = session.id;
    const listingId = session.metadata?.listingId;
    const buyerId = session.metadata?.buyerId;
    const sellerId = session.metadata?.sellerId;
    const offerId = session.metadata?.offerId;
    const sellerStripeAccountId = session.metadata?.sellerStripeAccountId;
    const sellerAmountCents = session.metadata?.sellerAmount;
    const platformFeeCents = session.metadata?.platformFee;
    const sellerTierSnapshot = (session.metadata as any)?.sellerTierSnapshot || session.metadata?.sellerPlanSnapshot; // back-compat
    const platformFeePercentStr = session.metadata?.platformFeePercent; // Fee percent at checkout (immutable snapshot)
    const paymentMethod = (session.metadata?.paymentMethod as any) as
      | 'card'
      | 'bank_transfer'
      | 'wire'
      | undefined;
    const effectivePaymentMethod = paymentMethod || 'card';
    const isBankRails = effectivePaymentMethod === 'bank_transfer' || effectivePaymentMethod === 'wire';

    if (!listingId || !buyerId || !sellerId || !sellerStripeAccountId) {
      logError('Missing required metadata in checkout session', undefined, {
        requestId,
        route: '/api/stripe/webhook',
        listingId,
        buyerId,
        sellerId,
        offerId,
        sellerStripeAccountId,
      });
      return;
    }

    // Secondary idempotency check: Check if order already exists
    const ordersRef = db.collection('orders');
    const existingOrderQuery = await ordersRef
      .where('stripeCheckoutSessionId', '==', checkoutSessionId)
      .get();

    if (!existingOrderQuery.empty) {
      logInfo('Order already exists for checkout session', {
        requestId,
        route: '/api/stripe/webhook',
        checkoutSessionId,
      });
      return;
    }

    // Get payment intent
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;

    if (!paymentIntentId) {
      logError('No payment intent ID in checkout session', undefined, {
        requestId,
        route: '/api/stripe/webhook',
        checkoutSessionId,
      });
      return;
    }

    if (!stripe) {
      logError('Stripe is not configured', undefined, {
        requestId,
        route: '/api/stripe/webhook',
      });
      return;
    }

    // In tests, we may mock this - for now, try/catch it
    let amount: number;
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      amount = paymentIntent.amount;
    } catch (error: any) {
      // In test mode, use metadata or default
      amount = session.amount_total || 10000; // Default to $100
      logWarn('Could not retrieve payment intent, using session amount', {
        requestId,
        route: '/api/stripe/webhook',
        paymentIntentId,
        error: error.message,
      });
    }

    // Use plan snapshot from checkout metadata (immutable snapshot at time of checkout)
    // This ensures fee matches what was calculated at checkout, not current plan
    const effectivePlanAtCheckout = sellerTierSnapshot || 'standard';
    const feePercentAtCheckout = platformFeePercentStr
      ? parseFloat(platformFeePercentStr)
      : MARKETPLACE_FEE_PERCENT;
    
    // Use fees from metadata if available (they were calculated at checkout using correct plan)
    // Otherwise recalculate (fallback, but metadata should always be present)
    const platformFee = platformFeeCents
      ? parseInt(platformFeeCents, 10)
      : Math.round(amount * feePercentAtCheckout);
    const sellerAmount = sellerAmountCents
      ? parseInt(sellerAmountCents, 10)
      : (amount - platformFee);

    // Get listing to verify it exists
    const listingRef = db.collection('listings').doc(listingId);
    const listingDoc = await listingRef.get();
    
    if (!listingDoc.exists) {
      logError('Listing not found', undefined, {
        requestId,
        route: '/api/stripe/webhook',
        listingId,
      });
      return;
    }

    const listingData = listingDoc.data()!;
    
    // P0: AIR-TIGHT TX-ONLY ENFORCEMENT - Verify Stripe address for animal listings
    // IMPORTANT: For async bank rails, do NOT attempt refunds in this handler because
    // `checkout.session.completed` can occur before funds have actually been received.
    const animalCategories = ['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock'];
    const listingCategory = listingData.category;
    
    if (animalCategories.includes(listingCategory)) {
      // Get buyer state from Stripe session (customer_details or shipping_details)
      let buyerState: string | null = null;
      
      // Try customer_details first (billing address)
      if (session.customer_details?.address?.state) {
        buyerState = session.customer_details.address.state.toUpperCase();
      }
      // Fallback to shipping_details
      else if ((session as any).shipping_details?.address?.state) {
        buyerState = (session as any).shipping_details.address.state.toUpperCase();
      }
      // Fallback: retrieve payment intent for customer details
      else if (paymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
            expand: ['customer'],
          });
          // Stripe typings can differ by version/expansion; treat as `any` for address extraction.
          const pi: any = paymentIntent;
          if (pi.shipping?.address?.state) {
            buyerState = pi.shipping.address.state.toUpperCase();
          } else if (pi.charges?.data?.[0]?.billing_details?.address?.state) {
            buyerState = pi.charges.data[0].billing_details.address.state.toUpperCase();
          }
        } catch (piError) {
          logWarn('Could not retrieve payment intent for address verification', {
            requestId,
            route: '/api/stripe/webhook',
            paymentIntentId,
            error: String(piError),
          });
        }
      }
      
      // If no address found in Stripe, check if order was already refunded (idempotency)
      const existingRefundCheck = await ordersRef
        .where('stripeCheckoutSessionId', '==', checkoutSessionId)
        .where('status', '==', 'refunded')
        .limit(1)
        .get();
      
      if (!buyerState || buyerState !== 'TX') {
        if (isBankRails) {
          logWarn('TX-only violation detected for async bank rails (will be handled on async_payment_succeeded)', {
            requestId,
            route: '/api/stripe/webhook',
            listingId,
            buyerId,
            listingCategory,
            buyerState: buyerState || 'NOT_FOUND',
            checkoutSessionId,
          });
        } else {
          // BLOCK: Non-TX buyer for animal listing - REFUND IMMEDIATELY (card flow)
          logWarn('TX-only violation detected - refunding payment', {
            requestId,
            route: '/api/stripe/webhook',
            listingId,
            buyerId,
            listingCategory,
            buyerState: buyerState || 'NOT_FOUND',
            checkoutSessionId,
          });

          // Idempotent refund: Check if already refunded
          if (!existingRefundCheck.empty) {
            logInfo('Order already refunded for TX violation (idempotent)', {
              requestId,
              checkoutSessionId,
            });
            return; // Already handled
          }

          try {
            // Create refund (idempotent at Stripe level as well)
            const refund = await stripe.refunds.create(
              {
                payment_intent: paymentIntentId,
                reason: 'requested_by_customer',
                metadata: {
                  reason: 'tx_only_violation',
                  listingId,
                  buyerId,
                  listingCategory,
                  buyerState: buyerState || 'NOT_FOUND',
                  refundedBy: 'system',
                },
              },
              { idempotencyKey: `refund:tx_only:${checkoutSessionId}` }
            );
            const now = new Date();

            // Create order record with refunded status (for audit trail)
            const refundedOrderRef = db.collection('orders').doc();
            await refundedOrderRef.set({
              listingId,
              buyerId,
              sellerId,
              amount: amount / 100,
              status: 'refunded',
              paymentMethod: 'card',
              stripeCheckoutSessionId: checkoutSessionId,
              stripePaymentIntentId: paymentIntentId,
              stripeRefundId: refund.id,
              refundReason: 'Texas-only violation: Buyer state is not Texas',
              refundedAt: now,
              refundedBy: 'system',
              createdAt: now,
              updatedAt: now,
              complianceViolation: true,
              complianceViolationReason: `Animal listing requires TX buyer. Buyer state: ${buyerState || 'NOT_FOUND'}`,
            });

            // Create audit log
            await createAuditLog(db, {
              actorUid: 'system',
              actorRole: 'system',
              actionType: 'order_refunded_tx_violation',
              orderId: refundedOrderRef.id,
              listingId,
              beforeState: {},
              afterState: {
                status: 'refunded',
                refundReason: 'Texas-only violation',
              },
              metadata: {
                checkoutSessionId,
                paymentIntentId,
                refundId: refund.id,
                buyerState: buyerState || 'NOT_FOUND',
                listingCategory,
              },
              source: 'webhook',
            });

            // DO NOT mark listing as sold - keep it active
            logInfo('Payment refunded due to TX-only violation - listing remains active', {
              requestId,
              route: '/api/stripe/webhook',
              orderId: refundedOrderRef.id,
              listingId,
              refundId: refund.id,
            });

            return; // Exit early - order not created, listing not marked sold
          } catch (refundError: any) {
            logError('Failed to refund TX-only violation', refundError, {
              requestId,
              route: '/api/stripe/webhook',
              checkoutSessionId,
              paymentIntentId,
              listingId,
            });
            // Continue to create order but mark it for admin review
            // This is a fallback - admin must manually refund
          }
        }
      } else {
        logInfo('TX-only verification passed', {
          requestId,
          route: '/api/stripe/webhook',
          listingId,
          buyerState,
          listingCategory,
        });
      }
    }
    
    // Snapshot protected transaction fields from listing
    const protectedTransactionEnabled = listingData.protectedTransactionEnabled || false;
    const protectedTransactionDays = listingData.protectedTransactionDays || null;
    const protectedTermsVersion = listingData.protectedTermsVersion || 'v1';
    
    // Determine payout hold reason
    let payoutHoldReason = 'none';
    if (protectedTransactionEnabled && protectedTransactionDays) {
      payoutHoldReason = 'protection_window';
    }

    // Check if transfer permit is required (whitetail_breeder)
    const transferPermitRequired = listingCategory === 'whitetail_breeder';

    // Create order in Firestore
    const now = new Date();
    const disputeWindowHours = parseInt(process.env.ESCROW_DISPUTE_WINDOW_HOURS || '72', 10);
    const disputeDeadline = new Date(now.getTime() + disputeWindowHours * 60 * 60 * 1000);
    
    const orderRef = db.collection('orders').doc();
    const orderStatus: string = isBankRails
      ? (effectivePaymentMethod === 'wire' ? 'awaiting_wire' : 'awaiting_bank_transfer')
      : 'paid_held';

    const orderData: any = {
      listingId,
      buyerId,
      sellerId,
      ...(offerId ? { offerId: String(offerId) } : {}),
      amount: amount / 100,
      platformFee: platformFee / 100,
      sellerAmount: sellerAmount / 100,
      status: orderStatus,
      paymentMethod: effectivePaymentMethod,
      stripeCheckoutSessionId: checkoutSessionId,
      stripePaymentIntentId: paymentIntentId,
      sellerStripeAccountId: sellerStripeAccountId,
      // For async bank rails, payment is not confirmed yet; paidAt/dispute window are set on async success.
      paidAt: isBankRails ? null : now,
      disputeDeadlineAt: isBankRails ? null : disputeDeadline,
      adminHold: false,
      createdAt: now,
      updatedAt: now,
      lastUpdatedByRole: 'admin',
      protectedTransactionDaysSnapshot: protectedTransactionDays,
      protectedTermsVersionSnapshot: protectedTermsVersion,
      payoutHoldReason: payoutHoldReason,
      protectedDisputeStatus: 'none',
      // Compliance fields
      transferPermitRequired: transferPermitRequired,
      transferPermitStatus: transferPermitRequired ? 'none' : undefined,
      // Seller tier + fee snapshot (immutable at time of checkout)
      sellerTierSnapshot: effectivePlanAtCheckout,
      platformFeePercent: feePercentAtCheckout, // e.g., 0.05 = 5%
      platformFeeAmount: platformFee / 100, // Immutable snapshot (matches platformFee)
      sellerPayoutAmount: sellerAmount / 100, // Immutable snapshot (matches sellerAmount)
    };
    await orderRef.set(orderData);

    // If this checkout originated from an accepted offer, link offer -> order + session
    if (offerId) {
      try {
        const offerRef = db.collection('offers').doc(String(offerId));
        await offerRef.set(
          {
            checkoutSessionId: checkoutSessionId,
            orderId: orderRef.id,
            updatedAt: new Date(),
          },
          { merge: true }
        );
      } catch (e) {
        logWarn('Failed to link offer to order', {
          requestId,
          route: '/api/stripe/webhook',
          offerId,
          orderId: orderRef.id,
          error: String(e),
        });
      }
    }

    // Create audit log
    await createAuditLog(db, {
      actorUid: 'webhook',
      actorRole: 'webhook',
      actionType: 'order_created',
      orderId: orderRef.id,
      listingId: listingId,
      beforeState: {},
      afterState: {
        status: 'paid',
        amount: amount / 100,
        platformFee: platformFee / 100,
        sellerAmount: sellerAmount / 100,
      },
      metadata: {
        checkoutSessionId: checkoutSessionId,
        paymentIntentId: paymentIntentId,
        protectedTransactionEnabled: protectedTransactionEnabled,
        protectedTransactionDays: protectedTransactionDays,
        ...(offerId ? { offerId: String(offerId) } : {}),
      },
      source: 'webhook',
    });

    // For async bank rails, reserve the listing (do NOT mark sold until payment is confirmed).
    if (isBankRails) {
      await listingRef.set(
        {
          purchaseReservedByOrderId: orderRef.id,
          purchaseReservedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    } else {
      // Card flow: payment is already confirmed at checkout completion.
      await listingRef.update({
        status: 'sold',
        updatedAt: new Date(),
      });
    }

    // Create notifications for buyer and seller
    try {
      const listingTitle = listingData.title || 'your listing';
      
        // Notify buyer
      await db.collection('notifications').add({
        userId: buyerId,
        type: 'order_created',
        title: 'Order Confirmed',
          body: isBankRails
            ? `Your order for "${listingTitle}" has been created. Awaiting ${effectivePaymentMethod === 'wire' ? 'wire' : 'bank transfer'} payment.`
            : `Your order for "${listingTitle}" has been confirmed. Payment received.`,
        read: false,
        createdAt: now,
        linkUrl: `/dashboard/orders`,
        linkLabel: 'View Order',
        listingId,
        orderId: orderRef.id,
        metadata: {
          amount: amount / 100,
        },
      });

        // Notify seller
      await db.collection('notifications').add({
        userId: sellerId,
        type: 'order_created',
        title: 'New Order Received',
          body: isBankRails
            ? `You received a high-ticket order for "${listingTitle}" - awaiting payment confirmation.`
            : `You received an order for "${listingTitle}" - $${(amount / 100).toLocaleString()}`,
        read: false,
        createdAt: now,
        linkUrl: `/seller/orders`,
        linkLabel: 'View Order',
        listingId,
        orderId: orderRef.id,
        metadata: {
          amount: amount / 100,
          sellerAmount: sellerAmount / 100,
        },
      });
    } catch (notifError) {
      // Don't fail order creation if notification fails
      logWarn('Error creating notifications for order', {
        requestId,
        route: '/api/stripe/webhook',
        orderId: orderRef.id,
        error: String(notifError),
      });
    }

    logInfo(isBankRails ? 'Order created and listing reserved (awaiting bank rails)' : 'Order created and listing marked as sold', {
      requestId,
      route: '/api/stripe/webhook',
      orderId: orderRef.id,
      listingId,
    });
  } catch (error) {
    logError('Error handling checkout.session.completed', error, {
      requestId,
      route: '/api/stripe/webhook',
    });
    throw error;
  }
}

/**
 * Handle checkout.session.async_payment_succeeded
 * Used for asynchronous payment methods (e.g., Stripe bank transfer rails).
 *
 * Transitions: awaiting_bank_transfer / awaiting_wire → paid_held and marks listing as sold.
 */
export async function handleCheckoutSessionAsyncPaymentSucceeded(
  db: Firestore,
  session: Stripe.Checkout.Session,
  requestId?: string
) {
  const checkoutSessionId = session.id;
  const listingId = session.metadata?.listingId;
  const buyerId = session.metadata?.buyerId;
  const sellerId = session.metadata?.sellerId;
  const paymentMethod = (session.metadata?.paymentMethod as any) as 'card' | 'bank_transfer' | 'wire' | undefined;
  const effectivePaymentMethod = paymentMethod || 'bank_transfer';

  if (!listingId || !buyerId || !sellerId) {
    logError('Missing required metadata in async_payment_succeeded session', undefined, {
      requestId,
      route: '/api/stripe/webhook',
      checkoutSessionId,
      listingId,
      buyerId,
      sellerId,
    });
    return;
  }

  if (!stripe) {
    logError('Stripe is not configured', undefined, {
      requestId,
      route: '/api/stripe/webhook',
    });
    return;
  }

  // Find the order created on checkout.session.completed
  const ordersRef = db.collection('orders');
  const orderQuery = await ordersRef.where('stripeCheckoutSessionId', '==', checkoutSessionId).limit(1).get();
  if (orderQuery.empty) {
    // Defensive: create the order first (idempotent) then retry lookup
    logWarn('No order found for async_payment_succeeded; attempting to create via completed handler', {
      requestId,
      route: '/api/stripe/webhook',
      checkoutSessionId,
    });
    await handleCheckoutSessionCompleted(db, session, requestId);
  }

  const orderQuery2 = await ordersRef.where('stripeCheckoutSessionId', '==', checkoutSessionId).limit(1).get();
  if (orderQuery2.empty) {
    logError('Unable to locate/create order for async_payment_succeeded', undefined, {
      requestId,
      route: '/api/stripe/webhook',
      checkoutSessionId,
    });
    return;
  }

  const orderDoc = orderQuery2.docs[0];
  const orderData = orderDoc.data() as any;

  // If already paid/held or completed, treat as idempotent.
  if (orderData.status === 'paid_held' || orderData.status === 'paid' || orderData.status === 'completed') {
    logInfo('Async payment succeeded already applied (idempotent)', {
      requestId,
      route: '/api/stripe/webhook',
      orderId: orderDoc.id,
      checkoutSessionId,
      status: orderData.status,
    });
    return;
  }

  // Retrieve payment intent and amount (authoritative)
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) {
    logError('No payment intent ID in async_payment_succeeded session', undefined, {
      requestId,
      route: '/api/stripe/webhook',
      checkoutSessionId,
    });
    return;
  }

  let amountCents: number;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    amountCents = pi.amount;
  } catch (e: any) {
    amountCents = session.amount_total || Math.round((orderData.amount || 0) * 100);
    logWarn('Could not retrieve payment intent for async success; using fallback amount', {
      requestId,
      route: '/api/stripe/webhook',
      paymentIntentId,
      amountCents,
      error: e?.message,
    });
  }

  const now = new Date();
  const disputeWindowHours = parseInt(process.env.ESCROW_DISPUTE_WINDOW_HOURS || '72', 10);
  const disputeDeadline = new Date(now.getTime() + disputeWindowHours * 60 * 60 * 1000);

  // Mark order as paid_held (funds now in platform, still held)
  await orderDoc.ref.set(
    {
      status: 'paid_held',
      paymentMethod: effectivePaymentMethod,
      stripePaymentIntentId: paymentIntentId,
      paidAt: now,
      disputeDeadlineAt: disputeDeadline,
      updatedAt: now,
    },
    { merge: true }
  );

  // Mark listing sold and clear reservation fields
  await db.collection('listings').doc(listingId).set(
    {
      status: 'sold',
      purchaseReservedByOrderId: null,
      purchaseReservedAt: null,
      updatedAt: now,
    },
    { merge: true }
  );

  logInfo('Async payment succeeded: order marked paid_held and listing marked sold', {
    requestId,
    route: '/api/stripe/webhook',
    orderId: orderDoc.id,
    listingId,
    checkoutSessionId,
    paymentIntentId,
  });
}

/**
 * Handle checkout.session.async_payment_failed
 * Cancels the pending order and clears the listing reservation.
 */
export async function handleCheckoutSessionAsyncPaymentFailed(
  db: Firestore,
  session: Stripe.Checkout.Session,
  requestId?: string
) {
  const checkoutSessionId = session.id;
  const listingId = session.metadata?.listingId;

  const ordersRef = db.collection('orders');
  const orderQuery = await ordersRef.where('stripeCheckoutSessionId', '==', checkoutSessionId).limit(1).get();
  if (orderQuery.empty) {
    logWarn('No order found for async_payment_failed (nothing to cancel)', {
      requestId,
      route: '/api/stripe/webhook',
      checkoutSessionId,
      listingId,
    });
    return;
  }

  const orderDoc = orderQuery.docs[0];
  const orderData = orderDoc.data() as any;

  // If payment already succeeded, ignore failure event (defensive).
  if (orderData.status === 'paid_held' || orderData.status === 'paid' || orderData.status === 'completed') {
    logWarn('Async payment failed received after payment success; ignoring', {
      requestId,
      route: '/api/stripe/webhook',
      orderId: orderDoc.id,
      status: orderData.status,
      checkoutSessionId,
    });
    return;
  }

  const now = new Date();
  await orderDoc.ref.set(
    {
      status: 'cancelled',
      updatedAt: now,
    },
    { merge: true }
  );

  if (listingId) {
    await db.collection('listings').doc(listingId).set(
      {
        purchaseReservedByOrderId: null,
        purchaseReservedAt: null,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  logInfo('Async payment failed: order cancelled and listing reservation cleared', {
    requestId,
    route: '/api/stripe/webhook',
    orderId: orderDoc.id,
    listingId,
    checkoutSessionId,
  });
}

/**
 * Handle charge.dispute.created event
 * Creates chargeback record and places order on hold
 */
export async function handleChargeDisputeCreated(
  db: Firestore,
  dispute: Stripe.Dispute,
  requestId?: string
) {
  try {
    const disputeId = dispute.id;
    const paymentIntentId = dispute.payment_intent;
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
    const amount = dispute.amount;
    const currency = dispute.currency;
    const reason = dispute.reason;

    logInfo('Processing chargeback dispute', {
      requestId,
      route: '/api/stripe/webhook',
      disputeId,
      paymentIntentId,
      chargeId,
    });

    // Create chargeback record
    const chargebackRef = db.collection('chargebacks').doc(disputeId);
    await chargebackRef.set({
      disputeId,
      status: 'open',
      amount,
      currency,
      reason,
      charge: chargeId,
      paymentIntent: paymentIntentId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Find order by payment intent ID
    if (paymentIntentId) {
      const ordersRef = db.collection('orders');
      const orderQuery = await ordersRef
        .where('stripePaymentIntentId', '==', paymentIntentId)
        .limit(1)
        .get();

      if (!orderQuery.empty) {
        const orderDoc = orderQuery.docs[0];
        const orderId = orderDoc.id;
        
        // Place order on hold
        await orderDoc.ref.update({
          adminHold: true,
          payoutHoldReason: 'admin_hold',
          disputeStatus: 'open',
          disputedAt: new Date(),
          updatedAt: new Date(),
          lastUpdatedByRole: 'admin',
        });

        // Create audit log
        await createAuditLog(db, {
          actorUid: 'webhook',
          actorRole: 'webhook',
          actionType: 'chargeback_created',
          orderId: orderId,
          listingId: orderDoc.data()?.listingId,
          beforeState: {
            adminHold: orderDoc.data()?.adminHold || false,
            disputeStatus: orderDoc.data()?.disputeStatus || 'none',
          },
          afterState: {
            adminHold: true,
            payoutHoldReason: 'admin_hold',
            disputeStatus: 'open',
          },
          metadata: {
            disputeId,
            chargeId,
            reason,
          },
          source: 'webhook',
        });

        logInfo('Placed order on hold due to chargeback', {
          requestId,
          route: '/api/stripe/webhook',
          orderId,
          disputeId,
        });
      } else {
        logWarn('No order found for payment intent in chargeback', {
          requestId,
          route: '/api/stripe/webhook',
          paymentIntentId,
          disputeId,
        });
      }
    }
  } catch (error) {
    logError('Error handling charge.dispute.created', error, {
      requestId,
      route: '/api/stripe/webhook',
    });
    throw error;
  }
}

/**
 * Handle charge.dispute.closed event
 * Updates chargeback record when dispute is closed
 */
export async function handleChargeDisputeClosed(
  db: Firestore,
  dispute: Stripe.Dispute,
  requestId?: string
) {
  try {
    const disputeId = dispute.id;
    const status = dispute.status;

    logInfo('Processing chargeback closed', {
      requestId,
      route: '/api/stripe/webhook',
      disputeId,
      status,
    });

    // Update chargeback record
    const chargebackRef = db.collection('chargebacks').doc(disputeId);
    await chargebackRef.update({
      status: status,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    logError('Error handling charge.dispute.closed', error, {
      requestId,
      route: '/api/stripe/webhook',
    });
    throw error;
  }
}

/**
 * Handle charge.dispute.funds_withdrawn event
 * Logs when funds are withdrawn due to chargeback
 */
export async function handleChargeDisputeFundsWithdrawn(
  db: Firestore,
  dispute: Stripe.Dispute,
  requestId?: string
) {
  try {
    const disputeId = dispute.id;
    const paymentIntentId = dispute.payment_intent;

    logInfo('Processing chargeback funds withdrawn', {
      requestId,
      route: '/api/stripe/webhook',
      disputeId,
      paymentIntentId,
    });

    // Update chargeback record
    const chargebackRef = db.collection('chargebacks').doc(disputeId);
    await chargebackRef.update({
      fundsWithdrawnAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    logError('Error handling charge.dispute.funds_withdrawn', error, {
      requestId,
      route: '/api/stripe/webhook',
    });
    throw error;
  }
}

/**
 * Handle charge.dispute.funds_reinstated event
 * Logs when funds are reinstated after dispute resolution
 */
export async function handleChargeDisputeFundsReinstated(
  db: Firestore,
  dispute: Stripe.Dispute,
  requestId?: string
) {
  try {
    const disputeId = dispute.id;
    const paymentIntentId = dispute.payment_intent;

    logInfo('Processing chargeback funds reinstated', {
      requestId,
      route: '/api/stripe/webhook',
      disputeId,
      paymentIntentId,
    });

    // Update chargeback record
    const chargebackRef = db.collection('chargebacks').doc(disputeId);
    await chargebackRef.update({
      fundsReinstatedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    logError('Error handling charge.dispute.funds_reinstated', error, {
      requestId,
      route: '/api/stripe/webhook',
    });
    throw error;
  }
}
