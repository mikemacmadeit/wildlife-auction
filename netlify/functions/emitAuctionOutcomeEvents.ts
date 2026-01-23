/**
 * Netlify Scheduled Function: Emit Auction Outcome Events (Won/Lost)
 *
 * Why:
 * - `Auction.Won` / `Auction.Lost` are canonical notification event types.
 * - Auction finalization persists AuctionResult, but notification emission must be reliable and retry-safe.
 *
 * Strategy:
 * - Scan `auctionResults` for finalized winners where outcome events haven't been queued yet.
 * - Derive participants from `listings/{listingId}/autoBids` (authoritative bidders set in this repo).
 * - Emit events via canonical emitters (idempotent creates).
 * - Mark `auctionResults/{listingId}.outcomeEventsQueuedAt` so we don't rescan forever.
 */
import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { emitAndProcessEventForUser } from '../../lib/notifications';
import { stableHash } from '../../lib/notifications/eventKey';
import { getSiteUrl } from '../../lib/site-url';
import { AUCTION_RESULT_FINALIZED_VERSION } from '../../lib/auctions/finalizeAuction';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';
import { tryDispatchEmailJobNow } from '../../lib/email/dispatchEmailJobNow';

const MAX_PER_RUN = 50;
const TIME_BUDGET_MS = 45_000;
const MAX_PARTICIPANTS_READ = 500;
const MAX_LOSERS_EMIT = 200;

const baseHandler: Handler = async () => {
  const requestId = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const start = Date.now();
  const db = getAdminDb();
  const siteUrl = getSiteUrl();
  const nowTs = Timestamp.now();

  let scanned = 0;
  let queuedWon = 0;
  let queuedLost = 0;
  let marked = 0;
  let noops = 0;
  let errors = 0;

  try {
    // NOTE: querying for "missing field" by `== null` matches both null + missing.
    const snap = await db
      .collection('auctionResults')
      .where('status', '==', 'ended_winner_pending_payment')
      .where('outcomeEventsQueuedAt', '==', null)
      .orderBy('finalizedAt', 'asc')
      .limit(MAX_PER_RUN)
      .get();

    scanned = snap.size;
    if (snap.empty) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, queuedWon, queuedLost, marked, noops, errors }) };
    }

    for (const doc of snap.docs) {
      if (Date.now() - start > TIME_BUDGET_MS) {
        logWarn('emitAuctionOutcomeEvents: time budget reached; exiting early', {
          requestId,
          route: 'emitAuctionOutcomeEvents',
          scanned,
          queuedWon,
          queuedLost,
          marked,
          noops,
          errors,
        });
        break;
      }

      const listingId = doc.id;
      const resultRef = doc.ref;
      const ar = doc.data() as any;
      const winnerId = typeof ar?.winnerBidderId === 'string' ? ar.winnerBidderId : '';
      const finalPriceCents = typeof ar?.finalPriceCents === 'number' ? ar.finalPriceCents : 0;
      const endsAtIso = typeof ar?.endsAt?.toDate === 'function' ? ar.endsAt.toDate().toISOString() : undefined;

      if (!winnerId) {
        // Defensive: nothing to emit. Mark so we don't spin.
        await resultRef.set({ outcomeEventsQueuedAt: nowTs, outcomeEventsQueuedVersion: AUCTION_RESULT_FINALIZED_VERSION }, { merge: true });
        marked++;
        noops++;
        continue;
      }

      try {
        const listingRef = db.collection('listings').doc(listingId);
        const listingSnap = await listingRef.get();
        const listing = listingSnap.exists ? (listingSnap.data() as any) : null;
        const listingTitle = String(listing?.title || 'Listing');
        const listingUrl = `${siteUrl}/listing/${listingId}`;

        // Participants from autoBids (safe + bounded).
        const participantsSnap = await listingRef
          .collection('autoBids')
          .where('enabled', '==', true)
          .limit(MAX_PARTICIPANTS_READ)
          .get();

        const participantIds = Array.from(
          new Set(
            participantsSnap.docs
              .map((d) => {
                const data = d.data() as any;
                return String(data?.userId || d.id || '').trim();
              })
              .filter(Boolean)
          )
        );

        const losers = participantIds.filter((id) => id !== winnerId).slice(0, MAX_LOSERS_EMIT);
        const optionalHash = stableHash(`auction_finalized:${listingId}:v${AUCTION_RESULT_FINALIZED_VERSION}`).slice(0, 18);
        const finalUsd = finalPriceCents / 100;

        // Winner
        const won = await emitAndProcessEventForUser({
          type: 'Auction.Won',
          actorId: null,
          entityType: 'listing',
          entityId: listingId,
          targetUserId: winnerId,
          payload: {
            type: 'Auction.Won',
            listingId,
            listingTitle,
            listingUrl,
            winningBidAmount: finalUsd,
            ...(endsAtIso ? { endsAt: endsAtIso } : {}),
          },
          optionalHash,
        });
        queuedWon++;
        // Best-effort: dispatch the winner email immediately (critical UX), without relying on schedulers.
        if (won?.ok && won.created) {
          void tryDispatchEmailJobNow({ db: db as any, jobId: won.eventId }).catch(() => {});
        }

        // Losers
        for (const loserId of losers) {
          await emitAndProcessEventForUser({
            type: 'Auction.Lost',
            actorId: null,
            entityType: 'listing',
            entityId: listingId,
            targetUserId: loserId,
            payload: {
              type: 'Auction.Lost',
              listingId,
              listingTitle,
              listingUrl,
              finalBidAmount: finalUsd,
              ...(endsAtIso ? { endsAt: endsAtIso } : {}),
            },
            optionalHash,
          });
          queuedLost++;
        }

        if (participantIds.length - 1 > losers.length) {
          logWarn('emitAuctionOutcomeEvents: losers capped', {
            requestId,
            route: 'emitAuctionOutcomeEvents',
            listingId,
            totalParticipants: participantIds.length,
            lostEmitted: losers.length,
          });
        }

        await resultRef.set(
          {
            outcomeEventsQueuedAt: nowTs,
            outcomeEventsQueuedVersion: AUCTION_RESULT_FINALIZED_VERSION,
            outcomeEventsQueuedCounts: { won: 1, lost: losers.length },
          },
          { merge: true }
        );
        marked++;
      } catch (e: any) {
        errors++;
        logWarn('emitAuctionOutcomeEvents: failed to emit outcomes', {
          requestId,
          route: 'emitAuctionOutcomeEvents',
          listingId,
          message: String(e?.message || e),
        });
      }
    }

    logInfo('emitAuctionOutcomeEvents: completed', { requestId, route: 'emitAuctionOutcomeEvents', scanned, queuedWon, queuedLost, marked, noops, errors });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, queuedWon, queuedLost, marked, noops, errors }) };
  } catch (e: any) {
    // Missing indexes / failed-precondition should not crash; log and exit safely.
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    const looksLikeIndex = code === 'failed-precondition' || /requires an index/i.test(msg);
    if (looksLikeIndex) {
      logWarn('emitAuctionOutcomeEvents: missing Firestore index; skipping run', { requestId, route: 'emitAuctionOutcomeEvents', code, message: msg });
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: 'MISSING_INDEX' }) };
    }
    logError('emitAuctionOutcomeEvents: fatal error', e, { requestId, route: 'emitAuctionOutcomeEvents' });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: msg || 'Unknown error' }) };
  }
};

export const handler = schedule('*/2 * * * *', baseHandler);

