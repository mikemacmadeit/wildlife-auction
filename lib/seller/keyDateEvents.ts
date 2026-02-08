/**
 * Key dates calendar: event types, grid builder, and event list from seller data.
 * Used by: seller overview, seller To-Do page.
 */

export type KeyDateEventType =
  | 'auction_ends'
  | 'offer_expires'
  | 'fulfillment_sla'
  | 'delivery_scheduled'
  | 'needs_action'
  | 'dispute_window_closes'
  | 'protection_ends'
  | 'payout_expected';

export type KeyDateEventStatus = 'pending' | 'needs_action' | 'overdue' | 'completed';

export interface KeyDateEvent {
  id: string;
  type: KeyDateEventType;
  date: Date;
  dateKey: string;
  label: string;
  subtitle?: string;
  href: string;
  sortMs: number;
  category: 'selling' | 'actions';
  status: KeyDateEventStatus;
}

export const KEY_DATE_WINDOW_DAYS = 14;
export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      if (d instanceof Date) return d;
    } catch {
      // ignore
    }
  }
  if (typeof (value as { seconds?: number }).seconds === 'number') {
    const ms = (value as { seconds: number }).seconds * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value as string | number);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

export type CalendarCell =
  | { empty: true }
  | { empty?: false; day: number; dateKey: string; isToday: boolean; events: KeyDateEvent[] };

export function getCalendarGrid(
  month: Date,
  eventsForMonth: KeyDateEvent[]
): CalendarCell[] {
  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const first = new Date(year, monthIdx, 1);
  const last = new Date(year, monthIdx + 1, 0);
  const firstWeekday = first.getDay();
  const daysInMonth = last.getDate();
  const todayKey = toDateKey(new Date());

  const eventsByDateKey = new Map<string, KeyDateEvent[]>();
  eventsForMonth.forEach((e) => {
    const list = eventsByDateKey.get(e.dateKey) ?? [];
    list.push(e);
    eventsByDateKey.set(e.dateKey, list);
  });

  const cells: CalendarCell[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ empty: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      day: d,
      dateKey,
      isToday: dateKey === todayKey,
      events: eventsByDateKey.get(dateKey) ?? [],
    });
  }
  return cells;
}

export interface BuildKeyDateEventsInput {
  listings: Array<{ id: string; type?: string; title?: string; endsAt?: unknown }>;
  orders: Array<{
    id: string;
    listingSnapshot?: { title?: string };
    listingTitle?: string;
    fulfillmentSlaDeadlineAt?: unknown;
    delivery?: { eta?: unknown; agreedWindow?: { start?: unknown } };
    disputeDeadlineAt?: unknown;
    protectionEndsAt?: unknown;
    deliveredAt?: unknown;
    deliveryConfirmedAt?: unknown;
    status?: string;
    adminHold?: boolean;
    disputeStatus?: string;
    complianceDocsStatus?: { missing?: unknown[] };
  }>;
  offers?: Array<{ id: string; listingId: string; listingTitle?: string; status: string; expiresAt?: string | null }>;
  nextPayoutArrivalDate?: string | null;
}

