/**
 * Int32 Serialization Tripwire
 * 
 * Catches invalid int32 values before they reach Firestore/Protobuf serialization.
 * This will throw with a clear stack trace showing the exact callsite.
 */

/**
 * Assert a value is a valid int32 (-2,147,483,648 to 2,147,483,647)
 * Throws immediately if invalid, preventing serialization errors.
 */
export function assertInt32(n: unknown, label: string): void {
  if (typeof n !== 'number' || !Number.isInteger(n)) return;
  if (n < -2147483648 || n > 2147483647) {
    console.error(`❌ INVALID int32 for ${label}:`, n);
    throw new Error(`INVALID int32: ${label}=${n}`);
  }
}

/**
 * Assert Firestore Timestamp nanoseconds are valid (0 to 999,999,999)
 * Throws immediately if invalid.
 */
export function assertFirestoreNanos(n: unknown, label: string): void {
  if (typeof n !== 'number' || !Number.isInteger(n)) return;
  if (n < 0 || n > 999_999_999) {
    console.error(`❌ INVALID Firestore nanoseconds for ${label}:`, n);
    throw new Error(`INVALID nanos: ${label}=${n}`);
  }
}
