/**
 * Universal Firestore Write Sanitization
 * 
 * Sanitizes all payloads before writing to Firestore to prevent int32 serialization errors.
 * This is a "nuclear" safety net that ensures corrupt values can never be written.
 * 
 * Use this wrapper around ALL Firestore write operations:
 *   await docRef.update(sanitizeFirestorePayload(payload));
 *   await docRef.set(sanitizeFirestorePayload(payload));
 *   await collection.add(sanitizeFirestorePayload(payload));
 */

import { Timestamp } from 'firebase-admin/firestore';

function isObj(v: any) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Convert any timestamp-like objects into real Timestamp safely.
function normalizeTimestampLike(v: any): Timestamp | any {
  if (!v) return v;
  if (v instanceof Timestamp) {
    // Validate existing Timestamp
    const nanos = (v as any)._nanoseconds ?? (v as any).nanoseconds;
    if (typeof nanos === 'number' && (nanos < 0 || nanos > 999_999_999)) {
      // Reconstruct with safe nanos
      const seconds = (v as any)._seconds ?? (v as any).seconds ?? Math.floor(v.toMillis() / 1000);
      const safeNanos = Math.min(999_999_999, Math.max(0, Math.trunc(nanos)));
      return new Timestamp(Math.trunc(seconds), safeNanos);
    }
    return v;
  }

  // client Timestamp has toDate()
  if (typeof v?.toDate === 'function') {
    return Timestamp.fromDate(v.toDate());
  }

  const seconds = v.seconds ?? v._seconds;
  const nanos = v.nanoseconds ?? v._nanoseconds;

  if (typeof seconds === 'number' && typeof nanos === 'number') {
    const safeSeconds = Math.trunc(seconds);
    const safeNanos = Math.min(999_999_999, Math.max(0, Math.trunc(nanos)));
    return new Timestamp(safeSeconds, safeNanos);
  }

  return v;
}

// Clamp numbers to valid int32 range
function clampToInt32(n: number): number | null {
  const MAX_INT32 = 2147483647; // 2^31 - 1
  const MIN_INT32 = -2147483648; // -2^31
  if (n > MAX_INT32 || n < MIN_INT32) {
    console.warn(`⚠️  Clamping out-of-range int32 value ${n} to null`);
    return null;
  }
  return Math.trunc(n);
}

export function sanitizeFirestorePayload(input: any): any {
  // primitives
  if (input === null || input === undefined) return input;

  // Replace known corrupt sentinel values globally
  if (input === -1 || input === 4294967295) {
    console.warn('⚠️  Sanitizing corrupt int32 sentinel value, converting to null');
    return null;
  }

  // Clamp numbers that are out of int32 range
  if (typeof input === 'number' && Number.isFinite(input)) {
    const clamped = clampToInt32(input);
    if (clamped !== input) {
      return clamped;
    }
  }

  // JavaScript Date → Firestore Timestamp (so Dates aren't mangled by object branch)
  if (typeof input === 'object' && input instanceof Date && Number.isFinite(input.getTime())) {
    return Timestamp.fromDate(input);
  }

  // Timestamp-like object
  const normalized = normalizeTimestampLike(input);
  if (normalized instanceof Timestamp) return normalized;

  // arrays
  if (Array.isArray(input)) return input.map(sanitizeFirestorePayload);

  // objects
  if (isObj(input)) {
    // Skip Firestore FieldValue types (they handle their own serialization)
    if (input.constructor?.name?.includes('FieldValue')) {
      return input;
    }

    const out: any = {};
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue; // Firestore rejects undefined; omit field
      out[k] = sanitizeFirestorePayload(v);
    }
    return out;
  }

  return input;
}
