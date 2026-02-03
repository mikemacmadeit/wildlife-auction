/**
 * Check Fulfillment Reminders
 * 
 * Scheduled function that monitors orders in stall-prone states and sends reminders.
 * Runs every hour to check for orders needing reminders.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import type { Order } from '@/lib/types';
import { getReminderSchedule, shouldAutoComplete, shouldEscalateToAdmin, SLA_WARNING_HOURS, COMPLIANCE_REMINDER_HOURS, COMPLIANCE_ESCALATION_DAYS } from '@/lib/orders/completion-policies';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { createAuditLog } from '@/lib/audit/logger';
import { enqueueReviewRequest } from '@/lib/reviews/reviewRequest';
import { assertInt32 } from '@/lib/debug/int32Tripwire';
import { isRegulatedWhitetailDeal, hasComplianceConfirmations } from '@/lib/compliance/whitetail';

interface ReminderRecord {
  orderId: string;
  lastReminderAt?: Date;
  reminderCount: number;
  nextReminderAt?: Date;
}

/**
 * Get or create reminder record for an order
 */
async function getReminderRecord(
  db: FirebaseFirestore.Firestore,
  orderId: string
): Promise<ReminderRecord | null> {
  const reminderRef = db.collection('orderReminders').doc(orderId);
  const reminderDoc = await reminderRef.get();
  
  if (reminderDoc.exists) {
    const data = reminderDoc.data()!;
    // Safely convert Timestamps to Dates, ensuring no invalid nanoseconds
    const lastReminderAtRaw: any = data.lastReminderAt;
    const lastReminderAt = lastReminderAtRaw instanceof Date ? lastReminderAtRaw : (lastReminderAtRaw && typeof lastReminderAtRaw === 'object' && typeof lastReminderAtRaw.toDate === 'function' ? lastReminderAtRaw.toDate() : undefined);
    const nextReminderAtRaw: any = data.nextReminderAt;
    const nextReminderAt = nextReminderAtRaw instanceof Date ? nextReminderAtRaw : (nextReminderAtRaw && typeof nextReminderAtRaw === 'object' && typeof nextReminderAtRaw.toDate === 'function' ? nextReminderAtRaw.toDate() : undefined);
    // Tripwire: catch invalid reminderCount before returning
    if (data.reminderCount !== undefined) {
      assertInt32(data.reminderCount, 'reminderRecord.reminderCount');
    }
    return {
      orderId,
      lastReminderAt,
      reminderCount: data.reminderCount || 0,
      nextReminderAt,
    };
  }
  
  return {
    orderId,
    reminderCount: 0,
  };
}

/**
 * Update reminder record
 */
async function updateReminderRecord(
  db: FirebaseFirestore.Firestore,
  orderId: string,
  record: ReminderRecord
): Promise<void> {
  const reminderRef = db.collection('orderReminders').doc(orderId);
  // Clamp reminderCount to >= 0 to prevent negative values from causing int32 serialization errors
  const safeReminderCount = Math.max(0, record.reminderCount || 0);
  // Tripwire: catch invalid int32 before Firestore write
  assertInt32(safeReminderCount, 'reminderCount');
  await reminderRef.set({
    orderId,
    lastReminderAt: record.lastReminderAt ? Timestamp.fromDate(record.lastReminderAt) : null,
    reminderCount: safeReminderCount,
    nextReminderAt: record.nextReminderAt ? Timestamp.fromDate(record.nextReminderAt) : null,
    updatedAt: Timestamp.now(),
  }, { merge: true });
}

/**
 * Send reminder for an order
 */
