/**
 * Order Reminder Engine
 * 
 * Computes reminder plans and determines when reminders should be sent
 * to prevent orders from stalling.
 */

import type { Order } from '@/lib/types';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { getNextRequiredAction } from '@/lib/orders/progress';

export type ReminderWindow = '24h' | '72h' | '7d';
export type ReminderTemplate = 'gentle' | 'firm' | 'final';

export interface ReminderPlan {
  buyer: {
    shouldSend: boolean;
    window: ReminderWindow | null;
    template: ReminderTemplate | null;
    lastSentAt?: Date;
    count?: number;
  };
  seller: {
    shouldSend: boolean;
    window: ReminderWindow | null;
    template: ReminderTemplate | null;
    lastSentAt?: Date;
    count?: number;
  };
}

/**
 * Compute reminder plan for an order
 */
export function computeReminderPlan(order: Order): ReminderPlan {
  const txStatus = getEffectiveTransactionStatus(order);
  const now = Date.now();
  
  // Terminal states don't need reminders
  if (['COMPLETED', 'REFUNDED', 'CANCELLED'].includes(txStatus)) {
    return {
      buyer: { shouldSend: false, window: null, template: null },
      seller: { shouldSend: false, window: null, template: null },
    };
  }

  // Get last status change time (fallback to updatedAt or createdAt)
  const lastStatusChange = order.lastStatusChangedAt?.getTime() 
    || order.updatedAt?.getTime() 
    || order.createdAt?.getTime() 
    || now;
  
  const hoursSinceStatusChange = (now - lastStatusChange) / (1000 * 60 * 60);
  const daysSinceStatusChange = hoursSinceStatusChange / 24;

  // Get reminder metadata
  const reminders = order.reminders || {};
  const buyerLastAt = reminders.buyerLastAt?.getTime();
  const sellerLastAt = reminders.sellerLastAt?.getTime();
  const buyerCount = reminders.buyerCount || 0;
  const sellerCount = reminders.sellerCount || 0;

  // Determine who needs action
  const buyerAction = getNextRequiredAction(order, 'buyer');
  const sellerAction = getNextRequiredAction(order, 'seller');

  const buyerNeedsAction = buyerAction && buyerAction.ownerRole === 'buyer';
  const sellerNeedsAction = sellerAction && sellerAction.ownerRole === 'seller';

  // Compute reminder windows
  const computeReminder = (
    needsAction: boolean,
    lastSentAt: number | undefined,
    count: number,
    hoursSinceChange: number
  ): { shouldSend: boolean; window: ReminderWindow | null; template: ReminderTemplate | null } => {
    if (!needsAction) {
      return { shouldSend: false, window: null, template: null };
    }

    // Determine which window we're in
    let window: ReminderWindow | null = null;
    let template: ReminderTemplate = 'gentle';

    if (hoursSinceChange >= 168) { // 7 days
      window = '7d';
      template = 'final';
    } else if (hoursSinceChange >= 72) { // 72 hours
      window = '72h';
      template = 'firm';
    } else if (hoursSinceChange >= 24) { // 24 hours
      window = '24h';
      template = 'gentle';
    }

    if (!window) {
      return { shouldSend: false, window: null, template: null };
    }

    // Check if we've already sent a reminder for this window
    const hoursSinceLastReminder = lastSentAt ? (now - lastSentAt) / (1000 * 60 * 60) : Infinity;
    
    // Don't spam: only send once per window
    const windowHours = window === '24h' ? 24 : window === '72h' ? 72 : 168;
    const shouldSend = hoursSinceLastReminder >= windowHours || !lastSentAt;

    return { shouldSend, window, template };
  };

  return {
    buyer: {
      ...computeReminder(buyerNeedsAction, buyerLastAt, buyerCount, hoursSinceStatusChange),
      lastSentAt: buyerLastAt ? new Date(buyerLastAt) : undefined,
      count: buyerCount,
    },
    seller: {
      ...computeReminder(sellerNeedsAction, sellerLastAt, sellerCount, hoursSinceStatusChange),
      lastSentAt: sellerLastAt ? new Date(sellerLastAt) : undefined,
      count: sellerCount,
    },
  };
}

/**
 * Check if a reminder should be sent for a specific role and window
 */
export function shouldSendReminder(
  order: Order,
  role: 'buyer' | 'seller',
  window: ReminderWindow
): boolean {
  const plan = computeReminderPlan(order);
  const rolePlan = plan[role];
  return rolePlan.shouldSend && rolePlan.window === window;
}

/**
 * Get reminder template type for a role and window
 */
export function getReminderTemplate(
  order: Order,
  role: 'buyer' | 'seller',
  window: ReminderWindow
): ReminderTemplate {
  const plan = computeReminderPlan(order);
  return plan[role].template || 'gentle';
}
