/**
 * Feature flags for Phase 2/3 performance and UX experiments.
 * All default to false — no behavior change until explicitly enabled via env.
 *
 * To enable: set NEXT_PUBLIC_* in .env.local (e.g. NEXT_PUBLIC_BROWSE_CACHE=true).
 */
export const FLAGS = {
  /** Virtualize long lists (browse grid, watchlist) — behind flag until validated. */
  virtualizeLists: process.env.NEXT_PUBLIC_VIRTUALIZE_LISTS === 'true',
  /** Cache-first browse (show cached results immediately, revalidate in background). */
  browseCache: process.env.NEXT_PUBLIC_BROWSE_CACHE === 'true',
  /** Optimistic bid/order actions (update UI before server confirmation). */
  optimisticBids: process.env.NEXT_PUBLIC_OPTIMISTIC_BIDS === 'true',
} as const;