async function sendReminder(
  db: FirebaseFirestore.Firestore,
  order: any,
  reminderType: 'fulfillment' | 'receipt' | 'pickup' | 'sla_approaching' | 'sla_overdue'
): Promise<void> {
  const txStatus = getEffectiveTransactionStatus(order);
  const transportOption = order.transportOption || 'SELLER_TRANSPORT';
  const listingTitle = order.listingSnapshot?.title || 'Your order';
  const now = Date.now();
  
  // Determine target user and event type
  let targetUserId: string;
  let eventType: string;
  let eventPayload: any;
  let orderUrl: string;
  
  if (reminderType === 'fulfillment' || reminderType === 'sla_approaching' || reminderType === 'sla_overdue') {
    // Remind seller
    targetUserId = order.sellerId;
    orderUrl = `${getSiteUrl()}/seller/orders/${order.id}`;
    
    if (reminderType === 'sla_approaching') {
      const slaDeadline = order.fulfillmentSlaDeadlineAt instanceof Date ? order.fulfillmentSlaDeadlineAt : (order.fulfillmentSlaDeadlineAt && typeof order.fulfillmentSlaDeadlineAt === 'object' && typeof order.fulfillmentSlaDeadlineAt.toDate === 'function' ? order.fulfillmentSlaDeadlineAt.toDate() : new Date(order.fulfillmentSlaDeadlineAt || 0));
      // Clamp to >= 0 to prevent negative values from causing int32 serialization errors
      const hoursRemaining = Math.max(0, Math.floor((slaDeadline.getTime() - now) / (1000 * 60 * 60)));
      // Tripwire: catch invalid int32 before serialization
      assertInt32(hoursRemaining, 'Order.SlaApproaching.hoursRemaining');
      eventType = 'Order.SlaApproaching';
      eventPayload = {
        type: 'Order.SlaApproaching',
        orderId: order.id,
        listingId: order.listingId,
        listingTitle,
        orderUrl,
        hoursRemaining,
        deadline: slaDeadline.toISOString(),
      };
    } else if (reminderType === 'sla_overdue') {
      const slaDeadline = order.fulfillmentSlaDeadlineAt instanceof Date ? order.fulfillmentSlaDeadlineAt : (order.fulfillmentSlaDeadlineAt && typeof order.fulfillmentSlaDeadlineAt === 'object' && typeof order.fulfillmentSlaDeadlineAt.toDate === 'function' ? order.fulfillmentSlaDeadlineAt.toDate() : new Date(order.fulfillmentSlaDeadlineAt || 0));
      // Clamp to >= 0 (hoursOverdue should always be positive when overdue, but ensure it)
      const hoursOverdue = Math.max(0, Math.floor((now - slaDeadline.getTime()) / (1000 * 60 * 60)));
      // Tripwire: catch invalid int32 before serialization
      assertInt32(hoursOverdue, 'Order.SlaOverdue.hoursOverdue');
      eventType = 'Order.SlaOverdue';
      eventPayload = {
        type: 'Order.SlaOverdue',
        orderId: order.id,
        listingId: order.listingId,
        listingTitle,
        orderUrl,
        hoursOverdue,
        deadline: slaDeadline.toISOString(),
      };
    } else {
      // Regular fulfillment reminder
      eventType = 'Order.SlaApproaching'; // Reuse SLA approaching for now
      const slaDeadline = order.fulfillmentSlaDeadlineAt instanceof Date ? order.fulfillmentSlaDeadlineAt : (order.fulfillmentSlaDeadlineAt && typeof order.fulfillmentSlaDeadlineAt === 'object' && typeof order.fulfillmentSlaDeadlineAt.toDate === 'function' ? order.fulfillmentSlaDeadlineAt.toDate() : null);
      // Clamp to >= 0 to prevent negative values
      const hoursRemaining = slaDeadline ? Math.max(0, Math.floor((slaDeadline.getTime() - now) / (1000 * 60 * 60))) : null;
      // Tripwire: catch invalid int32 before serialization
      if (hoursRemaining !== null) assertInt32(hoursRemaining, 'Order.SlaApproaching.hoursRemaining');
      eventPayload = {
        type: 'Order.SlaApproaching',
        orderId: order.id,
        listingId: order.listingId,
        listingTitle,
        orderUrl,
        hoursRemaining,
        deadline: slaDeadline?.toISOString() || null,
      };
    }
  } else if (reminderType === 'receipt') {
    // Remind buyer
    targetUserId = order.buyerId;
    orderUrl = `${getSiteUrl()}/dashboard/orders/${order.id}`;
    eventType = 'Order.DeliveryCheckIn'; // Reuse existing event type
    eventPayload = {
      type: 'Order.DeliveryCheckIn',
      orderId: order.id,
      listingId: order.listingId,
      listingTitle,
      orderUrl,
      // Clamp to >= 0 to prevent negative values
      daysSinceDelivery: (() => {
        const deliveredAt = order.deliveredAt;
        const deliveredAtTime = deliveredAt instanceof Date ? deliveredAt.getTime() : (deliveredAt && typeof deliveredAt === 'object' && typeof deliveredAt.toDate === 'function' ? deliveredAt.toDate().getTime() : new Date(deliveredAt || 0).getTime());
        const days = Math.max(0, Math.floor((now - deliveredAtTime) / (1000 * 60 * 60 * 24)));
        assertInt32(days, 'Order.DeliveryCheckIn.daysSinceDelivery');
        return days;
      })(),
    };
  } else {
    // pickup reminder - remind buyer
    targetUserId = order.buyerId;
    orderUrl = `${getSiteUrl()}/dashboard/orders/${order.id}`;
    eventType = 'Order.SlaApproaching'; // Reuse for now
    eventPayload = {
      type: 'Order.SlaApproaching',
      orderId: order.id,
      listingId: order.listingId,
      listingTitle,
      orderUrl,
      hoursRemaining: null,
      deadline: null,
    };
  }
  
  // Emit notification event
  try {
    const ev = await emitAndProcessEventForUser({
      type: eventType as any,
      actorId: 'system',
      entityType: 'order',
      entityId: order.id,
      targetUserId,
      payload: eventPayload as any,
      optionalHash: `reminder:${reminderType}:${now}`,
    });
    
    if (ev?.ok && ev.created) {
      void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch(() => {});
    }
  } catch (e) {
    console.error(`Error sending ${reminderType} reminder for order ${order.id}:`, e);
  }
}

