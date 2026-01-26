/**
 * Firestore Payload Sanitization
 * 
 * Sanitizes objects before writing to Firestore to prevent int32 serialization errors.
 * This is a "nuclear" safety net that catches bad values before they hit Firestore.
 * 
 * Use this wrapper around all Firestore write operations (setDoc, updateDoc, addDoc).
 */

import { Timestamp } from 'firebase-admin/firestore';
import { toAdminTimestamp } from './toTimestamp';
import { assertInt32 } from '../debug/int32Tripwire';

/**
 * Recursively sanitize a Firestore payload to prevent int32 serialization errors.
 * 
 * - Converts timestamp-like objects to valid Firestore Timestamps
 * - Clamps negative countdown values to 0
 * - Removes -1 sentinel values
 * - Validates int32 ranges for numeric fields
 */
export function sanitizeFirestorePayload(obj: any, path: string[] = []): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Already a valid Timestamp - validate it
  if (obj instanceof Timestamp) {
    const nanos = (obj as any)._nanoseconds ?? (obj as any).nanoseconds;
    if (typeof nanos === 'number' && (nanos < 0 || nanos > 999_999_999)) {
      console.warn(`⚠️  Invalid Timestamp nanoseconds at ${path.join('.')}: ${nanos}, reconstructing`);
      return toAdminTimestamp(obj);
    }
    return obj;
  }

  // Firestore FieldValue types - pass through
  if (obj && typeof obj === 'object' && obj.constructor?.name?.includes('FieldValue')) {
    return obj;
  }

  // Arrays - recurse
  if (Array.isArray(obj)) {
    return obj.map((item, i) => sanitizeFirestorePayload(item, [...path, String(i)]));
  }

  // Primitives
  if (typeof obj !== 'object') {
    // Check for -1 sentinel values (common cause of int32 errors)
    if (obj === -1 || obj === 4294967295) {
      console.warn(`⚠️  Found -1 sentinel at ${path.join('.')}, converting to null`);
      return null;
    }
    
    // Validate int32 range for numbers
    if (typeof obj === 'number' && Number.isInteger(obj)) {
      if (obj < -2147483648 || obj > 2147483647) {
        console.error(`❌ Invalid int32 at ${path.join('.')}: ${obj}`);
        throw new Error(`Invalid int32 at ${path.join('.')}: ${obj}`);
      }
    }
    
    return obj;
  }

  // Objects - recurse and handle timestamp fields
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = [...path, key];
    const fieldPathStr = fieldPath.join('.');

    // Timestamp-like fields (by naming convention)
    if (/(At|Date|Deadline|Start|End|Timestamp)$/i.test(key)) {
      const sanitizedTimestamp = toAdminTimestamp(value);
      if (sanitizedTimestamp !== null) {
        sanitized[key] = sanitizedTimestamp;
        continue;
      }
    }

    // Raw timestamp objects ({ seconds, nanoseconds } or { _seconds, _nanoseconds })
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const hasSeconds = 'seconds' in value || '_seconds' in value;
      const hasNanos = 'nanoseconds' in value || '_nanoseconds' in value;
      
      if (hasSeconds || hasNanos) {
        const sanitizedTimestamp = toAdminTimestamp(value);
        if (sanitizedTimestamp !== null) {
          sanitized[key] = sanitizedTimestamp;
          continue;
        }
      }
    }

    // Countdown/remaining fields (clamp negative to 0)
    if (/(Remaining|Countdown|Hours|Days|Minutes|Seconds)$/i.test(key) && typeof value === 'number') {
      if (value < 0) {
        console.warn(`⚠️  Negative countdown at ${fieldPathStr}: ${value}, clamping to 0`);
        sanitized[key] = 0;
        continue;
      }
      // Validate int32 range
      if (Number.isInteger(value)) {
        assertInt32(value, fieldPathStr);
      }
    }

    // Limit/offset/pageSize fields (must be >= 1)
    if (/(Limit|Offset|PageSize|MaxResults|Take)$/i.test(key) && typeof value === 'number') {
      if (value < 1 || !Number.isFinite(value)) {
        console.warn(`⚠️  Invalid limit/offset at ${fieldPathStr}: ${value}, using default`);
        sanitized[key] = 25; // Safe default
        continue;
      }
      assertInt32(value, fieldPathStr);
    }

    // Recurse into nested objects
    sanitized[key] = sanitizeFirestorePayload(value, fieldPath);
  }

  return sanitized;
}

/**
 * Wrapper for Firestore document operations that automatically sanitizes payloads.
 * 
 * Usage:
 *   await sanitizedUpdate(docRef, { field: value });
 *   await sanitizedSet(docRef, { field: value });
 */
export async function sanitizedUpdate(
  docRef: { update: (data: any) => Promise<void> },
  data: any
): Promise<void> {
  const sanitized = sanitizeFirestorePayload(data);
  return docRef.update(sanitized);
}

export async function sanitizedSet(
  docRef: { set: (data: any, options?: any) => Promise<void> },
  data: any,
  options?: any
): Promise<void> {
  const sanitized = sanitizeFirestorePayload(data);
  return docRef.set(sanitized, options);
}