export function buildKeyDateEvents(input: BuildKeyDateEventsInput): KeyDateEvent[] {
  const { listings, orders, offers = [], nextPayoutArrivalDate } = input;
  const now = Date.now();
  const startMs = now - 7 * 24 * 60 * 60 * 1000;
  const endMs = now + KEY_DATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const events: KeyDateEvent[] = [];

  const isDelivered = (o: (typeof orders)[0]) =>
    !!(o.deliveredAt || (o as { deliveryConfirmedAt?: unknown }).deliveryConfirmedAt);

  listings.forEach((listing) => {
    if (listing.type !== 'auction') return;
    const endsAt = toDateSafe(listing.endsAt);
    if (!endsAt) return;
    const ms = endsAt.getTime();
    if (ms < startMs || ms > endMs) return;
    const status: KeyDateEventStatus = ms < now ? 'completed' : 'pending';
    events.push({
      id: `auction-${listing.id}`,
      type: 'auction_ends',
      date: endsAt,
      dateKey: toDateKey(endsAt),
      label: status === 'completed' ? 'Auction ended' : 'Auction ends',
      subtitle: listing.title,
      href: `/listing/${listing.id}`,
      sortMs: ms,
      category: 'selling',
      status,
    });
  });

  orders.forEach((order) => {
    const listingTitle = order.listingSnapshot?.title || order.listingTitle || 'Order';
    const orderHref = `/seller/orders/${order.id}`;
    const delivered = isDelivered(order);

    const sla = toDateSafe(order.fulfillmentSlaDeadlineAt);
    if (sla) {
      const ms = sla.getTime();
      if (ms >= startMs && ms <= endMs) {
        const status: KeyDateEventStatus = delivered ? 'completed' : ms < now ? 'overdue' : 'needs_action';
        events.push({
          id: `sla-${order.id}`,
          type: 'fulfillment_sla',
          date: sla,
          dateKey: toDateKey(sla),
          label:
            status === 'completed'
              ? 'Delivery updated'
              : status === 'overdue'
                ? 'Update delivery (overdue)'
                : 'Update delivery by',
          subtitle: listingTitle,
          href: orderHref,
          sortMs: ms,
          category: 'actions',
          status,
        });
      }
    }

    const eta = order.delivery?.eta
      ? toDateSafe(order.delivery.eta)
      : order.delivery?.agreedWindow?.start
        ? toDateSafe(order.delivery.agreedWindow.start)
        : null;
    if (eta) {
      const ms = eta.getTime();
      if (ms >= startMs && ms <= endMs) {
        const status: KeyDateEventStatus = delivered ? 'completed' : 'pending';
        events.push({
          id: `delivery-${order.id}`,
          type: 'delivery_scheduled',
          date: eta,
          dateKey: toDateKey(eta),
          label: status === 'completed' ? 'Delivered' : 'Delivery scheduled',
          subtitle: listingTitle,
          href: orderHref,
          sortMs: ms,
          category: 'selling',
          status,
        });
      }
    }

    const disputeDeadline = toDateSafe(order.disputeDeadlineAt);
    if (disputeDeadline) {
      const ms = disputeDeadline.getTime();
      if (ms >= startMs && ms <= endMs) {
        const status: KeyDateEventStatus = ms < now ? 'completed' : 'pending';
        events.push({
          id: `dispute-${order.id}`,
          type: 'dispute_window_closes',
          date: disputeDeadline,
          dateKey: toDateKey(disputeDeadline),
          label: status === 'completed' ? 'Dispute window closed' : 'Dispute window closes',
          subtitle: listingTitle,
          href: orderHref,
          sortMs: ms,
          category: 'selling',
          status,
        });
      }
    }

    const protectionEnds = toDateSafe(order.protectionEndsAt);
    if (protectionEnds) {
      const ms = protectionEnds.getTime();
      if (ms >= startMs && ms <= endMs) {
        const status: KeyDateEventStatus = ms < now ? 'completed' : 'pending';
        events.push({
          id: `protection-${order.id}`,
          type: 'protection_ends',
          date: protectionEnds,
          dateKey: toDateKey(protectionEnds),
          label: status === 'completed' ? 'Payout released' : 'Payout releases (if no dispute)',
          subtitle: listingTitle,
          href: orderHref,
          sortMs: ms,
          category: 'selling',
          status,
        });
      }
    }
  });

  const ordersNeedingAction = orders.filter((o) => {
    const paidish = ['paid', 'paid_held', 'in_transit'].includes(String(o.status || ''));
    const hasDelivered = isDelivered(o);
    const missingDocs =
      o.complianceDocsStatus && Array.isArray(o.complianceDocsStatus.missing)
        ? o.complianceDocsStatus.missing
        : [];
    const hasIssue =
      o.adminHold === true ||
      ['open', 'needs_evidence', 'under_review'].includes(String(o?.disputeStatus || '')) ||
      (o as { status?: string }).status === 'disputed';
    return (paidish && !hasDelivered) || missingDocs.length > 0 || hasIssue;
  });
  if (ordersNeedingAction.length > 0) {
    events.push({
      id: 'needs-action-today',
      type: 'needs_action',
      date: new Date(),
      dateKey: toDateKey(new Date()),
      label: 'Needs action',
      subtitle: `${ordersNeedingAction.length} sale${ordersNeedingAction.length !== 1 ? 's' : ''} need your attention`,
      href: '/seller/sales',
      sortMs: now,
      category: 'actions',
      status: 'needs_action',
    });
  }

  offers.forEach((offer) => {
    if (!['open', 'countered'].includes(offer.status || '')) return;
    const exp = offer.expiresAt ? new Date(offer.expiresAt) : null;
    if (!exp || Number.isNaN(exp.getTime())) return;
    const ms = exp.getTime();
    if (ms < startMs || ms > endMs) return;
    const status: KeyDateEventStatus = ms < now ? 'completed' : 'pending';
    events.push({
      id: `offer-${offer.id}`,
      type: 'offer_expires',
      date: exp,
      dateKey: toDateKey(exp),
      label: status === 'completed' ? 'Offer expired' : 'Offer expires',
      subtitle: offer.listingTitle,
      href: `/seller/offers/${offer.id}`,
      sortMs: ms,
      category: 'selling',
      status,
    });
  });

  if (nextPayoutArrivalDate) {
    const payoutDate = new Date(nextPayoutArrivalDate);
    const ms = payoutDate.getTime();
    if (ms >= startMs && ms <= endMs) {
      events.push({
        id: 'payout-next',
        type: 'payout_expected',
        date: payoutDate,
        dateKey: toDateKey(payoutDate),
        label: 'Payout',
        subtitle: 'Money hits your bank',
        href: '/seller/payouts',
        sortMs: ms,
        category: 'selling',
        status: 'pending',
      });
    }
  }

  events.sort((a, b) => a.sortMs - b.sortMs);
  return events;
}
