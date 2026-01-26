/**
 * Normalize Firestore Data on READ
 * 
 * This is CRITICAL: Even if we sanitize on write, existing Firestore documents
 * may contain corrupt timestamp-like objects with nanoseconds: -1.
 * When these are read and re-serialized (e.g., in API responses), they crash.
 * 
 * This function normalizes data IMMEDIATELY after reading from Firestore,
 * ensuring no invalid int32 values ever reach serialization.
 * 
 * Works with both firebase-admin and firebase/firestore Timestamps.
 */

// Works with both firebase-admin Timestamp and firebase/firestore Timestamp
type AnyTimestamp = { 
  seconds?: number; 
  nanoseconds?: number; 
  _seconds?: number; 
  _nanoseconds?: number; 
  toDate?: () => Date;
  toMillis?: () => number;
};

function isObject(v: any): boolean {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function isTimestampLike(v: any): v is AnyTimestamp {
  if (!isObject(v)) return false;
  const s = (v.seconds ?? v._seconds);
  const ns = (v.nanoseconds ?? v._nanoseconds);
  return typeof s === 'number' && typeof ns === 'number';
}

/**
 * Normalize Firestore data so no invalid int32 values ever survive.
 * - Converts timestamp-like objects into safe plain objects {seconds, nanoseconds}
 *   with nanoseconds clamped to [0..999,999,999]
 * - Replaces -1 / 4294967295 with null
 * - Recursively processes nested objects and arrays
 */
export function normalizeFirestoreValue(input: any): any {
  // Replace corrupt sentinel values immediately
  if (input === -1 || input === 4294967295) {
    console.warn('⚠️  Normalizing corrupt int32 sentinel value to null');
    return null;
  }

  if (input === null || input === undefined) return input;

  // Arrays - recurse
  if (Array.isArray(input)) {
    return input.map(normalizeFirestoreValue);
  }

  // Primitives - pass through
  if (!isObject(input)) return input;

  // Handle timestamp-like objects (including legacy _seconds/_nanoseconds)
  if (isTimestampLike(input)) {
    const seconds = Math.trunc((input.seconds ?? input._seconds) as number);
    const rawNanos = Math.trunc((input.nanoseconds ?? input._nanoseconds) as number);

    // This is the critical clamp that prevents the protobuf int32 crash.
    const nanoseconds = Math.min(999_999_999, Math.max(0, rawNanos));

    // If nanos were corrupted, log it
    if (rawNanos < 0 || rawNanos > 999_999_999) {
      console.warn(`⚠️  Normalizing corrupt timestamp nanoseconds: ${rawNanos} → ${nanoseconds}`);
    }

    return { seconds, nanoseconds };
  }

  // Handle Firestore Timestamp instances (client SDK) - convert to safe object
  if (typeof (input as any).toDate === 'function') {
    try {
      const d = (input as any).toDate();
      const ms = d?.getTime?.();
      if (typeof ms === 'number' && Number.isFinite(ms)) {
        // Convert to safe {seconds, nanoseconds} format
        const seconds = Math.floor(ms / 1000);
        const nanoseconds = Math.floor((ms % 1000) * 1_000_000);
        return { seconds, nanoseconds };
      }
    } catch {
      // If toDate() fails, fall through to object normalization
    }
  }

  // Handle Firestore Timestamp instances (admin SDK) - check for corrupt nanos
  if (input.constructor?.name === 'Timestamp' || (input._seconds !== undefined && input._nanoseconds !== undefined)) {
    const seconds = input._seconds ?? input.seconds ?? 0;
    const rawNanos = input._nanoseconds ?? input.nanoseconds ?? 0;
    const nanoseconds = Math.min(999_999_999, Math.max(0, Math.trunc(rawNanos)));
    
    if (rawNanos < 0 || rawNanos > 999_999_999) {
      console.warn(`⚠️  Normalizing corrupt Timestamp nanoseconds: ${rawNanos} → ${nanoseconds}`);
    }
    
    return { seconds, nanoseconds };
  }

  // Regular objects - recurse
  const out: any = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = normalizeFirestoreValue(v);
  }
  return out;
}

/**
 * Guard function to detect any remaining corrupt values after normalization.
 * Throws immediately if corruption is detected.
 * 
 * TEMPORARY: Also logs any remaining 4294967295 values for debugging.
 */
export function assertNoCorruptValuesAfterNormalization(obj: any, path: string[] = [], context?: string): void {
  if (obj === -1 || obj === 4294967295) {
    const pathStr = path.join('.') || '(root)';
    const ctx = context ? ` in ${context}` : '';
    console.error(`❌ CORRUPT_VALUE_DETECTED${ctx} at ${pathStr} = ${obj}. Normalization failed!`);
    throw new Error(`❌ CORRUPT_VALUE_DETECTED${ctx} at ${pathStr} = ${obj}. Normalization failed!`);
  }

  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoCorruptValuesAfterNormalization(v, [...path, String(i)], context));
    return;
  }

  // Check for corrupt timestamp nanoseconds
  if (typeof obj.nanoseconds === 'number' || typeof obj._nanoseconds === 'number') {
    const nanos = obj.nanoseconds ?? obj._nanoseconds;
    if (nanos < 0 || nanos > 999_999_999) {
      const pathStr = path.join('.') || '(root)';
      const ctx = context ? ` in ${context}` : '';
      console.error(`❌ CORRUPT_NANOSECONDS${ctx} at ${pathStr}.nanoseconds = ${nanos}. Must be 0..999,999,999.`);
      throw new Error(`❌ CORRUPT_NANOSECONDS${ctx} at ${pathStr}.nanoseconds = ${nanos}. Must be 0..999,999,999.`);
    }
  }

  // TEMPORARY: Log guard - scan for any remaining 4294967295 values
  for (const [k, v] of Object.entries(obj)) {
    if (v === 4294967295 || v === -1) {
      const pathStr = [...path, k].join('.') || '(root)';
      const ctx = context ? ` in ${context}` : '';
      console.error(`⚠️  TEMPORARY_LOG_GUARD: Found corrupt value ${v} at ${pathStr}${ctx}`);
    }
    assertNoCorruptValuesAfterNormalization(v, [...path, k], context);
  }
}
