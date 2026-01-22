import type { Listing, ListingDurationDays, ListingEndedReason, ListingStatus } from '@/lib/types';

export const ALLOWED_DURATION_DAYS: readonly ListingDurationDays[] = [1, 3, 5, 7, 10] as const;

export function isValidDurationDays(x: unknown): x is ListingDurationDays {
  return x === 1 || x === 3 || x === 5 || x === 7 || x === 10;
}

export function coerceDurationDays(x: unknown, fallback: ListingDurationDays = 7): ListingDurationDays {
  const n = typeof x === 'number' ? x : Number(x);
  return isValidDurationDays(n) ? n : fallback;
}

export function computeEndAt(startAtMs: number, durationDays: ListingDurationDays): number {
  return startAtMs + durationDays * 24 * 60 * 60 * 1000;
}

export function isExpired(endAtMs: number, nowMs: number = Date.now()): boolean {
  return endAtMs <= nowMs;
}

export function toMillisSafe(v: any): number | null {
  if (!v) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v?.toMillis === 'function') {
    try {
      const t = v.toMillis();
      return typeof t === 'number' && Number.isFinite(t) ? t : null;
    } catch {
      return null;
    }
  }
  if (typeof v?.toDate === 'function') {
    try {
      const d = v.toDate();
      const t = d instanceof Date ? d.getTime() : NaN;
      return Number.isFinite(t) ? t : null;
    } catch {
      return null;
    }
  }
  if (typeof v?.seconds === 'number') {
    const t = v.seconds * 1000;
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const d = new Date(v);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/**
 * Read-time guard + safe legacy migration-in-memory.
 *
 * - Ensures durationDays is always one of allowed choices (defaults to 7)
 * - Computes a virtual endAt for legacy active listings missing endAt/endsAt
 * - If status is active but endAt has passed, returns a *virtual* ended listing
 *   (does NOT write to Firestore).
 */
export function normalizeListingForUI<T extends Listing>(listing: T, nowMs: number = Date.now()): T {
  // If the listing is already in a terminal persisted state, keep it.
  // (We still may compute endAt for display purposes, but do not flip status.)
  const persistedStatus = listing.status as ListingStatus;
  const terminal = persistedStatus === 'sold' || persistedStatus === 'ended' || persistedStatus === 'expired' || persistedStatus === 'removed';

  const durationDays = coerceDurationDays((listing as any).durationDays, 7);
  const startAtMs =
    toMillisSafe((listing as any).startAt) ??
    toMillisSafe((listing as any).publishedAt) ??
    toMillisSafe((listing as any).createdAt) ??
    null;

  const endAtMsExisting =
    toMillisSafe((listing as any).endAt) ??
    // Back-compat: auctions have endsAt
    toMillisSafe((listing as any).endsAt) ??
    null;

  const endAtMs = endAtMsExisting ?? (startAtMs ? computeEndAt(startAtMs, durationDays) : null);

  // Build the normalized result (shallow copy only if we need to change something).
  let changed = false;
  const out: any = { ...listing };

  if (!isValidDurationDays((listing as any).durationDays)) {
    out.durationDays = durationDays;
    changed = true;
  }
  if (!out.endAt && endAtMs) {
    out.endAt = new Date(endAtMs);
    changed = true;
  }

  // If we computed endAt from endsAt, also surface it for non-auction UIs (safe).
  if (out.type === 'auction' && !out.endsAt && endAtMs) {
    out.endsAt = new Date(endAtMs);
    changed = true;
  }

  // Virtual expiration: if active + endAt passed, treat as ended in UI.
  if (!terminal && out.status === 'active' && endAtMs && isExpired(endAtMs, nowMs)) {
    out.status = 'ended' as ListingStatus;
    out.endedReason = (out.endedReason || 'expired') as ListingEndedReason;
    out.endedAt = out.endedAt || new Date(endAtMs);
    changed = true;
  }

  return (changed ? out : listing) as T;
}

