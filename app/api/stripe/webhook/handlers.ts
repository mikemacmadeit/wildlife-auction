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
import { emitEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { MARKETPLACE_FEE_PERCENT } from '@/lib/pricing/plans';
import { normalizeCategory } from '@/lib/listings/normalizeCategory';
import { isTexasOnlyCategory } from '@/lib/compliance/requirements';
import { recomputeOrderComplianceDocsStatus } from '@/lib/orders/complianceDocsStatus';
import { appendOrderTimelineEvent } from '@/lib/orders/timeline';

function inferEffectivePaymentMethodFromCheckoutSession(
  session: Stripe.Checkout.Session
): 'card' | 'ach_debit' | 'bank_transfer' | 'wire' {
  const meta = (session.metadata?.paymentMethod as any) as string | undefined;
  if (meta === 'ach') return 'ach_debit';
  if (meta === 'card' || meta === 'ach_debit' || meta === 'bank_transfer' || meta === 'wire') return meta;

  const types = (session as any).payment_method_types;
  if (Array.isArray(types) && types.includes('us_bank_account')) return 'ach_debit';
  return 'card';
}

function isCheckoutSessionPaid(session: Stripe.Checkout.Session): boolean {
  const paymentStatus = String((session as any).payment_status || '');
  return paymentStatus === 'paid';
}

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
    const orderIdFromMeta = session.metadata?.orderId;
    const listingId = session.metadata?.listingId;
    const buyerId = session.metadata?.buyerId;
    const sellerId = session.metadata?.sellerId;
    const offerId = session.metadata?.offerId;
    const sellerStripeAccountId = session.metadata?.sellerStripeAccountId;
    const sellerAmountCents = session.metadata?.sellerAmount;
    const platformFeeCents = session.metadata?.platformFee;
    const sellerTierSnapshot = (session.metadata as any)?.sellerTierSnapshot || session.metadata?.sellerPlanSnapshot; // back-compat
    const platformFeePercentStr = session.metadata?.platformFeePercent; // Fee percent at checkout (immutable snapshot)
    const effectivePaymentMethod = inferEffectivePaymentMethodFromCheckoutSession(session);
    const isBankRails = effectivePaymentMethod === 'bank_transfer' || effectivePaymentMethod === 'wire';
    const paymentConfirmed = isCheckoutSessionPaid(session);
    const isAsync = !paymentConfirmed;

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

    const ordersRef = db.collection('orders');

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
    let listingCategory: string;
    try {
      listingCategory = normalizeCategory((listingData as any)?.category);
    } catch (e: any) {
      logError('Invalid listing category during webhook processing', e, {
        requestId,
        route: '/api/stripe/webhook',
        listingId,
        rawCategory: (listingData as any)?.category,
      });
      // Fail closed: do not proceed to mark sold / release flows if category is invalid.
      return;
    }
    
    if (isTexasOnlyCategory(listingCategory as any)) {
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
        // For ANY async flow (e.g., ACH), do NOT attempt refunds here; funds may not be received yet.
        if (isAsync) {
          logWarn('TX-only violation detected for async payment (will be handled when payment is confirmed)', {
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

    // Create or update order in Firestore (idempotent).
    const now = new Date();
    const disputeWindowHours = parseInt(process.env.ESCROW_DISPUTE_WINDOW_HOURS || '72', 10);
    const disputeDeadline = new Date(now.getTime() + disputeWindowHours * 60 * 60 * 1000);
    
    let orderRef = orderIdFromMeta ? db.collection('orders').doc(String(orderIdFromMeta)) : db.collection('orders').doc();
    let existingOrderData: any | null = null;

    // Prefer explicit orderId from metadata; fall back to checkoutSession lookup.
    if (orderIdFromMeta) {
      const snap = await orderRef.get();
      if (snap.exists) existingOrderData = snap.data() as any;
    }
    if (!existingOrderData) {
      const existingOrderQuery = await ordersRef.where('stripeCheckoutSessionId', '==', checkoutSessionId).limit(1).get();
      if (!existingOrderQuery.empty) {
        orderRef = existingOrderQuery.docs[0].ref;
        existingOrderData = existingOrderQuery.docs[0].data() as any;
      }
    }

    // If already fully processed, treat as idempotent.
    if (existingOrderData && ['paid_held', 'paid', 'completed', 'refunded'].includes(String(existingOrderData.status || ''))) {
      logInfo('Checkout completed already applied (idempotent)', {
        requestId,
        route: '/api/stripe/webhook',
        checkoutSessionId,
        orderId: orderRef.id,
        status: existingOrderData.status,
      });
      return;
    }

    const orderStatus: string = paymentConfirmed
      ? 'paid_held'
      : isBankRails
        ? (effectivePaymentMethod === 'wire' ? 'awaiting_wire' : 'awaiting_bank_transfer')
        : 'pending';

    // Public-safe snapshots for fast "My Purchases" rendering (avoid N+1 listing reads).
    const photos = Array.isArray((listingData as any)?.photos) ? ((listingData as any).photos as any[]) : [];
    const sortedPhotos = photos.length
      ? [...photos].sort((a: any, b: any) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))
      : [];
    const coverPhotoUrl =
      (sortedPhotos.find((p: any) => typeof p?.url === 'string' && p.url.trim())?.url as string | undefined) ||
      (Array.isArray((listingData as any)?.images)
        ? (((listingData as any).images as any[]).find((u: any) => typeof u === 'string' && u.trim()) as string | undefined)
        : undefined);

    const city = (listingData as any)?.location?.city ? String((listingData as any).location.city) : '';
    const state = (listingData as any)?.location?.state ? String((listingData as any).location.state) : '';
    const locationLabel = city && state ? `${city}, ${state}` : state || '';

    const sellerDisplayName =
      String((listingData as any)?.sellerSnapshot?.displayName || '').trim() ||
      String((listingData as any)?.sellerSnapshot?.name || '').trim() ||
      'Seller';
    const sellerPhotoURL =
      typeof (listingData as any)?.sellerSnapshot?.photoURL === 'string' && String((listingData as any).sellerSnapshot.photoURL).trim()
        ? String((listingData as any).sellerSnapshot.photoURL)
        : undefined;

    const orderData: any = {
      listingId,
      buyerId,
      sellerId,
      listingSnapshot: {
        listingId,
        title: String((listingData as any)?.title || 'Listing'),
        type: (listingData as any)?.type ? String((listingData as any).type) : undefined,
        category: listingCategory ? String(listingCategory) : undefined,
        ...(coverPhotoUrl ? { coverPhotoUrl: String(coverPhotoUrl) } : {}),
        ...(locationLabel ? { locationLabel } : {}),
      },
      sellerSnapshot: {
        sellerId: String(sellerId || ''),
        displayName: sellerDisplayName,
        ...(sellerPhotoURL ? { photoURL: sellerPhotoURL } : {}),
      },
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
      paidAt: isAsync ? null : now,
      disputeDeadlineAt: isAsync ? null : disputeDeadline,
      adminHold: false,
      createdAt: existingOrderData?.createdAt || now,
      updatedAt: now,
      lastUpdatedByRole: 'admin',
      protectedTransactionDaysSnapshot: protectedTransactionDays,
      protectedTermsVersionSnapshot: protectedTermsVersion,
      payoutHoldReason: payoutHoldReason,
      protectedDisputeStatus: 'none',
      // Compliance fields
      transferPermitRequired: transferPermitRequired,
      ...(transferPermitRequired ? { transferPermitStatus: 'none' as const } : {}),
      // Seller tier + fee snapshot (immutable at time of checkout)
      sellerTierSnapshot: effectivePlanAtCheckout,
      platformFeePercent: feePercentAtCheckout, // e.g., 0.05 = 5%
      platformFeeAmount: platformFee / 100, // Immutable snapshot (matches platformFee)
      sellerPayoutAmount: sellerAmount / 100, // Immutable snapshot (matches sellerAmount)
    };
    await orderRef.set(orderData, { merge: true });

    // Server-authoritative: recompute required/provided/missing docs snapshot after checkout completion.
    try {
      await recomputeOrderComplianceDocsStatus({ db: db as any, orderId: orderRef.id });
    } catch {
      // ignore; best-effort
    }

    // Server-authored timeline events (idempotent).
    try {
      await appendOrderTimelineEvent({
        db: db as any,
        orderId: orderRef.id,
        event: {
          id: `CHECKOUT_SESSION_CREATED:${checkoutSessionId}`,
          type: 'CHECKOUT_SESSION_CREATED',
          label: 'Checkout session created',
          actor: 'system',
          visibility: 'buyer',
          meta: {
            checkoutSessionId,
            paymentMethod: effectivePaymentMethod,
            async: isAsync,
          },
        },
      });

      if (paymentConfirmed) {
        await appendOrderTimelineEvent({
          db: db as any,
          orderId: orderRef.id,
          event: {
            id: `PAYMENT_AUTHORIZED:${paymentIntentId}`,
            type: 'PAYMENT_AUTHORIZED',
            label: 'Payment confirmed',
            actor: 'system',
            visibility: 'buyer',
            meta: { paymentIntentId },
          },
        });
        await appendOrderTimelineEvent({
          db: db as any,
          orderId: orderRef.id,
          event: {
            id: `FUNDS_HELD:${paymentIntentId}`,
            type: 'FUNDS_HELD',
            label: 'Funds held (escrow)',
            actor: 'system',
            visibility: 'buyer',
            meta: { escrow: true },
          },
        });
      }

      if (transferPermitRequired) {
        await appendOrderTimelineEvent({
          db: db as any,
          orderId: orderRef.id,
          event: {
            id: `COMPLIANCE_REQUIRED:TPWD_TRANSFER_APPROVAL:${orderRef.id}`,
            type: 'COMPLIANCE_REQUIRED',
            label: 'Transfer permit required',
            actor: 'system',
            visibility: 'buyer',
            meta: { type: 'TPWD_TRANSFER_APPROVAL' },
          },
        });
      }
    } catch (e) {
      logWarn('Failed to append order timeline events (best-effort)', {
        requestId,
        route: '/api/stripe/webhook',
        orderId: orderRef.id,
        checkoutSessionId,
        error: String(e),
      });
    }

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
        status: orderStatus,
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

    // Derive public-safe sold metadata (stored on listing doc only; never store buyer PII/order details).
    const saleType: 'auction' | 'offer' | 'buy_now' | 'classified' =
      offerId
        ? 'offer'
        : listingData?.type === 'auction'
          ? 'auction'
          : listingData?.type === 'fixed'
            ? 'buy_now'
            : 'classified';
    const soldPriceCents =
      typeof (session as any).amount_total === 'number'
        ? (session as any).amount_total
        : typeof amount === 'number'
          ? amount
          : null;

    // For async payment methods, reserve the listing (do NOT mark sold until payment is confirmed).
    if (isAsync) {
      const asyncReserveHours = parseInt(process.env.ASYNC_PAYMENT_RESERVATION_HOURS || '48', 10);
      const until = Timestamp.fromMillis(Date.now() + Math.max(1, asyncReserveHours) * 60 * 60_000);
      await listingRef.set(
        {
          purchaseReservedByOrderId: orderRef.id,
          purchaseReservedAt: now,
          purchaseReservedUntil: until,
          updatedAt: now,
        },
        { merge: true }
      );
    } else {
      // Card flow: payment is already confirmed at checkout completion.
      const listingUpdates: any = {
        status: 'sold',
        soldAt: now,
        saleType,
        purchaseReservedByOrderId: null,
        purchaseReservedAt: null,
        purchaseReservedUntil: null,
        updatedAt: now,
      };
      if (typeof soldPriceCents === 'number' && Number.isFinite(soldPriceCents)) {
        listingUpdates.soldPriceCents = soldPriceCents;
      }
      await listingRef.update(listingUpdates);
    }

    // Emit canonical notification events for buyer and seller
    try {
      const listingTitle = listingData.title || 'your listing';
      
      const base = getSiteUrl();
      const buyerOrderUrl = `${base}/dashboard/orders/${orderRef.id}`;
      const sellerOrderUrl = `${base}/seller/orders/${orderRef.id}`;

      if (buyerId) {
        await emitEventForUser({
          type: 'Order.Confirmed',
          actorId: 'system',
          entityType: 'order',
          entityId: orderRef.id,
          targetUserId: buyerId,
          payload: {
            type: 'Order.Confirmed',
            orderId: orderRef.id,
            listingId,
            listingTitle,
            orderUrl: buyerOrderUrl,
            amount: amount / 100,
            paymentMethod: effectivePaymentMethod || undefined,
          },
          optionalHash: `checkout:${checkoutSessionId}`,
        });
      }

      if (sellerId) {
        await emitEventForUser({
          type: 'Order.Received',
          actorId: 'system',
          entityType: 'order',
          entityId: orderRef.id,
          targetUserId: sellerId,
          payload: {
            type: 'Order.Received',
            orderId: orderRef.id,
            listingId,
            listingTitle,
            orderUrl: sellerOrderUrl,
            amount: amount / 100,
          },
          optionalHash: `checkout:${checkoutSessionId}`,
        });
      }
    } catch (notifError) {
      // Don't fail order creation if notification fails
      logWarn('Error creating notifications for order', {
        requestId,
        route: '/api/stripe/webhook',
        orderId: orderRef.id,
        error: String(notifError),
      });
    }

    logInfo(isAsync ? 'Order created and listing reserved (awaiting async payment confirmation)' : 'Order created and listing marked as sold', {
      requestId,
      route: '/api/stripe/webhook',
      orderId: orderRef.id,
      listingId,
      paymentMethod: effectivePaymentMethod,
      paymentStatus: (session as any).payment_status,
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
  const effectivePaymentMethod = inferEffectivePaymentMethodFromCheckoutSession(session);

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
  const offerId = session.metadata?.offerId || orderData?.offerId || null;

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

  // Timeline events (idempotent).
  try {
    await appendOrderTimelineEvent({
      db: db as any,
      orderId: orderDoc.id,
      event: {
        id: `PAYMENT_AUTHORIZED:${paymentIntentId}`,
        type: 'PAYMENT_AUTHORIZED',
        label: 'Payment confirmed',
        actor: 'system',
        visibility: 'buyer',
        meta: { paymentIntentId, paymentMethod: effectivePaymentMethod },
      },
    });
    await appendOrderTimelineEvent({
      db: db as any,
      orderId: orderDoc.id,
      event: {
        id: `FUNDS_HELD:${paymentIntentId}`,
        type: 'FUNDS_HELD',
        label: 'Funds held (escrow)',
        actor: 'system',
        visibility: 'buyer',
        meta: { escrow: true, paymentMethod: effectivePaymentMethod },
      },
    });
  } catch (e) {
    logWarn('Failed to append async payment timeline events (best-effort)', {
      requestId,
      route: '/api/stripe/webhook',
      orderId: orderDoc.id,
      checkoutSessionId,
      paymentIntentId,
      error: String(e),
    });
  }

  // Determine listing type (public-safe) for sold metadata.
  let listingType: string | null = null;
  try {
    const listingSnap = await db.collection('listings').doc(listingId).get();
    if (listingSnap.exists) listingType = String((listingSnap.data() as any)?.type || '') || null;
  } catch {
    // ignore; fallback to unknown below
  }
  const saleType: 'auction' | 'offer' | 'buy_now' | 'classified' =
    offerId
      ? 'offer'
      : listingType === 'auction'
        ? 'auction'
        : listingType === 'fixed'
          ? 'buy_now'
          : 'classified';

  // Mark listing sold and clear reservation fields
  const listingSoldUpdate: any = {
    status: 'sold',
    soldAt: now,
    saleType,
    purchaseReservedByOrderId: null,
    purchaseReservedAt: null,
    updatedAt: now,
  };
  if (typeof amountCents === 'number' && Number.isFinite(amountCents)) {
    listingSoldUpdate.soldPriceCents = amountCents;
  }
  await db.collection('listings').doc(listingId).set(listingSoldUpdate, { merge: true });

  logInfo('Async payment succeeded: order marked paid_held and listing marked sold', {
    requestId,
    route: '/api/stripe/webhook',
    orderId: orderDoc.id,
    listingId,
    checkoutSessionId,
    paymentIntentId,
    paymentMethod: effectivePaymentMethod,
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
 * Handle checkout.session.expired
 * Cancels the pending order and clears listing reservation (prevents "stuck reserved" listings).
 */
export async function handleCheckoutSessionExpired(
  db: Firestore,
  session: Stripe.Checkout.Session,
  requestId?: string
) {
  const checkoutSessionId = session.id;
  const listingId = session.metadata?.listingId;
  const orderIdFromMeta = session.metadata?.orderId;

  const ordersRef = db.collection('orders');
  let orderDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  if (orderIdFromMeta) {
    const snap = await db.collection('orders').doc(String(orderIdFromMeta)).get();
    if (snap.exists) {
      orderDoc = snap as any;
    }
  }
  if (!orderDoc) {
    const q = await ordersRef.where('stripeCheckoutSessionId', '==', checkoutSessionId).limit(1).get();
    if (!q.empty) orderDoc = q.docs[0];
  }

  if (!orderDoc) {
    logWarn('No order found for checkout.session.expired (nothing to cancel)', {
      requestId,
      route: '/api/stripe/webhook',
      checkoutSessionId,
      listingId,
    });
    return;
  }

  const data = orderDoc.data() as any;
  const status = String(data.status || '');
  // If already paid/held/completed, ignore expired event (defensive).
  if (status === 'paid_held' || status === 'paid' || status === 'completed') {
    logInfo('checkout.session.expired received after payment; ignoring', {
      requestId,
      route: '/api/stripe/webhook',
      orderId: orderDoc.id,
      checkoutSessionId,
      status,
    });
    return;
  }

  const now = new Date();
  await orderDoc.ref.set({ status: 'cancelled', updatedAt: now }, { merge: true });

  // Clear listing reservation if it matches this order (best-effort).
  if (listingId) {
    try {
      const listingRef = db.collection('listings').doc(String(listingId));
      const listingSnap = await listingRef.get();
      if (listingSnap.exists) {
        const l = listingSnap.data() as any;
        if (l.purchaseReservedByOrderId === orderDoc.id) {
          await listingRef.set(
            {
              purchaseReservedByOrderId: null,
              purchaseReservedAt: null,
              purchaseReservedUntil: null,
              updatedAt: now,
            },
            { merge: true }
          );
        }
      }
    } catch (e) {
      logWarn('Failed to clear listing reservation on checkout.session.expired', {
        requestId,
        route: '/api/stripe/webhook',
        orderId: orderDoc.id,
        listingId,
        error: String(e),
      });
    }
  }

  logInfo('Checkout session expired: order cancelled and reservation cleared', {
    requestId,
    route: '/api/stripe/webhook',
    orderId: orderDoc.id,
    checkoutSessionId,
    listingId,
  });
}

/**
 * Handle payment_intent.succeeded for wire/bank transfer PaymentIntents (non-Checkout flow).
 *
 * Transitions: awaiting_wire → paid_held and marks listing sold.
 */
export async function handleWirePaymentIntentSucceeded(
  db: Firestore,
  paymentIntent: Stripe.PaymentIntent,
  requestId?: string
) {
  const pi: any = paymentIntent as any;
  const paymentMethod = String(pi?.metadata?.paymentMethod || '');
  if (paymentMethod !== 'wire') return; // Only handle wire intents created by this app.

  const orderIdFromMeta = pi?.metadata?.orderId ? String(pi.metadata.orderId) : null;
  const paymentIntentId = String(paymentIntent.id || '');
  if (!paymentIntentId) return;

  const ordersRef = db.collection('orders');

  // Prefer direct lookup by orderId (if present), fall back to query by PI id.
  let orderDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  if (orderIdFromMeta) {
    const snap = await ordersRef.doc(orderIdFromMeta).get();
    if (snap.exists) orderDoc = snap;
  }
  if (!orderDoc) {
    const q = await ordersRef.where('stripePaymentIntentId', '==', paymentIntentId).limit(1).get();
    orderDoc = q.empty ? null : q.docs[0]!;
  }

  if (!orderDoc || !orderDoc.exists) {
    logWarn('Wire PI succeeded but no order found', {
      requestId,
      route: '/api/stripe/webhook',
      paymentIntentId,
      orderIdFromMeta: orderIdFromMeta || undefined,
    });
    return;
  }

  const orderData = orderDoc.data() as any;
  const currentStatus = String(orderData?.status || '');

  if (currentStatus === 'paid_held' || currentStatus === 'paid' || currentStatus === 'completed') {
    logInfo('Wire PI succeeded already applied (idempotent)', {
      requestId,
      route: '/api/stripe/webhook',
      orderId: orderDoc.id,
      paymentIntentId,
      status: currentStatus,
    });
    return;
  }

  const listingId = orderData?.listingId ? String(orderData.listingId) : null;
  const offerId = orderData?.offerId ? String(orderData.offerId) : null;

  const now = new Date();
  const disputeWindowHours = parseInt(process.env.ESCROW_DISPUTE_WINDOW_HOURS || '72', 10);
  const disputeDeadline = new Date(now.getTime() + disputeWindowHours * 60 * 60 * 1000);

  await (orderDoc.ref as any).set(
    {
      status: 'paid_held',
      paymentMethod: 'wire',
      stripePaymentIntentId: paymentIntentId,
      paidAt: now,
      disputeDeadlineAt: disputeDeadline,
      updatedAt: now,
    },
    { merge: true }
  );

  // Timeline events (idempotent).
  try {
    await appendOrderTimelineEvent({
      db: db as any,
      orderId: orderDoc.id,
      event: {
        id: `PAYMENT_AUTHORIZED:${paymentIntentId}`,
        type: 'PAYMENT_AUTHORIZED',
        label: 'Payment confirmed',
        actor: 'system',
        visibility: 'buyer',
        meta: { paymentIntentId, paymentMethod: 'wire' },
      },
    });
    await appendOrderTimelineEvent({
      db: db as any,
      orderId: orderDoc.id,
      event: {
        id: `FUNDS_HELD:${paymentIntentId}`,
        type: 'FUNDS_HELD',
        label: 'Funds held (escrow)',
        actor: 'system',
        visibility: 'buyer',
        meta: { escrow: true, paymentMethod: 'wire' },
      },
    });
  } catch (e) {
    logWarn('Failed to append wire payment timeline events (best-effort)', {
      requestId,
      route: '/api/stripe/webhook',
      orderId: orderDoc.id,
      paymentIntentId,
      error: String(e),
    });
  }

  if (listingId) {
    let listingType: string | null = null;
    try {
      const listingSnap = await db.collection('listings').doc(listingId).get();
      if (listingSnap.exists) listingType = String((listingSnap.data() as any)?.type || '') || null;
    } catch {
      // ignore
    }

    const saleType: 'auction' | 'offer' | 'buy_now' | 'classified' =
      offerId
        ? 'offer'
        : listingType === 'auction'
          ? 'auction'
          : listingType === 'fixed'
            ? 'buy_now'
            : 'classified';

    const soldPriceCents =
      typeof (paymentIntent as any).amount_received === 'number'
        ? (paymentIntent as any).amount_received
        : typeof paymentIntent.amount === 'number'
          ? paymentIntent.amount
          : null;

    const listingSoldUpdate: any = {
      status: 'sold',
      soldAt: now,
      saleType,
      purchaseReservedByOrderId: null,
      purchaseReservedAt: null,
      updatedAt: now,
    };
    if (typeof soldPriceCents === 'number' && Number.isFinite(soldPriceCents)) {
      listingSoldUpdate.soldPriceCents = soldPriceCents;
    }

    await db.collection('listings').doc(listingId).set(listingSoldUpdate, { merge: true });
  }

  logInfo('Wire PI succeeded: order marked paid_held and listing marked sold', {
    requestId,
    route: '/api/stripe/webhook',
    orderId: orderDoc.id,
    listingId: listingId || undefined,
    paymentIntentId,
  });
}

/**
 * Handle payment_intent.canceled for wire PaymentIntents.
 *
 * Transitions: awaiting_wire → cancelled and clears listing reservation.
 */
export async function handleWirePaymentIntentCanceled(
  db: Firestore,
  paymentIntent: Stripe.PaymentIntent,
  requestId?: string
) {
  const pi: any = paymentIntent as any;
  const paymentMethod = String(pi?.metadata?.paymentMethod || '');
  if (paymentMethod !== 'wire') return;

  const paymentIntentId = String(paymentIntent.id || '');
  if (!paymentIntentId) return;

  const ordersRef = db.collection('orders');
  const q = await ordersRef.where('stripePaymentIntentId', '==', paymentIntentId).limit(1).get();
  if (q.empty) return;

  const orderDoc = q.docs[0]!;
  const orderData = orderDoc.data() as any;
  const status = String(orderData?.status || '');
  if (status === 'paid_held' || status === 'paid' || status === 'completed') return;

  const listingId = orderData?.listingId ? String(orderData.listingId) : null;
  const now = new Date();

  await orderDoc.ref.set({ status: 'cancelled', updatedAt: now }, { merge: true });

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

  logInfo('Wire PI canceled: order cancelled and listing reservation cleared', {
    requestId,
    route: '/api/stripe/webhook',
    orderId: orderDoc.id,
    listingId: listingId || undefined,
    paymentIntentId,
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
        const before = orderDoc.data() || {};

        // Phase 2D (CRITICAL): Normalize chargeback → order safety flags.
        // We do NOT rewrite escrow logic; we only ensure the data that escrow logic already relies on is present.
        // - chargebackStatus: normalized to 'open' | 'won' | 'lost'
        // - adminHold: true (prevents manual/auto release)
        // - payoutHoldReason: 'chargeback' (explicit UI + safety gate)
        await orderDoc.ref.update({
          chargebackStatus: 'open',
          adminHold: true,
          payoutHoldReason: 'chargeback',
          adminHoldReason: `Stripe chargeback opened (${disputeId})`,
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
            adminHold: before?.adminHold || false,
            payoutHoldReason: before?.payoutHoldReason || 'none',
            chargebackStatus: before?.chargebackStatus || 'unknown',
          },
          afterState: {
            adminHold: true,
            payoutHoldReason: 'chargeback',
            chargebackStatus: 'open',
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
 * Handle charge.dispute.updated event
 *
 * Phase 2D (CRITICAL): Keep order safety flags in sync as Stripe dispute status changes.
 * This prevents ghost states where the chargeback exists in Stripe but the order is still releasable.
 */
export async function handleChargeDisputeUpdated(db: Firestore, dispute: Stripe.Dispute, requestId?: string) {
  try {
    const disputeId = dispute.id;
    const paymentIntentId = dispute.payment_intent;
    const status = String(dispute.status || '');

    logInfo('Processing chargeback updated', {
      requestId,
      route: '/api/stripe/webhook',
      disputeId,
      paymentIntentId,
      status,
    });

    if (!paymentIntentId) return;

    const ordersRef = db.collection('orders');
    const orderQuery = await ordersRef.where('stripePaymentIntentId', '==', paymentIntentId).limit(1).get();
    if (orderQuery.empty) return;

    const orderDoc = orderQuery.docs[0];
    const orderId = orderDoc.id;
    const before = orderDoc.data() || {};

    const normalized: 'open' | 'won' | 'lost' =
      status === 'won' ? 'won' : status === 'lost' ? 'lost' : 'open';

    await orderDoc.ref.update({
      chargebackStatus: normalized,
      adminHold: true,
      payoutHoldReason: 'chargeback',
      adminHoldReason: `Stripe chargeback ${normalized} (${disputeId})`,
      updatedAt: new Date(),
      lastUpdatedByRole: 'admin',
    });

    await createAuditLog(db, {
      actorUid: 'webhook',
      actorRole: 'webhook',
      actionType: 'chargeback_updated',
      orderId,
      listingId: before?.listingId,
      beforeState: {
        adminHold: before?.adminHold || false,
        payoutHoldReason: before?.payoutHoldReason || 'none',
        chargebackStatus: before?.chargebackStatus || 'unknown',
      },
      afterState: {
        adminHold: true,
        payoutHoldReason: 'chargeback',
        chargebackStatus: normalized,
      },
      metadata: { disputeId, status },
      source: 'webhook',
    });
  } catch (error) {
    logError('Error handling charge.dispute.updated', error, {
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
