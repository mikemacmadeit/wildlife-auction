/**
 * Firestore Panic Guard
 * 
 * This function scans payloads BEFORE they're sent to Firestore and throws
 * immediately with a detailed stack trace if any corrupt int32 values are detected.
 * This allows us to identify the exact file/line that's still producing bad data.
 * 
 * Use this BEFORE every Firestore write operation:
 * 
 * const sanitized = sanitizeFirestorePayload(payload);
 * panicScanForBadInt32(sanitized); // throws with exact field path
 * await ref.update(sanitized);
 */

/**
 * Recursively scans an object for corrupt int32 values (-1 or 4294967295).
 * Throws immediately with the exact field path if found.
 */
export function panicScanForBadInt32(obj: any, path: string[] = []): void {
  // Check for direct corrupt sentinel values
  if (obj === -1 || obj === 4294967295) {
    const pathStr = path.join('.') || '(root)';
    throw new Error(
      `❌ BAD_INT32_DETECTED at ${pathStr} = ${obj}. ` +
      `This value cannot be serialized to Firestore. ` +
      `Stack trace will show the exact callsite.`
    );
  }

  // Primitives - nothing to scan
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return;
  }

  // Arrays - recurse into each element
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      try {
        panicScanForBadInt32(v, [...path, String(i)]);
      } catch (error: any) {
        // Re-throw with enhanced context
        throw new Error(
          `❌ BAD_INT32 in array at ${path.join('.')}[${i}]: ${error.message}`
        );
      }
    });
    return;
  }

  // Objects - check for timestamp-like objects and recurse
  for (const [k, v] of Object.entries(obj)) {
    const currentPath = [...path, k];
    const pathStr = currentPath.join('.');

    // Check for timestamp-like objects (the #1 culprit)
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const ns = (v as any)?.nanoseconds ?? (v as any)?._nanoseconds;
      if (ns === -1 || ns === 4294967295) {
        throw new Error(
          `❌ BAD_NANOSECONDS at ${pathStr}.nanoseconds = ${ns}. ` +
          `Timestamp nanoseconds must be 0..999,999,999. ` +
          `Stack trace will show the exact callsite.`
        );
      }

      // Also check seconds for corruption (shouldn't happen but defensive)
      const sec = (v as any)?.seconds ?? (v as any)?._seconds;
      if (sec === -1 || sec === 4294967295) {
        throw new Error(
          `❌ BAD_SECONDS at ${pathStr}.seconds = ${sec}. ` +
          `Stack trace will show the exact callsite.`
        );
      }
    }

    // Recurse into nested structures
    try {
      panicScanForBadInt32(v, currentPath);
    } catch (error: any) {
      // Re-throw with enhanced context
      throw new Error(
        `❌ BAD_INT32 at ${pathStr}: ${error.message}`
      );
    }
  }
}
