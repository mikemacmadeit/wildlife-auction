/**
 * Phase 2B: In-memory cache for Browse (stale-while-revalidate).
 * Only used when FLAGS.browseCache is true.
 *
 * TTL_MS = 60s. Entries older than TTL are treated as miss.
 * Revalidate threshold (12s) is enforced in the page so we don't revalidate too often.
 */

import type { Listing } from '@/lib/types';
import type { BrowseCursor } from '@/lib/firebase/listings';

/** Cache entry TTL — entries older than this are treated as miss. */
export const TTL_MS = 60_000;

export interface BrowseRenderState {
  listings: Listing[];
  nextCursor: BrowseCursor | null;
  hasMore: boolean;
}

interface CacheEntry {
  ts: number;
  data: BrowseRenderState;
}

const cache = new Map<string, CacheEntry>();

export function getBrowseCache(key: string): BrowseRenderState | null {
  const entry = getBrowseCacheEntry(key);
  return entry ? entry.data : null;
}

/** Returns entry with timestamp when not expired; used to decide if revalidate is needed (e.g. age >= 12s). */
export function getBrowseCacheEntry(key: string): { ts: number; data: BrowseRenderState } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setBrowseCache(key: string, data: BrowseRenderState): void {
  cache.set(key, { ts: Date.now(), data });
}

export function clearBrowseCache(): void {
  cache.clear();
}
