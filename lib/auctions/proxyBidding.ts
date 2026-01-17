/**
 * Proxy Bidding (eBay-style) engine.
 *
 * Important design notes for this codebase:
 * - We store user max bids in Firestore under `listings/{listingId}/autoBids/{userId}` (not in public bid docs).
 * - Public bid docs represent *effective* bid movements only (what the current price becomes), to avoid leaking max bids.
 * - This engine computes the next auction state deterministically from:
 *   - currentBidCents, highBidderId
 *   - a set of enabled max bids (autoBidSet)
 */

export type ProxyBidSource = 'manual' | 'auto';

export interface AutoBidEntry {
  userId: string;
  maxBidCents: number;
  enabled: boolean;
  createdAtMs: number; // used for deterministic tie-breaking (earlier wins)
  updatedAtMs?: number;
}

export interface SyntheticBidToWrite {
  bidderId: string;
  amountCents: number; // effective bid amount (public)
  isAuto: boolean;
  reason: 'proxy_raise';
}

export interface ComputeNextStateInput {
  currentBidCents: number;
  highBidderId: string | null;
  autoBidSet: AutoBidEntry[]; // includes all known auto bids (enabled + disabled)
}

export interface ComputeNextStateOutput {
  newCurrentBidCents: number;
  newHighBidderId: string | null;
  syntheticBidsToWrite: SyntheticBidToWrite[];
  // Useful for notifications/analytics
  previousHighBidderId: string | null;
  secondHighestMaxCents?: number;
  highestMaxCents?: number;
}

export function assertValidCents(n: number, label: string) {
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new Error(`${label} must be a non-negative integer (cents)`);
  }
}

/**
 * Bid increment ladder (sane default, mirrors current UI behavior):
 * - 5% of current price
 * - minimum $50 (5000 cents)
 * - rounded up to the nearest $1 to avoid odd cents.
 */
export function getMinIncrementCents(currentBidCents: number): number {
  assertValidCents(currentBidCents, 'currentBidCents');
  const inc = Math.max(Math.round(currentBidCents * 0.05), 5000);
  return Math.ceil(inc / 100) * 100;
}

function sortByMaxThenTime(a: AutoBidEntry, b: AutoBidEntry) {
  if (b.maxBidCents !== a.maxBidCents) return b.maxBidCents - a.maxBidCents;
  if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
  return a.userId.localeCompare(b.userId);
}

export function computeNextState(input: ComputeNextStateInput): ComputeNextStateOutput {
  assertValidCents(input.currentBidCents, 'currentBidCents');

  const enabled = (input.autoBidSet || [])
    .filter((e) => e && e.enabled === true)
    .map((e) => {
      assertValidCents(e.maxBidCents, 'maxBidCents');
      return e;
    })
    // only keep max bids that can at least cover the current price
    .filter((e) => e.maxBidCents >= input.currentBidCents)
    .sort(sortByMaxThenTime);

  const previousHighBidderId = input.highBidderId || null;

  if (enabled.length === 0) {
    return {
      newCurrentBidCents: input.currentBidCents,
      newHighBidderId: previousHighBidderId,
      syntheticBidsToWrite: [],
      previousHighBidderId,
    };
  }

  const winner = enabled[0]!;
  const runnerUp = enabled[1];

  let targetPrice = input.currentBidCents;
  if (runnerUp) {
    const inc = getMinIncrementCents(runnerUp.maxBidCents);
    targetPrice = Math.min(runnerUp.maxBidCents + inc, winner.maxBidCents);
  } else {
    // Single bidder: price stays where it is (starting bid / current price).
    targetPrice = input.currentBidCents;
  }

  const newCurrentBidCents = Math.max(input.currentBidCents, targetPrice);
  const newHighBidderId = winner.userId;

  const syntheticBidsToWrite: SyntheticBidToWrite[] = [];
  if (newCurrentBidCents > input.currentBidCents) {
    syntheticBidsToWrite.push({
      bidderId: winner.userId,
      amountCents: newCurrentBidCents,
      isAuto: true,
      reason: 'proxy_raise',
    });
  }

  return {
    newCurrentBidCents,
    newHighBidderId,
    syntheticBidsToWrite,
    previousHighBidderId,
    highestMaxCents: winner.maxBidCents,
    secondHighestMaxCents: runnerUp?.maxBidCents,
  };
}

