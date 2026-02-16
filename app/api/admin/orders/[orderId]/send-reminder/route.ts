/**
 * POST /api/admin/orders/[orderId]/send-reminder
 * 
 * Admin tool to send a reminder to buyer or seller for a specific order.
 * Uses templated messages via SendGrid.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { requireAdmin, json } from '@/app/api/admin/_util';
import { z } from 'zod';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { createAuditLog } from '@/lib/audit/logger';
import { captureException } from '@/lib/monitoring/capture';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { getUserProfile } from '@/lib/firebase/users';
import { assertInt32 } from '@/lib/debug/int32Tripwire';

const sendReminderSchema = z.object({
  role: z.enum(['buyer', 'seller']),
  message: z.string().optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ orderId: string }> | { orderId: string } }
) {
  try {
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

    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.response;
    const db = admin.ctx.db as unknown as ReturnType<typeof getFirestore>;
    const adminId = admin.ctx.actorUid;

    const params = typeof (ctx.params as any)?.then === 'function' ? await (ctx.params as Promise<{ orderId: string }>) : (ctx.params as { orderId: string });
    const orderId = params.orderId;

    // Parse and validate request body
    const body = await request.json();
    const validation = sendReminderSchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { role, message } = validation.data;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()! as any;
    const txStatus = getEffectiveTransactionStatus(orderData);
    const listingTitle = orderData.listingSnapshot?.title || 'Your order';

    // Determine target user
    const targetUserId = role === 'buyer' ? orderData.buyerId : orderData.sellerId;
    if (!targetUserId) {
      return json({ error: 'Target user not found' }, { status: 404 });
    }

    // Get user profile for name
    const userProfile = await getUserProfile(targetUserId);
    const userName = userProfile?.displayName || userProfile?.profile?.fullName || 'User';

    // Determine order URL based on role
    const orderUrl = role === 'buyer' 
      ? `${getSiteUrl()}/dashboard/orders/${orderId}`
      : `${getSiteUrl()}/seller/orders/${orderId}`;

    // Determine reminder type based on status
    let reminderType: 'fulfillment' | 'receipt' | 'pickup' | 'sla_approaching' | 'sla_overdue' = 'fulfillment';
    
    if (txStatus === 'DELIVERED_PENDING_CONFIRMATION' && role === 'buyer') {
      reminderType = 'receipt';
    } else if ((txStatus === 'READY_FOR_PICKUP' || txStatus === 'PICKUP_SCHEDULED') && role === 'buyer') {
      reminderType = 'pickup';
    } else if (orderData.fulfillmentSlaDeadlineAt) {
      const slaDeadline = orderData.fulfillmentSlaDeadlineAt.toDate 
        ? orderData.fulfillmentSlaDeadlineAt.toDate().getTime()
        : new Date(orderData.fulfillmentSlaDeadlineAt).getTime();
      const now = Date.now();
      if (now > slaDeadline) {
        reminderType = 'sla_overdue';
      } else if ((slaDeadline - now) <= 24 * 60 * 60 * 1000) {
        reminderType = 'sla_approaching';
      }
    }

    // Emit notification event
    let eventType: string;
    let eventPayload: any;

    if (reminderType === 'sla_approaching') {
      const slaDeadline = orderData.fulfillmentSlaDeadlineAt.toDate 
        ? orderData.fulfillmentSlaDeadlineAt.toDate()
        : new Date(orderData.fulfillmentSlaDeadlineAt);
      // Clamp to >= 0 to prevent negative values from causing int32 serialization errors
      const hoursRemaining = Math.max(0, Math.floor((slaDeadline.getTime() - Date.now()) / (1000 * 60 * 60)));
      // Tripwire: catch invalid int32 before serialization
      assertInt32(hoursRemaining, 'Order.SlaApproaching.hoursRemaining');
      eventType = 'Order.SlaApproaching';
      eventPayload = {
        type: 'Order.SlaApproaching',
        orderId,
        listingId: orderData.listingId,
        listingTitle,
        orderUrl,
        hoursRemaining,
        deadline: slaDeadline.toISOString(),
      };
    } else if (reminderType === 'sla_overdue') {
      const slaDeadline = orderData.fulfillmentSlaDeadlineAt.toDate 
        ? orderData.fulfillmentSlaDeadlineAt.toDate()
        : new Date(orderData.fulfillmentSlaDeadlineAt);
      // Clamp to >= 0 (should always be positive when overdue, but ensure it)
      const hoursOverdue = Math.max(0, Math.floor((Date.now() - slaDeadline.getTime()) / (1000 * 60 * 60)));
      // Tripwire: catch invalid int32 before serialization
      assertInt32(hoursOverdue, 'Order.SlaOverdue.hoursOverdue');
      eventType = 'Order.SlaOverdue';
      eventPayload = {
        type: 'Order.SlaOverdue',
        orderId,
        listingId: orderData.listingId,
        listingTitle,
        orderUrl,
        hoursOverdue,
        deadline: slaDeadline.toISOString(),
      };
    } else if (reminderType === 'receipt') {
      eventType = 'Order.DeliveryCheckIn';
      eventPayload = {
        type: 'Order.DeliveryCheckIn',
        orderId,
        listingId: orderData.listingId,
        listingTitle,
        orderUrl,
        // Clamp to >= 0 to prevent negative values from causing int32 serialization errors
        daysSinceDelivery: (() => {
          const days = orderData.deliveredAt 
            ? Math.max(0, Math.floor((Date.now() - (orderData.deliveredAt.toDate ? orderData.deliveredAt.toDate().getTime() : new Date(orderData.deliveredAt).getTime())) / (1000 * 60 * 60 * 24)))
            : 0;
          assertInt32(days, 'Order.DeliveryCheckIn.daysSinceDelivery');
          return days;
        })(),
      };
    } else {
      // Generic fulfillment reminder
      eventType = 'Order.SlaApproaching';
      eventPayload = {
        type: 'Order.SlaApproaching',
        orderId,
        listingId: orderData.listingId,
        listingTitle,
        orderUrl,
        // Clamp to >= 0 to prevent negative values
        hoursRemaining: (() => {
          const hours = orderData.fulfillmentSlaDeadlineAt 
            ? Math.max(0, Math.floor((orderData.fulfillmentSlaDeadlineAt.toDate ? orderData.fulfillmentSlaDeadlineAt.toDate().getTime() : new Date(orderData.fulfillmentSlaDeadlineAt).getTime() - Date.now()) / (1000 * 60 * 60)))
            : null;
          if (hours !== null) assertInt32(hours, 'Order.SlaApproaching.hoursRemaining');
          return hours;
        })(),
        deadline: orderData.fulfillmentSlaDeadlineAt 
          ? (orderData.fulfillmentSlaDeadlineAt.toDate ? orderData.fulfillmentSlaDeadlineAt.toDate().toISOString() : new Date(orderData.fulfillmentSlaDeadlineAt).toISOString())
          : null,
      };
    }

    // Add custom message if provided
    if (message && message.trim()) {
      eventPayload.customMessage = message.trim();
    }

    const ev = await emitAndProcessEventForUser({
      type: eventType as any,
      actorId: adminId,
      entityType: 'order',
      entityId: orderId,
      targetUserId,
      payload: eventPayload,
      optionalHash: `admin_reminder:${role}:${Date.now()}`,
    });

    if (ev?.ok && ev.created) {
      void tryDispatchEmailJobNow({ db: db as any, jobId: ev.eventId, waitForJob: true }).catch((err) => {
        captureException(err instanceof Error ? err : new Error(String(err)), {
          context: 'email-dispatch',
          eventType: 'Order.Reminder',
          jobId: ev.eventId,
          orderId,
          role: validation.data.role,
          endpoint: '/api/admin/orders/[orderId]/send-reminder',
        });
      });
    }

    // Log audit
    await createAuditLog(db, {
      actorUid: adminId,
      actorRole: 'admin',
      actionType: 'admin_reminder_sent',
      orderId: orderId,
      targetUserId: targetUserId,
      metadata: {
        role,
        reminderType,
        customMessage: message || null,
        note: `Admin reminder sent to ${role}`,
      },
      source: 'admin_ui',
    });

    return json({
      success: true,
      orderId,
      role,
      reminderType,
      message: `Reminder sent to ${role}`,
    });
  } catch (error: any) {
    console.error('Error sending reminder:', error);
    return json({ error: 'Failed to send reminder', message: error.message }, { status: 500 });
  }
}
