/**
 * Shared formatting for offer detail pages and modals.
 */

export function formatOfferHistoryLabel(h: { type?: string; actorRole?: string }): string {
  const type = (h.type || '').toLowerCase();
  const role = (h.actorRole || '').toLowerCase();
  if (type === 'offer' && (role === 'buyer' || role === 'seller')) return role === 'buyer' ? 'Initial offer' : 'Offer';
  if (type === 'counter' || type === 'countered') return role ? `Counter offer (${role})` : 'Counter offer';
  if (type === 'accept' || type === 'accepted') return 'Accepted';
  if (type === 'decline' || type === 'declined') return 'Declined';
  if (type === 'expire' || type === 'expired') return role ? `Expired (${role})` : 'Expired';
  if (type === 'withdraw' || type === 'withdrawn') return 'Withdrawn';
  if (type) return `${type.charAt(0).toUpperCase() + type.slice(1)}${role ? ` (${role})` : ''}`;
  return 'Update';
}

export function offerStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const s = (status || '').toLowerCase();
  if (s === 'accepted') return 'default';
  if (s === 'expired' || s === 'declined') return 'secondary';
  if (s === 'open' || s === 'countered') return 'outline';
  return 'secondary';
}
