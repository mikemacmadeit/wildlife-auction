/**
 * Development-Time Int32 Corruption Assertion
 * 
 * Hard-fails in development if corrupt int32 values are detected before Firestore write.
 * This provides a clear stack trace pointing to the exact offending field.
 * 
 * Usage:
 *   if (process.env.NODE_ENV !== 'production') {
 *     assertNoCorruptInt32(payload);
 *   }
 */

export function assertNoCorruptInt32(obj: any, path: string[] = []): void {
  // Check for corrupt sentinel values
  if (obj === -1 || obj === 4294967295) {
    const pathStr = path.join('.') || '(root)';
    throw new Error(`❌ CORRUPT_INT32 detected at ${pathStr} = ${obj}. This value will cause Firestore serialization errors.`);
  }

  // Check for invalid timestamp nanoseconds
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const nanos = obj.nanoseconds ?? obj._nanoseconds;
    if (typeof nanos === 'number') {
      if (nanos < 0 || nanos > 999_999_999) {
        const pathStr = path.join('.') || '(root)';
        throw new Error(`❌ CORRUPT_TIMESTAMP_NANOS at ${pathStr}.nanoseconds = ${nanos}. Must be 0..999,999,999.`);
      }
    }
  }

  // Recurse into arrays and objects
  if (!obj || typeof obj !== 'object') return;
  
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoCorruptInt32(v, [...path, String(i)]));
    return;
  }

  for (const [k, v] of Object.entries(obj)) {
    // Skip Firestore special types
    if (v && typeof v === 'object' && v.constructor?.name?.includes('FieldValue')) {
      continue;
    }
    assertNoCorruptInt32(v, [...path, k]);
  }
}
