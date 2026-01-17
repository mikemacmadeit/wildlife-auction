import type { Order, DisputeStatus } from '@/lib/types';

export type OrderIssueState =
  | 'none'
  | 'issue_open'
  | 'awaiting_evidence'
  | 'under_review'
  | 'resolved_release'
  | 'resolved_refund';

function normalizedProtectedStatus(order: Order): DisputeStatus {
  // Repo has multiple fields for protected disputes; normalize here so UI never has to.
  return (order.disputeStatus || order.protectedDisputeStatus || 'none') as DisputeStatus;
}

/**
 * Unified dispute/issue facade.
 *
 * NON-NEGOTIABLE:
 * - Wrap existing dispute paths/fields (do not delete or rename)
 * - UI should ONLY use this function for issue messaging
 */
export function getOrderIssueState(order: Order): OrderIssueState {
  // Terminal payouts/refunds should read as resolved, even if legacy fields remain.
  if (order.status === 'refunded') return 'resolved_refund';
  if (order.status === 'completed') return 'resolved_release';

  // Standard (legacy/simple) dispute path
  if (order.status === 'disputed') return 'issue_open';

  const protectedStatus = normalizedProtectedStatus(order);

  // Protected dispute lifecycle
  if (protectedStatus === 'needs_evidence') return 'awaiting_evidence';
  if (protectedStatus === 'under_review') return 'under_review';
  if (protectedStatus === 'resolved_release') return 'resolved_release';
  if (protectedStatus === 'resolved_refund' || protectedStatus === 'resolved_partial_refund') return 'resolved_refund';
  if (protectedStatus === 'open') return 'issue_open';

  // Admin hold / chargeback safety: treat as an issue even if dispute fields are unset.
  if (order.adminHold === true) return 'under_review';

  // Payout hold reasons can represent safety blocks.
  if (order.payoutHoldReason === 'dispute_open') return 'issue_open';
  if (order.payoutHoldReason === 'admin_hold') return 'under_review';
  // Note: Phase 2D introduces payoutHoldReason='chargeback' (derived/normalized from Stripe disputes).
  if ((order.payoutHoldReason as any) === 'chargeback') return 'under_review';

  // Chargeback safety (field may be populated by Stripe webhooks)
  if (order.chargebackStatus && order.chargebackStatus !== 'won') return 'under_review';

  return 'none';
}

