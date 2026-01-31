import { Timestamp, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logError, logInfo, logWarn } from '@/lib/monitoring/logger';
import type { AuctionResultDoc, AuctionResultStatus } from '@/lib/types/auctionResult';

export const AUCTION_PAYMENT_WINDOW_HOURS = 48;
export const AUCTION_RESULT_FINALIZED_VERSION = 1;

class FinalizeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function assertInt(n: number, label: string) {
  if (!Number.isFinite(n) || Math.floor(n) !== n) throw new FinalizeError('INVALID_NUMBER', `${label} must be an integer`);
}

function usdToCents(usd: any): number {
  const n = typeof usd === 'number' ? usd : Number(usd);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.max(0, Math.round(n * 100));
}

function tsOrNull(v: any): Timestamp | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v;
  if (typeof v?.toMillis === 'function') return Timestamp.fromMillis(v.toMillis());
  if (typeof v?.toDate === 'function') {
    const d = v.toDate();
    if (d instanceof Date && Number.isFinite(d.getTime())) return Timestamp.fromDate(d);
  }
  return null;
}

type FinalizeOutcome = {
  status: AuctionResultStatus;
  winnerBidderId: string | null;
  finalPriceCents: number | null;
  reservePriceCents: number | null;
  reserveMet: boolean;
};

function computeOutcomeFromListing(listing: any): FinalizeOutcome {
  const bidCount = Number(listing?.metrics?.bidCount || 0) || 0;
  const currentBidderId = typeof listing?.currentBidderId === 'string' ? listing.currentBidderId : null;

  // Normalize cents (prefer cents fields, fall back to USD numbers).
  const currentBidCents =
    Number.isFinite(Number(listing?.currentBidCents)) && Math.floor(Number(listing.currentBidCents)) === Number(listing.currentBidCents)
      ? Number(listing.currentBidCents)
      : usdToCents(listing?.currentBid ?? listing?.startingBid ?? 0);
  const reservePriceCentsRaw =
    Number.isFinite(Number(listing?.reservePriceCents)) && Math.floor(Number(listing.reservePriceCents)) === Number(listing.reservePriceCents)
      ? Number(listing.reservePriceCents)
      : usdToCents(listing?.reservePrice ?? 0);
  const hasReserve = reservePriceCentsRaw > 0;
  const reservePriceCents = hasReserve ? reservePriceCentsRaw : null;

  assertInt(currentBidCents, 'currentBidCents');
  if (reservePriceCents != null) assertInt(reservePriceCents, 'reservePriceCents');

  const hasAnyBids = Boolean(currentBidderId) || bidCount > 0 || currentBidCents > 0;
  if (!hasAnyBids || !currentBidderId) {
    return {
      status: 'ended_no_bids',
      winnerBidderId: null,
      finalPriceCents: null,
      reservePriceCents,
      reserveMet: false,
    };
  }

  if (hasReserve && currentBidCents < reservePriceCentsRaw) {
    return {
      status: 'ended_reserve_not_met',
      winnerBidderId: null,
      finalPriceCents: null,
      reservePriceCents,
      reserveMet: false,
    };
  }

  return {
    status: 'ended_winner_pending_payment',
    winnerBidderId: currentBidderId,
    finalPriceCents: currentBidCents,
    reservePriceCents,
    reserveMet: hasReserve ? currentBidCents >= reservePriceCentsRaw : false,
  };
}

export type AllowedAuctionResultTransition =
  | ['scheduled', 'active']
  | ['active', 'ended_no_bids']
  | ['active', 'ended_reserve_not_met']
  | ['active', 'ended_winner_pending_payment']
  | ['ended_winner_pending_payment', 'ended_paid']
  | ['ended_winner_pending_payment', 'ended_unpaid_expired']
  | ['ended_unpaid_expired', 'ended_relisted']
  | ['ended_winner_pending_payment', 'ended_second_chance_offered']
  | ['ended_second_chance_offered', 'ended_paid']
  | ['ended_second_chance_offered', 'ended_relisted'];

