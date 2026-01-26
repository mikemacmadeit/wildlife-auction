/**
 * Safe Timestamp Conversion
 * 
 * Converts various timestamp formats to Firestore Admin Timestamp,
 * ensuring nanoseconds are always in valid range [0..999,999,999].
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Convert any timestamp-like value to Firestore Admin Timestamp.
 * Sanitizes nanoseconds to prevent int32 serialization errors.
 */
export function toAdminTimestamp(value: any): Timestamp | null {
  if (!value) return null;

  // Already a Timestamp
  if (value instanceof Timestamp) {
    // Validate nanoseconds are in valid range
    const nanos = (value as any)._nanoseconds ?? (value as any).nanoseconds;
    if (typeof nanos === 'number') {
      if (nanos < 0 || nanos > 999_999_999) {
        console.error('❌ Invalid Timestamp nanoseconds:', nanos);
        // Reconstruct with sanitized nanos
        const seconds = (value as any)._seconds ?? (value as any).seconds ?? Math.floor(value.toMillis() / 1000);
        const safeNanos = Math.min(999_999_999, Math.max(0, Math.trunc(nanos)));
        return new Timestamp(Math.trunc(seconds), safeNanos);
      }
    }
    return value;
  }

  // Firestore client Timestamp (has toDate)
  if (typeof value?.toDate === 'function') {
    try {
      return Timestamp.fromDate(value.toDate());
    } catch {
      return null;
    }
  }

  // Raw object { seconds, nanoseconds } or legacy {_seconds,_nanoseconds}
  const seconds = value.seconds ?? value._seconds;
  const nanoseconds = value.nanoseconds ?? value._nanoseconds;

  if (typeof seconds === 'number' && typeof nanoseconds === 'number') {
    // HARD sanitize nanos (this is the key fix)
    const safeNanos = Math.min(999_999_999, Math.max(0, Math.trunc(nanoseconds)));
    return new Timestamp(Math.trunc(seconds), safeNanos);
  }

  // Millis number
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Timestamp.fromMillis(value);
  }

  // ISO date string
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d);
  }

  return null;
}
