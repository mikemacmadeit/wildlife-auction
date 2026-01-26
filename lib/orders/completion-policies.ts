/**
 * Completion Policies
 * 
 * Defines rules for automatic completion and escalation of stalled orders.
 * All policies are configurable via environment variables with sensible defaults.
 */

import type { Order } from '@/lib/types';
import { getEffectiveTransactionStatus } from './status';

/**
 * Policy: Auto-complete delivered orders after X days if no dispute
 * Default: 7 days
 */
export const AUTO_COMPLETE_DELIVERED_DAYS = parseInt(
  process.env.AUTO_COMPLETE_DELIVERED_DAYS || '7',
  10
);

/**
 * Policy: Escalate to admin review after Y days if buyer/seller unresponsive
 * Default: 14 days
 */
export const ESCALATE_TO_ADMIN_DAYS = parseInt(
  process.env.ESCALATE_TO_ADMIN_DAYS || '14',
  10
);

/**
 * Policy: Reminder cadence for FULFILLMENT_REQUIRED (hours)
 * Default: [24, 72, SLA-24h]
 */
export const FULFILLMENT_REMINDER_HOURS = (() => {
  const env = process.env.FULFILLMENT_REMINDER_HOURS;
  if (env) {
    // Clamp all values to >= 0 to prevent negative values
    return env.split(',').map(h => Math.max(0, parseInt(h.trim(), 10))).filter(h => !isNaN(h) && h >= 0);
  }
  return [24, 72]; // Will be supplemented with SLA-24h dynamically
})();

/**
 * Policy: Reminder cadence for DELIVERED_PENDING_CONFIRMATION (hours)
 * Default: [24, 72, 168] (1 day, 3 days, 7 days)
 */
export const RECEIPT_REMINDER_HOURS = (() => {
  const env = process.env.RECEIPT_REMINDER_HOURS;
  if (env) {
    // Clamp all values to >= 0 to prevent negative values
    return env.split(',').map(h => Math.max(0, parseInt(h.trim(), 10))).filter(h => !isNaN(h) && h >= 0);
  }
  return [24, 72, 168];
})();

/**
 * Policy: Reminder cadence for READY_FOR_PICKUP / PICKUP_SCHEDULED (hours)
 * Default: [24, 72]
 */
export const PICKUP_REMINDER_HOURS = (() => {
  const env = process.env.PICKUP_REMINDER_HOURS;
  if (env) {
    // Clamp all values to >= 0 to prevent negative values
    return env.split(',').map(h => Math.max(0, parseInt(h.trim(), 10))).filter(h => !isNaN(h) && h >= 0);
  }
  return [24, 72];
})();

/**
 * Policy: Compliance reminder cadence (hours after payment)
 * Default: [24, 72, 168] (1 day, 3 days, 7 days)
 */
export const COMPLIANCE_REMINDER_HOURS = (() => {
  const env = process.env.COMPLIANCE_REMINDER_HOURS;
  if (env) {
    // Clamp all values to >= 0 to prevent negative values
    return env.split(',').map(h => Math.max(0, parseInt(h.trim(), 10))).filter(h => !isNaN(h) && h >= 0);
  }
  return [24, 72, 168]; // 24h, 72h, 7 days
})();

/**
 * Policy: Compliance escalation threshold (days after payment)
 * Default: 7 days
 */
export const COMPLIANCE_ESCALATION_DAYS = Math.max(0, parseInt(
  process.env.COMPLIANCE_ESCALATION_DAYS || '7',
  10
));

/**
 * Policy: SLA warning threshold (hours before deadline)
 * Default: 24 hours
 */
export const SLA_WARNING_HOURS = Math.max(0, parseInt(
  process.env.SLA_WARNING_HOURS || '24',
  10
));

/**
 * Check if an order should be auto-completed
 */
export function shouldAutoComplete(order: Order): boolean {
  const txStatus = getEffectiveTransactionStatus(order);
  
  // Only auto-complete delivered orders that are pending confirmation
  if (txStatus !== 'DELIVERED_PENDING_CONFIRMATION') {
    return false;
  }

  // Don't auto-complete if there's an open dispute
  if (order.disputeStatus && order.disputeStatus !== 'none' && order.disputeStatus !== 'cancelled') {
    return false;
  }

  // Don't auto-complete if admin hold is active
  if (order.adminHold === true) {
    return false;
  }

  // Check if enough time has passed
  if (!order.deliveredAt) {
    return false;
  }

  const deliveredAt = order.deliveredAt instanceof Date 
    ? order.deliveredAt 
    : (order.deliveredAt as any)?.toDate 
      ? (order.deliveredAt as any).toDate() 
      : new Date(order.deliveredAt);
  
  // Clamp to >= 0 to prevent negative values
  const daysSinceDelivery = Math.max(0, (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24));
  
  return daysSinceDelivery >= AUTO_COMPLETE_DELIVERED_DAYS;
}