export const ALLOWED_AUCTION_RESULT_TRANSITIONS: AllowedAuctionResultTransition[] = [
  ['scheduled', 'active'],
  ['active', 'ended_no_bids'],
  ['active', 'ended_reserve_not_met'],
  ['active', 'ended_winner_pending_payment'],
  ['ended_winner_pending_payment', 'ended_paid'],
  ['ended_winner_pending_payment', 'ended_unpaid_expired'],
  ['ended_unpaid_expired', 'ended_relisted'],
  ['ended_winner_pending_payment', 'ended_second_chance_offered'],
  ['ended_second_chance_offered', 'ended_paid'],
  ['ended_second_chance_offered', 'ended_relisted'],
];

export function isAllowedAuctionResultTransition(from: AuctionResultStatus, to: AuctionResultStatus): boolean {
  return ALLOWED_AUCTION_RESULT_TRANSITIONS.some(([a, b]) => a === from && b === to);
}

function coreMatchesExisting(existing: any, computed: AuctionResultDoc): boolean {
  // Only compare the fields that must never drift under retries.
  const exStatus = String(existing?.status || '');
  const exWinner = existing?.winnerBidderId ?? null;
  const exFinal = typeof existing?.finalPriceCents === 'number' ? existing.finalPriceCents : null;
  const exEndsAtMs = existing?.endsAt?.toMillis?.() ?? null;
  const coEndsAtMs = computed.endsAt.toMillis();
  return exStatus === computed.status && exWinner === computed.winnerBidderId && exFinal === computed.finalPriceCents && exEndsAtMs === coEndsAtMs;
}

export type FinalizeAuctionResult =
  | { ok: true; didFinalize: boolean; auctionResult: AuctionResultDoc }
  | { ok: false; code: string; message: string };

/**
 * Finalize an auction if needed (idempotent).
 *
 * - Transactional: reads listing + auctionResult; writes auctionResult + listing updates.
 * - Uses authoritative listing fields (NOT bids collection queries).
 * - If an auctionResult exists and is finalized, this is a no-op.
 * - If an auctionResult exists but does not match computed core fields, we refuse to overwrite.
 */
