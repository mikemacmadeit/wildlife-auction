/**
 * POST /api/admin/reminders/run
 * 
 * Cron-friendly endpoint to run automated order reminders.
 * Queries orders requiring action and sends reminders via SendGrid + in-app notifications.
 * 
 * Rate-limited: processes 5-10 orders per batch to avoid overwhelming SendGrid.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { computeReminderPlan, shouldSendReminder, getReminderTemplate } from '@/lib/reminders/orderReminders';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { createAuditLog } from '@/lib/audit/logger';
import { captureException } from '@/lib/monitoring/capture';
import { getSiteUrl } from '@/lib/site-url';
import { safeUpdate } from '@/lib/firebase/safeFirestore';

const BATCH_SIZE = 5; // Process 5 orders at a time to avoid rate limits

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(request: Request) {
  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
    }

    // Auth check (optional - can be called by cron without auth)
    const authHeader = request.headers.get('authorization');
    let adminId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      try {
        const decodedToken = await auth.verifyIdToken(token);
        adminId = decodedToken.uid;
      } catch (error) {
        // If auth fails, continue as system-initiated (for cron)
        adminId = 'system';
      }
    } else {
      adminId = 'system';
    }

    // Query orders requiring action (non-terminal statuses)
    const ordersRef = db.collection('orders');
    const now = Date.now();
    
    // Get orders that are not completed and have been paid
    const ordersSnapshot = await ordersRef
      .where('paidAt', '!=', null)
      .limit(100) // Process max 100 orders per run
      .get();

    const ordersToProcess: Array<{ id: string; data: any }> = [];
    
    for (const doc of ordersSnapshot.docs) {
      const orderData = doc.data() as any;
      const txStatus = getEffectiveTransactionStatus(orderData);
      
      // Skip terminal states
      if (['COMPLETED', 'REFUNDED', 'CANCELLED'].includes(txStatus)) {
        continue;
      }

      // Check if order needs reminders
      const plan = computeReminderPlan(orderData);
      if (plan.buyer.shouldSend || plan.seller.shouldSend) {
        ordersToProcess.push({ id: doc.id, data: orderData });
      }
    }

    const results: Array<{ orderId: string; role: 'buyer' | 'seller'; success: boolean; error?: string }> = [];

    // Process in batches
    for (let i = 0; i < ordersToProcess.length; i += BATCH_SIZE) {
      const batch = ordersToProcess.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(
        batch.map(async ({ id: orderId, data: orderData }) => {
          const plan = computeReminderPlan(orderData);
          const orderResults: Array<{ orderId: string; role: 'buyer' | 'seller'; success: boolean; error?: string }> = [];

          // Process buyer reminder
          if (plan.buyer.shouldSend && plan.buyer.window) {
            try {
              const buyerId = orderData.buyerId;
              if (!buyerId) {
                orderResults.push({ orderId, role: 'buyer', success: false, error: 'Buyer ID missing' });
              } else {
                const template = getReminderTemplate(orderData, 'buyer', plan.buyer.window);
                const listingTitle = orderData.listingSnapshot?.title || 'Your order';
                const orderUrl = `${getSiteUrl()}/dashboard/orders/${orderId}`;

                // Compute hours remaining from SLA deadline if available
                const deadline = orderData.fulfillmentSlaDeadlineAt;
                const hoursRemaining = deadline 
                  ? Math.max(0, Math.floor((deadline.toDate ? deadline.toDate().getTime() : new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60)))
                  : 0;

                // Emit notification event
                const event = await emitAndProcessEventForUser({
                  type: 'Order.SlaApproaching',
                  actorId: adminId || 'system',
                  entityType: 'order',
                  entityId: orderId,
                  targetUserId: buyerId,
                  payload: {
                    type: 'Order.SlaApproaching',
                    orderId,
                    listingId: orderData.listingId,
                    listingTitle,
                    orderUrl,
                    hoursRemaining,
                    deadline: deadline 
                      ? (deadline.toDate ? deadline.toDate().toISOString() : new Date(deadline).toISOString())
                      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Fallback: 24h from now
                  },
                  optionalHash: `auto_reminder:buyer:${plan.buyer.window}:${Date.now()}`,
                });

                if (event?.ok && event.created) {
                  void tryDispatchEmailJobNow({ db: db as any, jobId: event.eventId, waitForJob: true }).catch((err) => {
                    captureException(err instanceof Error ? err : new Error(String(err)), {
                      context: 'email-dispatch',
                      eventType: 'Order.Reminder',
                      jobId: event.eventId,
                      orderId,
                      role: 'buyer',
                      endpoint: '/api/admin/reminders/run',
                    });
                  });
                }

                // Update reminder metadata
                const reminders = orderData.reminders || {};
                await safeUpdate(ordersRef.doc(orderId), {
                  reminders: {
                    ...reminders,
                    buyerLastAt: Timestamp.now(),
                    buyerCount: (reminders.buyerCount || 0) + 1,
                  },
                });

                orderResults.push({ orderId, role: 'buyer', success: true });
              }
            } catch (error: any) {
              orderResults.push({ orderId, role: 'buyer', success: false, error: error.message || 'Unknown error' });
            }
          }

          // Process seller reminder
          if (plan.seller.shouldSend && plan.seller.window) {
            try {
              const sellerId = orderData.sellerId;
              if (!sellerId) {
                orderResults.push({ orderId, role: 'seller', success: false, error: 'Seller ID missing' });
              } else {
                const template = getReminderTemplate(orderData, 'seller', plan.seller.window);
                const listingTitle = orderData.listingSnapshot?.title || 'Your sale';
                const orderUrl = `${getSiteUrl()}/seller/orders/${orderId}`;

                // Compute hours remaining from SLA deadline if available
                const deadline = orderData.fulfillmentSlaDeadlineAt;
                const hoursRemaining = deadline 
                  ? Math.max(0, Math.floor((deadline.toDate ? deadline.toDate().getTime() : new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60)))
                  : 0;

                // Emit notification event
                const event = await emitAndProcessEventForUser({
                  type: 'Order.SlaApproaching',
                  actorId: adminId || 'system',
                  entityType: 'order',
                  entityId: orderId,
                  targetUserId: sellerId,
                  payload: {
                    type: 'Order.SlaApproaching',
                    orderId,
                    listingId: orderData.listingId,
                    listingTitle,
                    orderUrl,
                    hoursRemaining,
                    deadline: deadline 
                      ? (deadline.toDate ? deadline.toDate().toISOString() : new Date(deadline).toISOString())
                      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Fallback: 24h from now
                  },
                  optionalHash: `auto_reminder:seller:${plan.seller.window}:${Date.now()}`,
                });

                if (event?.ok && event.created) {
                  void tryDispatchEmailJobNow({ db: db as any, jobId: event.eventId, waitForJob: true }).catch((err) => {
                    captureException(err instanceof Error ? err : new Error(String(err)), {
                      context: 'email-dispatch',
                      eventType: 'Order.Reminder',
                      jobId: event.eventId,
                      orderId,
                      role: 'buyer',
                      endpoint: '/api/admin/reminders/run',
                    });
                  });
                }

                // Update reminder metadata
                const reminders = orderData.reminders || {};
                await safeUpdate(ordersRef.doc(orderId), {
                  reminders: {
                    ...reminders,
                    sellerLastAt: Timestamp.now(),
                    sellerCount: (reminders.sellerCount || 0) + 1,
                  },
                });

                orderResults.push({ orderId, role: 'seller', success: true });
              }
            } catch (error: any) {
              orderResults.push({ orderId, role: 'seller', success: false, error: error.message || 'Unknown error' });
            }
          }

          return orderResults;
        })
      );

      results.push(...batchResults.flat());

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < ordersToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    // Log audit entry
    await createAuditLog(db, {
      actorUid: adminId || 'system',
      actorRole: adminId ? 'admin' : 'system',
      actionType: 'admin_note_added', // TODO: Add 'admin_reminders_run' to AuditActionType
      metadata: {
        ordersProcessed: ordersToProcess.length,
        remindersSent: successCount,
        failures: failCount,
        timestamp: new Date().toISOString(),
        note: 'Automated reminder batch processed',
      },
      source: adminId ? 'admin_ui' : 'cron',
    });

    return json({
      success: true,
      processed: ordersToProcess.length,
      remindersSent: successCount,
      failures: failCount,
      results: results.slice(0, 20), // Return first 20 results for debugging
    });
  } catch (error: any) {
    console.error('Error running reminders:', error);
    return json({ error: 'Failed to run reminders', message: error.message }, { status: 500 });
  }
}
