/**
 * Scheduled Function: Check Fulfillment SLA
 * 
 * Runs periodically to check for orders that have exceeded fulfillment SLA deadlines
 * and flag them as SELLER_NONCOMPLIANT.
 * 
 * This function should be scheduled via Netlify Scheduled Functions or similar.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { logInfo, logWarn, logError } from '@/lib/monitoring/logger';

export const handler = async (event: any, context: any) => {
  try {
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
    const now = new Date();
    const nowTimestamp = Timestamp.fromDate(now);

    logInfo('Starting fulfillment SLA check', {
      route: 'netlify/functions/checkFulfillmentSla',
      timestamp: now.toISOString(),
    });

    // Find orders that are FULFILLMENT_REQUIRED and past SLA deadline
    const ordersRef = db.collection('orders');
    const fulfillmentRequiredQuery = ordersRef
      .where('transactionStatus', '==', 'FULFILLMENT_REQUIRED')
      .where('fulfillmentSlaDeadlineAt', '<=', nowTimestamp);

    const snapshot = await fulfillmentRequiredQuery.get().catch((e: any) => {
      // If index missing, log warning and return empty
      if (String(e?.code || '').includes('failed-precondition') || String(e?.message || '').includes('index')) {
        logWarn('Missing Firestore index for fulfillment SLA check', {
          route: 'netlify/functions/checkFulfillmentSla',
          error: String(e),
        });
        return { docs: [] };
      }
      throw e;
    });

    let flaggedCount = 0;
    const batch = db.batch();
    let batchCount = 0;
    const BATCH_LIMIT = 500;

    for (const doc of snapshot.docs) {
      const orderData = doc.data();
      
      // Skip if already flagged
      if (orderData.transactionStatus === 'SELLER_NONCOMPLIANT') {
        continue;
      }

      // Verify deadline has passed
      const deadline = orderData.fulfillmentSlaDeadlineAt?.toDate ? orderData.fulfillmentSlaDeadlineAt.toDate() : null;
      if (!deadline || deadline.getTime() > now.getTime()) {
        continue;
      }

      // Flag as non-compliant
      const orderRef = ordersRef.doc(doc.id);
      const updateData: any = {
        transactionStatus: 'SELLER_NONCOMPLIANT',
        sellerNonComplianceReason: 'Fulfillment SLA deadline exceeded',
        sellerNonComplianceAt: Timestamp.fromDate(now),
        adminFlags: [...(orderData.adminFlags || []), 'needs_review', 'frozen_seller_candidate'],
        updatedAt: now,
      };

      batch.update(orderRef, updateData);
      batchCount++;
      flaggedCount++;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    // Also check for DELIVERED_PENDING_CONFIRMATION older than 7 days
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoTimestamp = Timestamp.fromDate(sevenDaysAgo);

    const deliveredPendingQuery = ordersRef
      .where('transactionStatus', '==', 'DELIVERED_PENDING_CONFIRMATION');

    const deliveredSnapshot = await deliveredPendingQuery.get().catch((e: any) => {
      if (String(e?.code || '').includes('failed-precondition') || String(e?.message || '').includes('index')) {
        logWarn('Missing Firestore index for delivered pending check', {
          route: 'netlify/functions/checkFulfillmentSla',
          error: String(e),
        });
        return { docs: [] };
      }
      throw e;
    });

    let reviewFlaggedCount = 0;
    const reviewBatch = db.batch();
    let reviewBatchCount = 0;

    for (const doc of deliveredSnapshot.docs) {
      const orderData = doc.data();
      const deliveredAt = orderData.deliveredAt?.toDate || 
                         orderData.delivery?.deliveredAt ? new Date(orderData.delivery.deliveredAt) : null;

      if (!deliveredAt || deliveredAt.getTime() > sevenDaysAgo.getTime()) {
        continue;
      }

      // Add review flag (don't change status, just flag for admin review)
      const orderRef = ordersRef.doc(doc.id);
      const currentFlags = orderData.adminFlags || [];
      if (!currentFlags.includes('needs_review')) {
        reviewBatch.update(orderRef, {
          adminFlags: [...currentFlags, 'needs_review'],
          updatedAt: now,
        });
        reviewBatchCount++;
        reviewFlaggedCount++;

        if (reviewBatchCount >= BATCH_LIMIT) {
          await reviewBatch.commit();
          reviewBatchCount = 0;
        }
      }
    }

    if (reviewBatchCount > 0) {
      await reviewBatch.commit();
    }

    logInfo('Fulfillment SLA check completed', {
      route: 'netlify/functions/checkFulfillmentSla',
      flaggedNonCompliant: flaggedCount,
      flaggedForReview: reviewFlaggedCount,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        flaggedNonCompliant: flaggedCount,
        flaggedForReview: reviewFlaggedCount,
      }),
    };
  } catch (error: any) {
    logError('Error in fulfillment SLA check', error, {
      route: 'netlify/functions/checkFulfillmentSla',
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
};