/**
 * Main handler
 */
export async function checkFulfillmentReminders(): Promise<{ processed: number; errors: number }> {
  const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;
  const now = Date.now();
  let processed = 0;
  let errors = 0;
  
  try {
    // Find orders in stall-prone states
    const stallStates = [
      'FULFILLMENT_REQUIRED',
      'DELIVERY_SCHEDULED',
      'DELIVERED_PENDING_CONFIRMATION',
      'READY_FOR_PICKUP',
      'PICKUP_SCHEDULED',
    ];
    
    // Query orders with these statuses (using transactionStatus field)
    // Also include AWAITING_TRANSFER_COMPLIANCE for compliance reminders
    const ordersRef = db.collection('orders');
    // Ensure limit is always >= 1 to prevent int32 serialization errors
    const safeLimit = 100;
    // Tripwire: catch invalid limit before Firestore query
    assertInt32(safeLimit, 'Firestore.limit');
    const allStallStates = [...stallStates, 'AWAITING_TRANSFER_COMPLIANCE'];
    const ordersSnapshot = await ordersRef
      .where('transactionStatus', 'in', allStallStates)
      .limit(safeLimit) // Process in batches
      .get();
    
    const orders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    for (const orderDoc of orders) {
      try {
        const order: any = orderDoc;
        const txStatus = getEffectiveTransactionStatus(order);
        
        // Skip if status changed (no longer in stall state)
        if (!stallStates.includes(txStatus)) {
          continue;
        }
        
        // Check for auto-completion
        if (shouldAutoComplete(order)) {
          // Auto-complete the order
          await db.collection('orders').doc(order.id).update({
            transactionStatus: 'COMPLETED',
            status: 'completed',
            completedAt: Timestamp.now(),
            updatedAt: new Date(),
            lastUpdatedByRole: 'system',
            autoCompletedAt: Timestamp.now(),
            autoCompletedReason: 'delivered_pending_confirmation_timeout',
          });
          
          // Log audit
          await createAuditLog(db, {
            actorUid: 'system',
            actorRole: 'system',
            actionType: 'order_status_changed',
            orderId: order.id,
            source: 'cron',
            metadata: {
              reason: 'delivered_pending_confirmation_timeout',
              daysSinceDelivery: (() => {
                const deliveredAt: any = order.deliveredAt;
                const deliveredAtTime = deliveredAt instanceof Date ? deliveredAt.getTime() : (deliveredAt && typeof deliveredAt === 'object' && typeof deliveredAt.toDate === 'function' ? deliveredAt.toDate().getTime() : new Date(deliveredAt || 0).getTime());
                const days = Math.max(0, Math.floor((now - deliveredAtTime) / (1000 * 60 * 60 * 24)));
                if (days !== null) assertInt32(days, 'audit.daysSinceDelivery');
                return days;
              })(),
            },
          });

          // Enqueue review request for buyer (idempotent).
          try {
            await enqueueReviewRequest({ db: db as any, orderId: order.id, order });
          } catch {
            /* best-effort */
          }
          
          processed++;
          continue;
        }
        
        // Check for escalation
        if (shouldEscalateToAdmin(order)) {
          // Mark for admin review (add flag, don't change status)
          await db.collection('orders').doc(order.id).update({
            escalatedToAdmin: true,
            escalatedAt: Timestamp.now(),
            updatedAt: new Date(),
          });
          
          // Log audit
          await createAuditLog(db, {
            actorUid: 'system',
            actorRole: 'system',
            actionType: 'order_status_changed',
            orderId: order.id,
            source: 'cron',
            metadata: {
              reason: 'unresponsive_timeout',
              daysSincePayment: (() => {
                const paidAt: any = order.paidAt;
                if (!paidAt) return null;
                const paidAtTime = paidAt instanceof Date ? paidAt.getTime() : (paidAt && typeof paidAt === 'object' && typeof paidAt.toDate === 'function' ? paidAt.toDate().getTime() : new Date(paidAt || 0).getTime());
                const days = Math.max(0, Math.floor((now - paidAtTime) / (1000 * 60 * 60 * 24)));
                if (days !== null) assertInt32(days, 'audit.daysSincePayment');
                return days;
              })(),
            },
          });
          
          processed++;
          continue;
        }
        
        // Check if this is a compliance-gated order needing compliance reminders
        if (txStatus === 'AWAITING_TRANSFER_COMPLIANCE' && isRegulatedWhitetailDeal(order)) {
          const confirmations = hasComplianceConfirmations(order);
          const paidAt: any = order.paidAt;
          
          if (paidAt) {
            const paidAtMs = paidAt instanceof Date ? paidAt.getTime() : (paidAt && typeof paidAt === 'object' && typeof paidAt.toDate === 'function' ? paidAt.toDate().getTime() : new Date(paidAt || 0).getTime());
            const hoursSincePayment = Math.max(0, Math.floor((now - paidAtMs) / (1000 * 60 * 60)));
            const daysSincePayment = Math.max(0, Math.floor(hoursSincePayment / 24));
            
            // Tripwire: validate time calculations before using
            assertInt32(hoursSincePayment, 'compliance.hoursSincePayment');
            assertInt32(daysSincePayment, 'compliance.daysSincePayment');
            
            // Compliance reminder schedule: use constants from completion-policies
            // Check if we're in any of the reminder windows
            const shouldRemind = COMPLIANCE_REMINDER_HOURS.some(reminderHours => {
              const windowStart = reminderHours;
              const windowEnd = reminderHours + 12; // 12-hour window
              return hoursSincePayment >= windowStart && hoursSincePayment < windowEnd && !confirmations.bothConfirmed;
            });
            
            // Escalation check (7 days)
            const shouldEscalate = daysSincePayment >= COMPLIANCE_ESCALATION_DAYS && !confirmations.bothConfirmed;
            
            // Check last compliance reminder
            const reminderRecord = await getReminderRecord(db, order.id);
            if (!reminderRecord) continue;
            const lastComplianceReminder = reminderRecord.lastReminderAt?.getTime() || 0;
            const hoursSinceLastReminder = lastComplianceReminder > 0 ? Math.max(0, Math.floor((now - lastComplianceReminder) / (1000 * 60 * 60))) : Infinity;
            
            // Send reminder if due and haven't sent in last 12 hours (rate limiting)
            if ((shouldRemind || shouldEscalate) && hoursSinceLastReminder >= 12) {
              // Determine which party needs reminder
              if (!confirmations.buyerConfirmed) {
                await emitAndProcessEventForUser({
                  type: 'Order.TransferComplianceRequired',
                  entityType: 'order',
                  entityId: order.id,
                  targetUserId: order.buyerId,
                  actorId: 'system',
                  payload: {
                    type: 'Order.TransferComplianceRequired',
                    orderId: order.id,
                    listingId: order.listingId,
                    listingTitle: order.listingSnapshot?.title || 'Listing',
                    orderUrl: `${getSiteUrl()}/dashboard/orders/${order.id}`,
                  },
                });
              }
              
              if (!confirmations.sellerConfirmed) {
                await emitAndProcessEventForUser({
                  type: 'Order.TransferComplianceRequired',
                  entityType: 'order',
                  entityId: order.id,
                  targetUserId: order.sellerId,
                  actorId: 'system',
                  payload: {
                    type: 'Order.TransferComplianceRequired',
                    orderId: order.id,
                    listingId: order.listingId,
                    listingTitle: order.listingSnapshot?.title || 'Listing',
                    orderUrl: `${getSiteUrl()}/seller/orders/${order.id}`,
                  },
                });
              }
              
              // Update reminder record
              const newReminderCount = Math.max(0, (reminderRecord.reminderCount || 0) + 1);
              assertInt32(newReminderCount, 'compliance.reminderCount');
              
              await updateReminderRecord(db, order.id, {
                orderId: order.id,
                lastReminderAt: new Date(),
                reminderCount: newReminderCount,
                nextReminderAt: daysSincePayment < COMPLIANCE_ESCALATION_DAYS ? new Date(now + 24 * 60 * 60 * 1000) : undefined, // Next reminder in 24h if not at escalation threshold yet
              });
              
              // Mark as "Compliance Stalled" if past escalation threshold
              if (shouldEscalate) {
                await db.collection('orders').doc(order.id).update({
                  complianceStalled: true,
                  complianceStalledAt: Timestamp.now(),
                  updatedAt: new Date(),
                });
                
                // Log audit
                await createAuditLog(db, {
                  actorUid: 'system',
                  actorRole: 'system',
                  actionType: 'order_status_changed',
                  orderId: order.id,
                  source: 'cron',
                  metadata: {
                    reason: 'compliance_stalled',
                    daysSincePayment: daysSincePayment, // Already clamped and validated above
                    buyerConfirmed: confirmations.buyerConfirmed,
                    sellerConfirmed: confirmations.sellerConfirmed,
                  },
                });
              }
              
              processed++;
              continue;
            }
          }
        }
        
        // Check reminder schedule (for non-compliance reminders)
        const reminderRecord = await getReminderRecord(db, order.id);
        if (!reminderRecord) continue;
        const schedule = getReminderSchedule(order);
        
        if (schedule.length === 0) {
          continue; // No reminders scheduled
        }
        
        // Check if next reminder is due
        const nextReminder = schedule[0];
        const lastReminder = reminderRecord.lastReminderAt?.getTime() || 0;
        
        // Only send if:
        // 1. Next reminder time has passed
        // 2. We haven't sent a reminder in the last hour (rate limiting)
        // 3. Status hasn't changed (double-check)
        if (nextReminder <= now && (now - lastReminder) > 60 * 60 * 1000) {
          const currentStatus = getEffectiveTransactionStatus(order);
          if (!stallStates.includes(currentStatus)) {
            continue; // Status changed, skip
          }
          
          // Determine reminder type
          let reminderType: 'fulfillment' | 'receipt' | 'pickup' | 'sla_approaching' | 'sla_overdue' = 'fulfillment';
          
          if (currentStatus === 'DELIVERED_PENDING_CONFIRMATION') {
            reminderType = 'receipt';
          } else if (currentStatus === 'READY_FOR_PICKUP' || currentStatus === 'PICKUP_SCHEDULED') {
            reminderType = 'pickup';
          } else if (order.fulfillmentSlaDeadlineAt) {
            const slaDeadlineAt: any = order.fulfillmentSlaDeadlineAt;
            const slaDeadline = slaDeadlineAt instanceof Date ? slaDeadlineAt.getTime() : (slaDeadlineAt && typeof slaDeadlineAt === 'object' && typeof slaDeadlineAt.toDate === 'function' ? slaDeadlineAt.toDate().getTime() : new Date(slaDeadlineAt || 0).getTime());
            if (now > slaDeadline) {
              reminderType = 'sla_overdue';
            } else if ((slaDeadline - now) <= SLA_WARNING_HOURS * 60 * 60 * 1000) {
              reminderType = 'sla_approaching';
            }
          }
          
          // Send reminder
          await sendReminder(db, order, reminderType);
          
          // Update reminder record
          const nextSchedule = schedule.slice(1);
          // Clamp reminderCount to >= 0 to prevent negative values
          const safeReminderCount = Math.max(0, (reminderRecord.reminderCount || 0) + 1);
          // Tripwire: catch invalid int32 before Firestore write
          assertInt32(safeReminderCount, 'reminderCount.increment');
          await updateReminderRecord(db, order.id, {
            orderId: order.id,
            lastReminderAt: new Date(),
            reminderCount: safeReminderCount,
            nextReminderAt: nextSchedule.length > 0 ? new Date(nextSchedule[0]) : undefined,
          });
          
          processed++;
        }
      } catch (error: any) {
        console.error(`Error processing reminder for order ${orderDoc.id}:`, error);
        errors++;
      }
    }

    try {
      await db.collection('opsHealth').doc('checkFulfillmentReminders').set(
        { lastRunAt: Timestamp.now(), status: 'success', processedCount: processed, errorsCount: errors, updatedAt: Timestamp.now() },
        { merge: true }
      );
    } catch (_) {}
    return { processed, errors };
  } catch (error: any) {
    console.error('Error in checkFulfillmentReminders:', error);
    try {
      await db.collection('opsHealth').doc('checkFulfillmentReminders').set(
        { lastRunAt: Timestamp.now(), status: 'error', lastError: error?.message || 'Unknown error', updatedAt: Timestamp.now() },
        { merge: true }
      );
    } catch (_) {}
    throw error;
  }
}