/**
 * Check if an order should be escalated to admin review
 */
export function shouldEscalateToAdmin(order: Order): boolean {
  const txStatus = getEffectiveTransactionStatus(order);
  
  // Only escalate active fulfillment states
  const activeStates: string[] = [
    'FULFILLMENT_REQUIRED',
    'DELIVERY_SCHEDULED',
    'DELIVERED_PENDING_CONFIRMATION',
    'READY_FOR_PICKUP',
    'PICKUP_SCHEDULED',
  ];
  
  if (!activeStates.includes(txStatus)) {
    return false;
  }

  // Don't escalate if already disputed or on admin hold
  if (order.disputeStatus && order.disputeStatus !== 'none' && order.disputeStatus !== 'cancelled') {
    return false;
  }
  if (order.adminHold === true) {
    return false;
  }

  // Check if enough time has passed since payment
  if (!order.paidAt) {
    return false;
  }

  const paidAt = order.paidAt instanceof Date 
    ? order.paidAt 
    : (order.paidAt as any)?.toDate 
      ? (order.paidAt as any).toDate() 
      : new Date(order.paidAt);
  
  // Clamp to >= 0 to prevent negative values
  const daysSincePayment = Math.max(0, (Date.now() - paidAt.getTime()) / (1000 * 60 * 60 * 24));
  
  return daysSincePayment >= ESCALATE_TO_ADMIN_DAYS;
}

/**
 * Get reminder schedule for an order based on its status
 */
export function getReminderSchedule(order: Order): number[] {
  const txStatus = getEffectiveTransactionStatus(order);
  const now = Date.now();
  
  // Calculate base reminders from paidAt
  if (!order.paidAt) {
    return [];
  }

  const paidAt = order.paidAt instanceof Date 
    ? order.paidAt 
    : (order.paidAt as any)?.toDate 
      ? (order.paidAt as any).toDate() 
      : new Date(order.paidAt);
  
  const paidAtMs = paidAt.getTime();
  
  // Base reminders (hours after payment)
  let reminders: number[] = [];
  
  if (txStatus === 'FULFILLMENT_REQUIRED') {
    reminders = FULFILLMENT_REMINDER_HOURS.map(h => paidAtMs + h * 60 * 60 * 1000);
    
    // Add SLA-24h reminder if SLA exists
    if (order.fulfillmentSlaDeadlineAt) {
      const slaDeadline = order.fulfillmentSlaDeadlineAt instanceof Date
        ? order.fulfillmentSlaDeadlineAt
        : (order.fulfillmentSlaDeadlineAt as any)?.toDate
          ? (order.fulfillmentSlaDeadlineAt as any).toDate()
          : new Date(order.fulfillmentSlaDeadlineAt);
      // Clamp SLA_WARNING_HOURS to >= 0 to prevent negative calculations
      const safeWarningHours = Math.max(0, SLA_WARNING_HOURS);
      const slaWarning = slaDeadline.getTime() - safeWarningHours * 60 * 60 * 1000;
      if (slaWarning > now) {
        reminders.push(slaWarning);
      }
    }
  } else if (txStatus === 'DELIVERED_PENDING_CONFIRMATION') {
    if (!order.deliveredAt) {
      return [];
    }
    const deliveredAt = order.deliveredAt instanceof Date
      ? order.deliveredAt
      : (order.deliveredAt as any)?.toDate
        ? (order.deliveredAt as any).toDate()
        : new Date(order.deliveredAt);
    const deliveredAtMs = deliveredAt.getTime();
    // Ensure all reminder hours are >= 0
    const safeReminderHours = RECEIPT_REMINDER_HOURS.map(h => Math.max(0, h));
    reminders = safeReminderHours.map(h => deliveredAtMs + h * 60 * 60 * 1000);
  } else if (txStatus === 'READY_FOR_PICKUP' || txStatus === 'PICKUP_SCHEDULED') {
    // Ensure all reminder hours are >= 0
    const safeReminderHours = PICKUP_REMINDER_HOURS.map(h => Math.max(0, h));
    reminders = safeReminderHours.map(h => paidAtMs + h * 60 * 60 * 1000);
  }
  
  // Filter to future reminders only
  return reminders.filter(ms => ms > now).sort((a, b) => a - b);
}