export async function finalizeAuctionIfNeeded(params: {
  db: Firestore;
  listingId: string;
  requestId?: string;
  now?: Timestamp;
}): Promise<FinalizeAuctionResult> {
  const { db, listingId, requestId } = params;
  const nowTs = params.now ?? Timestamp.now();

  try {
    const listingRef = db.collection('listings').doc(listingId);
    const resultRef = db.collection('auctionResults').doc(listingId);

    let outDoc: AuctionResultDoc | null = null;
    let didFinalize = false;

    await db.runTransaction(async (tx) => {
      const [listingSnap, resultSnap] = await Promise.all([tx.get(listingRef), tx.get(resultRef)]);
      if (!listingSnap.exists) throw new FinalizeError('LISTING_NOT_FOUND', 'Listing not found');
      const listing = listingSnap.data() as any;

      if (String(listing?.type || '') !== 'auction') {
        throw new FinalizeError('NOT_AUCTION', 'Listing is not an auction');
      }

      const endsAt = tsOrNull(listing?.endsAt);
      if (!endsAt) throw new FinalizeError('MISSING_ENDS_AT', 'Auction listing is missing endsAt');
      if (endsAt.toMillis() > nowTs.toMillis()) {
        // Not ended yet; no finalize.
        throw new FinalizeError('NOT_ENDED', 'Auction has not ended yet');
      }

      // If listing is already sold (winner paid, webhook ran), do not overwrite with expired
      if (listing?.status === 'sold' || listing?.soldAt) {
        outDoc = resultSnap.exists ? (resultSnap.data() as AuctionResultDoc) : null;
        didFinalize = false;
        return;
      }

      if (resultSnap.exists) {
        const existing = resultSnap.data() as any;
        const finalizedAt = tsOrNull(existing?.finalizedAt);
        if (finalizedAt) {
          outDoc = existing as AuctionResultDoc;
          didFinalize = false;
          return;
        }
      }

      const computedOutcome = computeOutcomeFromListing(listing);
      const bidCountAtEnd = Number(listing?.metrics?.bidCount || 0) || 0;
      const currentBidderId = typeof listing?.currentBidderId === 'string' ? listing.currentBidderId : null;
      const currentBidCents =
        Number.isFinite(Number(listing?.currentBidCents)) && Math.floor(Number(listing.currentBidCents)) === Number(listing.currentBidCents)
          ? Number(listing.currentBidCents)
          : usdToCents(listing?.currentBid ?? listing?.startingBid ?? 0);
      assertInt(currentBidCents, 'currentBidCents');

      const lastBidAt = tsOrNull(listing?.metrics?.lastBidAt);
      const paymentDueAt =
        computedOutcome.status === 'ended_winner_pending_payment'
          ? Timestamp.fromMillis(nowTs.toMillis() + AUCTION_PAYMENT_WINDOW_HOURS * 60 * 60 * 1000)
          : null;

      const nextDoc: AuctionResultDoc = {
        listingId,
        sellerId: String(listing?.sellerId || ''),
        endsAt,
        finalizedAt: nowTs,
        status: computedOutcome.status,
        winnerBidderId: computedOutcome.winnerBidderId,
        finalPriceCents: computedOutcome.finalPriceCents,
        reservePriceCents: computedOutcome.reservePriceCents,
        reserveMet: computedOutcome.reserveMet,
        snapshot: {
          currentBidCents,
          currentBidderId,
          bidCountAtEnd,
          lastBidAt,
          tieBreak: { strategy: 'max_then_time' },
        },
        paymentDueAt,
        finalizedVersion: AUCTION_RESULT_FINALIZED_VERSION,
        finalizedBy: 'system',
      };

      if (resultSnap.exists) {
        const existing = resultSnap.data() as any;
        // If a doc exists but isn't finalized, ensure it matches computed core fields.
        // This prevents overwriting a partially-created/malformed result silently.
        if (!coreMatchesExisting(existing, nextDoc)) {
          logError('AuctionResult mismatch; refusing to overwrite', undefined, {
            requestId,
            route: 'finalizeAuctionIfNeeded',
            listingId,
            existingStatus: existing?.status,
            computedStatus: nextDoc.status,
          });
          throw new FinalizeError('RESULT_MISMATCH', 'Existing auctionResult does not match computed outcome');
        }
        tx.set(resultRef, nextDoc, { merge: true });
      } else {
        tx.create(resultRef, nextDoc as any);
      }

      // Persist listing end state (authoritative). Keep minimal fields, do not rewrite pricing.
      // IMPORTANT (diligence note): this is the authoritative setter for "ended auction" listing state.
      // listing.status currently drives public read behavior; we use `status: 'expired'` to mean "auction ended" (not deleted).
      tx.set(
        listingRef,
        {
          status: 'expired',
          endedAt: nowTs,
          auctionFinalizedAt: nowTs,
          auctionResultStatus: computedOutcome.status,
          auctionPaymentDueAt: paymentDueAt,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'system',
        },
        { merge: true }
      );

      outDoc = nextDoc;
      didFinalize = true;
    });

    if (!outDoc) throw new Error('Finalize transaction completed without a result document');
    const out: any = outDoc as any;
    logInfo('Auction finalization completed', {
      requestId,
      route: 'finalizeAuctionIfNeeded',
      listingId,
      didFinalize,
      status: out?.status,
      winnerBidderId: out?.winnerBidderId || undefined,
    });
    return { ok: true, didFinalize, auctionResult: outDoc };
  } catch (e: any) {
    const code = e?.code || (e instanceof FinalizeError ? e.code : 'FINALIZE_FAILED');
    const message = e?.message || 'Failed to finalize auction';
    if (code !== 'NOT_ENDED') {
      logWarn('Auction finalization failed', { requestId, route: 'finalizeAuctionIfNeeded', listingId, code, message });
    }
    return { ok: false, code: String(code), message: String(message) };
  }
}

