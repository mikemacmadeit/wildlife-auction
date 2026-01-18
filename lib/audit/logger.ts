/**
 * Audit Logging System
 * 
 * Logs all critical actions for operational visibility and accountability
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export type AuditActionType =
  | 'payout_released_manual'
  | 'payout_released_auto'
  | 'refund_full'
  | 'refund_partial'
  | 'order_refunded_tx_violation'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'dispute_cancelled'
  | 'admin_hold_placed'
  | 'admin_hold_removed'
  | 'chargeback_created'
  | 'chargeback_updated'
  | 'chargeback_closed'
  | 'chargeback_funds_withdrawn'
  | 'chargeback_funds_reinstated'
  | 'auto_release_executed'
  | 'delivery_confirmed'
  | 'order_marked_paid_admin'
  | 'order_created'
  | 'order_status_changed'
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_canceled'
  | 'subscription_payment_failed'
  | 'billing_portal_accessed'
  | 'admin_plan_override'
  | 'bid_placed'
  // Best Offer lifecycle
  | 'offer_created'
  | 'offer_countered'
  | 'offer_accepted'
  | 'offer_declined'
  | 'offer_withdrawn'
  | 'offer_expired'
  | 'offer_checkout_session_created'
  // Wire / bank transfer rails
  | 'wire_payment_intent_created'
  // Admin: user management (P0)
  | 'admin_user_role_changed'
  | 'admin_user_disabled'
  | 'admin_user_enabled'
  | 'admin_user_password_reset_link_created'
  | 'admin_user_force_logout'
  | 'admin_user_suspended'
  | 'admin_user_unsuspended'
  | 'admin_user_banned'
  | 'admin_user_unbanned'
  | 'admin_user_selling_disabled'
  | 'admin_user_selling_enabled'
  | 'admin_user_messaging_muted'
  | 'admin_user_messaging_unmuted'
  | 'admin_user_risk_updated'
  | 'admin_user_note_added'
  | 'admin_user_summaries_backfill';

export type AuditActorRole = 'admin' | 'system' | 'webhook' | 'buyer' | 'seller';

export type AuditSource = 'admin_ui' | 'cron' | 'webhook' | 'api' | 'buyer_ui' | 'seller_ui';

export interface AuditLog {
  auditId: string;
  actorUid: string | 'system' | 'webhook';
  actorRole: AuditActorRole;
  actionType: AuditActionType;
  targetUserId?: string; // For user management actions
  orderId?: string;
  listingId?: string;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  metadata?: Record<string, any>; // Additional context (reason, notes, etc.)
  source: AuditSource;
  createdAt: Timestamp;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(
  db: ReturnType<typeof getFirestore>,
  params: {
    actorUid: string | 'system' | 'webhook';
    actorRole: AuditActorRole;
    actionType: AuditActionType;
    targetUserId?: string;
    orderId?: string;
    listingId?: string;
    beforeState?: Record<string, any>;
    afterState?: Record<string, any>;
    metadata?: Record<string, any>;
    source: AuditSource;
  }
): Promise<string> {
  const auditRef = db.collection('auditLogs').doc();
  const auditId = auditRef.id;

  // Firestore Admin SDK rejects `undefined` values. Only include optional fields when present.
  const auditLog: AuditLog = {
    auditId,
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    actionType: params.actionType,
    source: params.source,
    createdAt: Timestamp.now(),
    ...(params.targetUserId ? { targetUserId: params.targetUserId } : {}),
    ...(params.orderId ? { orderId: params.orderId } : {}),
    ...(params.listingId ? { listingId: params.listingId } : {}),
    ...(params.beforeState ? { beforeState: params.beforeState } : {}),
    ...(params.afterState ? { afterState: params.afterState } : {}),
    ...(params.metadata ? { metadata: params.metadata } : {}),
  };

  await auditRef.set(auditLog);
  console.log(`[AUDIT] Created audit log ${auditId} for action ${params.actionType} on order ${params.orderId || 'N/A'}`);

  return auditId;
}

/**
 * Get audit logs for an order
 */
export async function getAuditLogsForOrder(
  db: ReturnType<typeof getFirestore>,
  orderId: string,
  limit: number = 50
): Promise<AuditLog[]> {
  const logsSnapshot = await db.collection('auditLogs')
    .where('orderId', '==', orderId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return logsSnapshot.docs.map(doc => doc.data() as AuditLog);
}

/**
 * Get audit logs for a listing
 */
export async function getAuditLogsForListing(
  db: ReturnType<typeof getFirestore>,
  listingId: string,
  limit: number = 50
): Promise<AuditLog[]> {
  const logsSnapshot = await db.collection('auditLogs')
    .where('listingId', '==', listingId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return logsSnapshot.docs.map(doc => doc.data() as AuditLog);
}

/**
 * Get audit logs by actor
 */
export async function getAuditLogsByActor(
  db: ReturnType<typeof getFirestore>,
  actorUid: string,
  limit: number = 100
): Promise<AuditLog[]> {
  const logsSnapshot = await db.collection('auditLogs')
    .where('actorUid', '==', actorUid)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return logsSnapshot.docs.map(doc => doc.data() as AuditLog);
}
