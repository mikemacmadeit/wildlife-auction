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
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { releasePaymentForOrder } from '../../lib/stripe/release-payment';
import { createAuditLog } from '../../lib/audit/logger';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';
import { captureException } from '../../lib/monitoring/capture';

// Initialize Firebase Admin
let adminApp: App | undefined;
let db: ReturnType<typeof getFirestore>;

async function initializeFirebaseAdmin() {
  if (!adminApp) {
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
            adminApp = initializeApp();
          } catch {
            throw new Error('Failed to initialize Firebase Admin SDK');
          }
        }
      } catch (error) {
        console.error('[autoReleaseProtected] Firebase Admin initialization error:', error);
        throw error;
      }
    } else {
      adminApp = getApps()[0];
    }
  }
  db = getFirestore(adminApp);
  return db;
}

const baseHandler: Handler = async (event, context) => {
  const requestId = `cron_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  logInfo('Auto-release scheduled function triggered', { requestId, route: 'autoReleaseProtected' });

  const startTime = Date.now();
  let scannedCount = 0;
  let releasedCount = 0;
  let errorsCount = 0;
  let lastError: string | null = null;

  try {
    await initializeFirebaseAdmin();

    const now = new Date();
    const nowTimestamp = Timestamp.fromDate(now);

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

      // Skip if open dispute
      const disputeStatus = orderData.disputeStatus;
      if (disputeStatus && ['open', 'needs_evidence', 'under_review'].includes(disputeStatus)) {
        return;
      }

      // Check if order meets "ready_to_release" criteria
      const deliveryConfirmedAt = orderData.deliveryConfirmedAt;
      const protectionEndsAt = orderData.protectionEndsAt?.toDate();
      const protectedTransaction = orderData.protectedTransactionDaysSnapshot !== null && orderData.protectedTransactionDaysSnapshot !== undefined;
      const hasAdminHold = orderData.adminHold === true;
      const hasChargeback = orderData.chargebackStatus && ['active', 'funds_withdrawn'].includes(orderData.chargebackStatus);

      // Check if order is eligible for ready_to_release status
      const isEligibleForReadyToRelease = 
        deliveryConfirmedAt && // Delivery confirmed
        (!protectedTransaction || (protectionEndsAt && protectionEndsAt.getTime() <= now.getTime())) && // Protection window passed (if applicable)
        (!disputeStatus || ['none', 'cancelled', 'resolved_release'].includes(disputeStatus)) && // No active dispute
        !hasAdminHold && // No admin hold
        !hasChargeback; // No active chargeback

      // Check protected transaction eligibility
      const protectedDays = orderData.protectedTransactionDaysSnapshot;
      
      if (protectedDays !== null && protectedDays !== undefined) {
        // Protected transaction: must have deliveryConfirmedAt and protectionEndsAt <= now
        if (deliveryConfirmedAt && protectionEndsAt && protectionEndsAt.getTime() <= now.getTime()) {
          eligibleOrders.push({ id: orderId, data: orderData });
          return;
        }
      }

      // Check standard escrow eligibility
      const disputeDeadline = orderData.disputeDeadlineAt?.toDate();
      const status = orderData.status;

      if (disputeDeadline && disputeDeadline.getTime() <= now.getTime()) {
        if (['paid', 'in_transit', 'delivered'].includes(status)) {
          eligibleOrders.push({ id: orderId, data: orderData });
        }
      }
    });

    logInfo('Auto-release: eligible orders found', {
      requestId,
      route: 'autoReleaseProtected',
      eligibleCount: eligibleOrders.length,
    });

    // Create audit log for auto-release execution
    await createAuditLog(db, {
      actorUid: 'system',
      actorRole: 'system',
      actionType: 'auto_release_executed',
      beforeState: {},
      afterState: {},
      metadata: {
        eligibleOrdersCount: eligibleOrders.length,
        executionTime: now.toISOString(),
      },
      source: 'cron',
    });

    const results: Array<{ orderId: string; success: boolean; error?: string }> = [];

    // Process each eligible order
    for (const { id: orderId, data: orderData } of eligibleOrders) {
      try {
        logInfo('Auto-release: processing order', {
          requestId,
          route: 'autoReleaseProtected',
          orderId,
        });

        // Check if order should be set to ready_to_release status first
        const deliveryConfirmedAt = orderData.deliveryConfirmedAt;
        const protectionEndsAt = orderData.protectionEndsAt?.toDate();
        const protectedTransaction = orderData.protectedTransactionDaysSnapshot !== null && orderData.protectedTransactionDaysSnapshot !== undefined;
        const disputeStatus = orderData.disputeStatus;
        const hasAdminHold = orderData.adminHold === true;
        const hasChargeback = orderData.chargebackStatus && ['active', 'funds_withdrawn'].includes(orderData.chargebackStatus);
        const currentStatus = orderData.status;

        const isEligibleForReadyToRelease = 
          deliveryConfirmedAt && // Delivery confirmed
          (!protectedTransaction || (protectionEndsAt && protectionEndsAt.getTime() <= now.getTime())) && // Protection window passed (if applicable)
          (!disputeStatus || ['none', 'cancelled', 'resolved_release'].includes(disputeStatus)) && // No active dispute
          !hasAdminHold && // No admin hold
          !hasChargeback; // No active chargeback

        // Update status to ready_to_release if eligible and not already set
        if (isEligibleForReadyToRelease && currentStatus !== 'ready_to_release' && currentStatus !== 'completed') {
          const orderRef = db.collection('orders').doc(orderId);
          await orderRef.update({
            status: 'ready_to_release',
            updatedAt: Timestamp.now(),
          });

          // Audit log for status change
          await createAuditLog(db, {
            actorUid: 'system',
            actorRole: 'system',
            actionType: 'order_status_changed',
            orderId: orderId,
            listingId: orderData.listingId,
            beforeState: { status: currentStatus },
            afterState: { status: 'ready_to_release' },
            metadata: {
              reason: 'auto_ready_to_release',
              deliveryConfirmedAt: deliveryConfirmedAt ? deliveryConfirmedAt.toISOString() : null,
              protectionEndsAt: protectionEndsAt ? protectionEndsAt.toISOString() : null,
            },
            source: 'cron',
          });

          logInfo('Auto-release: order set to ready_to_release', {
            requestId,
            route: 'autoReleaseProtected',
            orderId,
            previousStatus: currentStatus,
          });
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
