/**
 * Netlify Scheduled Function: Auto-Release Protected Transactions
 * 
 * Runs every 10 minutes to automatically release payments for eligible orders
 * 
 * Eligible orders:
 * - stripeTransferId missing (not yet released)
 * - adminHold != true
 * - disputeStatus not in ['open', 'needs_evidence', 'under_review']
 * - AND (
 *     (protectedTransactionDaysSnapshot exists AND protectionEndsAt <= now AND deliveryConfirmedAt exists)
 *     OR
 *     (disputeDeadlineAt <= now AND status in ['paid','in_transit','delivered'])
 *   )
 */

import { Handler, schedule } from '@netlify/functions';
import { FieldPath, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { releasePaymentForOrder } from '../../lib/stripe/release-payment';
import { createAuditLog } from '../../lib/audit/logger';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';
import { captureException } from '../../lib/monitoring/capture';
import { getAdminDb } from '../../lib/firebase/admin';

let db: ReturnType<typeof getFirestore>;

async function initializeFirebaseAdmin() {
  db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
  return db;
}

const baseHandler: Handler = async (event, context) => {
  const requestId = `cron_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  logInfo('Auto-release scheduled function triggered', { requestId, route: 'autoReleaseProtected' });

  const startTime = Date.now();
  const timeBudgetMs = 45_000;
  let scannedCount = 0;
  let releasedCount = 0;
  let errorsCount = 0;
  let lastError: string | null = null;

  try {
    // OFF by default. This scheduled function is a fallback only.
    const enabled = String(process.env.AUTO_RELEASE_ENABLED || 'false').toLowerCase() === 'true';
    if (!enabled) {
      logInfo('Auto-release is disabled (AUTO_RELEASE_ENABLED=false). Exiting.', {
        requestId,
        route: 'autoReleaseProtected',
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, skipped: true, reason: 'AUTO_RELEASE_DISABLED' }),
      };
    }

    await initializeFirebaseAdmin();

    const now = new Date();
    const hoursAfterDelivery = parseInt(process.env.AUTO_RELEASE_HOURS_AFTER_DELIVERY || '72', 10);
    const maxAmountCents = process.env.AUTO_RELEASE_MAX_AMOUNT_CENTS
      ? parseInt(process.env.AUTO_RELEASE_MAX_AMOUNT_CENTS, 10)
      : null;

    // Query eligible orders
    // We'll fetch all paid orders and filter client-side (since Firestore queries are limited)
    console.log('[autoReleaseProtected] Querying orders for auto-release eligibility...');
    
    const ordersRef = db.collection('orders');
    const ordersSnapshot = await ordersRef
      .where('status', 'in', ['paid', 'in_transit', 'delivered', 'accepted', 'ready_to_release'])
      .get();

    scannedCount = ordersSnapshot.size;
    logInfo('Auto-release: scanned orders', {
      requestId,
      route: 'autoReleaseProtected',
      scannedCount,
    });

    const eligibleOrders: Array<{ id: string; data: any }> = [];

    ordersSnapshot.forEach((doc) => {
      const orderData = doc.data();
      const orderId = doc.id;

      // Skip if already released
      if (orderData.stripeTransferId) {
        return;
      }

      // Skip if admin hold
      if (orderData.adminHold === true) {
        return;
      }

      // Skip if open dispute (back-compat: check both `disputeStatus` and `protectedDisputeStatus`)
      const disputeStatus = orderData.protectedDisputeStatus || orderData.disputeStatus;
      if (disputeStatus && ['open', 'needs_evidence', 'under_review'].includes(disputeStatus)) {
        return;
      }

      // Auto-release eligibility (fallback only):
      // - Delivery must be confirmed (deliveryConfirmedAt)
      // - Wait hoursAfterDelivery after delivery confirmation
      // - Must have no active dispute/admin hold/chargeback
      // - Optional max amount guard
      const deliveryConfirmedAt = orderData.deliveryConfirmedAt?.toDate?.() || null;
      if (!deliveryConfirmedAt) return;

      const minReleaseAt = new Date(deliveryConfirmedAt.getTime() + hoursAfterDelivery * 60 * 60 * 1000);
      if (minReleaseAt.getTime() > now.getTime()) return;

      const hasChargeback =
        (orderData.payoutHoldReason && String(orderData.payoutHoldReason) === 'chargeback') ||
        (orderData.chargebackStatus &&
          ['open', 'active', 'funds_withdrawn', 'needs_response', 'warning_needs_response'].includes(orderData.chargebackStatus));
      if (hasChargeback) return;

      // Max amount guard (optional)
      if (maxAmountCents !== null) {
        const amountUsd = Number(orderData.amount || 0);
        const amountCents = Math.round(amountUsd * 100);
        if (!Number.isFinite(amountCents) || amountCents > maxAmountCents) return;
      }

      eligibleOrders.push({ id: orderId, data: orderData });
    });

    logInfo('Auto-release: eligible orders found', {
      requestId,
      route: 'autoReleaseProtected',
      eligibleCount: eligibleOrders.length,
    });

    // Create audit log for auto-release execution (best-effort; don't block releases if it fails)
    try {
      await createAuditLog(db, {
        actorUid: 'system',
        actorRole: 'system',
        actionType: 'auto_release_executed',
        metadata: {
          eligibleOrdersCount: eligibleOrders.length,
          executionTime: now.toISOString(),
        },
        source: 'cron',
      });
    } catch (e: any) {
      // Surface as health error and continue.
      lastError = lastError || String(e?.message || e);
      logWarn('Auto-release: failed to write audit log', { requestId, route: 'autoReleaseProtected', error: String(e?.message || e) });
    }

    const results: Array<{ orderId: string; success: boolean; error?: string }> = [];

    // Process each eligible order
    for (const { id: orderId, data: orderData } of eligibleOrders) {
      try {
        logInfo('Auto-release: processing order', {
          requestId,
          route: 'autoReleaseProtected',
          orderId,
        });

        // Optionally set status to ready_to_release before releasing (helps admin UI + tracking)
        const currentStatus = String(orderData.status || '');
        if (currentStatus !== 'ready_to_release' && currentStatus !== 'completed') {
          await db.collection('orders').doc(orderId).set(
            { status: 'ready_to_release', updatedAt: Timestamp.now() },
            { merge: true }
          );
        }

        const result = await releasePaymentForOrder(db, orderId, 'system');
        
        if (result.success) {
          releasedCount++;
          logInfo('Auto-release: order released successfully', {
            requestId,
            route: 'autoReleaseProtected',
            orderId,
            stripeTransferId: result.transferId,
          });
          results.push({ orderId, success: true });
        } else {
          errorsCount++;
          lastError = result.error || 'Unknown error';
          logWarn('Auto-release: order release failed', {
            requestId,
            route: 'autoReleaseProtected',
            orderId,
            error: result.error,
          });
          results.push({ orderId, success: false, error: result.error });
        }
      } catch (error: any) {
        errorsCount++;
        lastError = error.message || error.toString();
        logError('Auto-release: error processing order', error, {
          requestId,
          route: 'autoReleaseProtected',
          orderId,
        });
        captureException(error instanceof Error ? error : new Error(String(error)), {
          requestId,
          route: 'autoReleaseProtected',
          orderId,
        });
        results.push({ orderId, success: false, error: error.message || error.toString() });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    logInfo('Auto-release: execution completed', {
      requestId,
      route: 'autoReleaseProtected',
      scannedCount,
      releasedCount: successCount,
      errorsCount: failureCount,
      durationMs: Date.now() - startTime,
    });

    // Write health metrics (non-blocking)
    try {
      await db.collection('opsHealth').doc('autoReleaseProtected').set({
        lastRunAt: Timestamp.now(),
        scannedCount,
        releasedCount: successCount,
        errorsCount: failureCount,
        lastError: lastError || null,
        updatedAt: Timestamp.now(),
      }, { merge: true });
    } catch (healthError) {
      logWarn('Auto-release: failed to update health metrics', {
        requestId,
        route: 'autoReleaseProtected',
        error: String(healthError),
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        processed: eligibleOrders.length,
        successful: successCount,
        failed: failureCount,
        results,
      }),
    };
  } catch (error: any) {
    errorsCount++;
    lastError = error.message || error.toString();
    logError('Auto-release: fatal error', error, {
      requestId,
      route: 'autoReleaseProtected',
    });
    captureException(error instanceof Error ? error : new Error(String(error)), {
      requestId,
      route: 'autoReleaseProtected',
    });

    // Write health metrics even on failure
    try {
      const db = await initializeFirebaseAdmin();
      await db.collection('opsHealth').doc('autoReleaseProtected').set({
        lastRunAt: Timestamp.now(),
        scannedCount,
        releasedCount,
        errorsCount,
        lastError,
        updatedAt: Timestamp.now(),
      }, { merge: true });
    } catch (healthError) {
      // Ignore health write failures
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message || error.toString(),
      }),
    };
  }
};

// Schedule to run every 10 minutes
export const handler = schedule('*/10 * * * *', baseHandler);
