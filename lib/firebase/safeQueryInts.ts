/**
 * Safe Query Integer Helpers
 * 
 * Prevents -1 or invalid values from being passed to Firestore queries,
 * which would cause int32 serialization errors.
 */

/**
 * Ensure a value is a positive integer, falling back to a safe default.
 * Used for Firestore query parameters like limit, offset, pageSize.
 */
export function safePositiveInt(n: any, fallback = 25): number {
  if (n === null || n === undefined) return fallback;
  
  const x = typeof n === 'number' ? Math.floor(n) : Number(n);
  
  if (!Number.isFinite(x) || x < 1) {
    console.warn(`⚠️  Invalid query integer: ${n}, using fallback: ${fallback}`);
    return fallback;
  }
  
  // Ensure it's within int32 range
  if (x > 2147483647) {
    console.warn(`⚠️  Query integer too large: ${x}, clamping to ${fallback}`);
    return fallback;
  }
  
  return x;
}

/**
 * Ensure a value is a non-negative integer (0 or positive).
 * Used for offsets which can be 0.
 */
export function safeNonNegativeInt(n: any, fallback = 0): number {
  if (n === null || n === undefined) return fallback;
  
  const x = typeof n === 'number' ? Math.floor(n) : Number(n);
  
  if (!Number.isFinite(x) || x < 0) {
    console.warn(`⚠️  Invalid query integer (non-negative): ${n}, using fallback: ${fallback}`);
    return fallback;
  }
  
  // Ensure it's within int32 range
  if (x > 2147483647) {
    console.warn(`⚠️  Query integer too large: ${x}, clamping to ${fallback}`);
    return fallback;
  }
  
  return x;
}
