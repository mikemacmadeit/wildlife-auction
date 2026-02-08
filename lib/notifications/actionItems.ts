/**
 * Shared logic for "action-required" notifications (To-Do list).
 * Used by: notifications page, To-Do page, and layout badge.
 */

export const ACTION_REQUIRED_TYPES = new Set([
  'bid_outbid',
  'auction_outbid',
  'offer_countered',
  'offer_accepted',
  'order_created',
  'order_delivery_address_set',
  'order_delivery_scheduled',
  'order_final_payment_due',
]);

export interface ActionItemNotification {
  id: string;
  title: string;
  body?: string;
  type?: string;
  eventType?: string;
  deepLinkUrl?: string;
  linkLabel?: string;
  read?: boolean;
  actionCompletedAt?: unknown;
  createdAt?: unknown;
  metadata?: Record<string, unknown>;
}

function toMillisSafe(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : 0;
  if (typeof (v as { toDate?: () => Date })?.toDate === 'function') {
    try {
      const d = (v as { toDate: () => Date }).toDate();
      if (d instanceof Date && Number.isFinite(d.getTime())) return d.getTime();
    } catch {
      // ignore
    }
  }
  if (typeof (v as { seconds?: number }).seconds === 'number')
    return (v as { seconds: number }).seconds * 1000;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v as string | number);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  return 0;
}

export function normalizeType(n: ActionItemNotification): string {
  const t = String(n.type ?? '').trim();
  if (t) return t.toLowerCase();
  const ev = String(n.eventType ?? '').trim();
  if (!ev) return '';
  return ev.toLowerCase().replaceAll('.', '_');
}

export function hasActionCompleted(n: ActionItemNotification): boolean {
  const v = n.actionCompletedAt;
  if (v == null) return false;
  if (typeof v === 'object' && v !== null && ('toDate' in v || 'seconds' in v)) return true;
  if (typeof v === 'string' || typeof v === 'number') return true;
  return Boolean(v);
}

export function isActionForCurrentUser(n: ActionItemNotification): boolean {
  const t = normalizeType(n);
  const ev = String(n.eventType ?? '').trim();
  const url = String(n.deepLinkUrl ?? '');
  if (t === 'order_created' && ev === 'Order.Received') return url.includes('/seller/');
  if (t === 'order_delivery_address_set') return url.includes('/seller/');
  return true;
}

/** Filter notifications to action-required, not resolved, for current user. Sorted by createdAt desc, capped. */
export function filterActionItems(
  items: ActionItemNotification[],
  limit = 50
): ActionItemNotification[] {
  return items
    .filter((n) => {
      if (!ACTION_REQUIRED_TYPES.has(normalizeType(n))) return false;
      if (hasActionCompleted(n)) return false;
      if (!isActionForCurrentUser(n)) return false;
      return true;
    })
    .sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt))
    .slice(0, limit);
}
