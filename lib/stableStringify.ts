/**
 * Deterministic JSON stringify: object keys sorted recursively, arrays preserve order.
 * Used for cache keys so identical inputs always produce the same string.
 */
function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k];
    sorted[k] = normalizeForStringify(v);
  }
  return sorted;
}

function normalizeForStringify(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalizeForStringify);
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    return sortKeys(value as Record<string, unknown>);
  }
  return value;
}

/**
 * Returns a deterministic string for an object (keys sorted recursively).
 * Arrays keep their order; object keys are sorted.
 */
export function stableStringify(obj: unknown): string {
  const normalized = normalizeForStringify(obj);
  return JSON.stringify(normalized);
}
