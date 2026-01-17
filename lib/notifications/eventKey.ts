import crypto from 'crypto';

/**
 * Event idempotency key strategy.
 *
 * We create one event per user recipient to keep processing + dedupe simple.
 *
 * eventKey format (human-readable):
 *   `${type}:${entityId}:${targetUserId}:${optionalHash}`
 *
 * Firestore document IDs cannot contain slashes; we therefore hash the eventKey
 * and use the hash as the deterministic event document ID.
 */

export function buildEventKey(params: {
  type: string;
  entityId: string;
  targetUserId: string;
  optionalHash?: string;
}): string {
  const base = `${params.type}:${params.entityId}:${params.targetUserId}`;
  return params.optionalHash ? `${base}:${params.optionalHash}` : base;
}

export function stableHash(input: string): string {
  // url-safe base64 (no padding)
  return crypto
    .createHash('sha256')
    .update(input)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function eventDocIdFromKey(eventKey: string): string {
  // Firestore doc IDs max length 1500 bytes; this stays tiny.
  return stableHash(eventKey).slice(0, 48);
}

