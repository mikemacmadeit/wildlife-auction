import type { Timestamp } from 'firebase-admin/firestore';

/**
 * AuctionResult
 *
 * Firestore-authoritative, immutable (once finalized) record of an auction outcome.
 * Stored at: `auctionResults/{listingId}`
 */
export type AuctionResultStatus =
  | 'scheduled'
  | 'active'
  | 'ended_no_bids'
  | 'ended_reserve_not_met'
  | 'ended_winner_pending_payment'
  | 'ended_paid'
  | 'ended_unpaid_expired'
  | 'ended_second_chance_offered'
  | 'ended_relisted';

export type AuctionResultDoc = {
  listingId: string;
  sellerId: string;

  // Core timing
  endsAt: Timestamp;
  finalizedAt: Timestamp;

  status: AuctionResultStatus;

  // Winner + price (nullable for no-bid / reserve-not-met)
  winnerBidderId: string | null;
  finalPriceCents: number | null;

  reservePriceCents: number | null;
  reserveMet: boolean;

  // Snapshot at finalization (auditability)
  snapshot: {
    currentBidCents: number;
    currentBidderId: string | null;
    bidCountAtEnd: number;
    lastBidAt: Timestamp | null;
    // Optional: future-proof tie-break metadata if introduced later.
    tieBreak?: {
      strategy: 'max_then_time';
      notes?: string;
    };
  };

  // Payment window (only when there is a winner)
  paymentDueAt: Timestamp | null;

  // Idempotency / audit
  finalizedVersion: number;
  finalizedBy: 'system' | 'admin';

  // Unpaid / relist traceability (optional)
  unpaidExpiredAt?: Timestamp;
  relistedToListingId?: string;
  relistedAt?: Timestamp;
};

