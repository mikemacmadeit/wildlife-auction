/**
 * Netlify Scheduled Function: Finalize Auctions
 *
 * Purpose:
 * - Close ended auctions (type=auction, status=active, endsAt <= now)
 * - Persist an immutable AuctionResult at `auctionResults/{listingId}`
 * - Flip listing status to 'expired' and set finalization fields
 *
 * Safety:
 * - Idempotent: AuctionResult with finalizedAt causes a no-op
 * - Transactional: listing + auctionResult written in one transaction via shared logic
 * - Retry-safe: safe under Netlify retries / partial failures
 */
import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { finalizeAuctionIfNeeded } from '../../lib/auctions/finalizeAuction';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';

const MAX_PER_RUN = 200;
const TIME_BUDGET_MS = 45_000;

const baseHandler: Handler = async () => {
  const requestId = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const start = Date.now();
  logInfo('finalizeAuctions: triggered', { requestId, route: 'finalizeAuctions' });

  const db = getAdminDb();
  const nowTs = Timestamp.now();

  let scanned = 0;
  let finalized = 0;
  let noops = 0;
  let errors = 0;

  try {
    // Query ended auctions. This requires a composite index on (type,status,endsAt) in Firestore.
    // If missing, we log a warning and exit safely (no writes performed).
    const snap = await db
      .collection('listings')
      .where('type', '==', 'auction')
      .where('status', '==', 'active')
      .where('endsAt', '<=', nowTs)
      .orderBy('endsAt', 'asc')
      .limit(MAX_PER_RUN)
      .get();

    scanned = snap.size;
    if (snap.empty) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, finalized, noops, errors }) };
    }

    for (const doc of snap.docs) {
      if (Date.now() - start > TIME_BUDGET_MS) {
        logWarn('finalizeAuctions: time budget reached; exiting early', { requestId, route: 'finalizeAuctions', scanned, finalized, noops, errors });
        break;
      }

      const listingId = doc.id;
      const res = await finalizeAuctionIfNeeded({ db: db as any, listingId, requestId, now: nowTs });
      if (!res.ok) {
        // NOT_ENDED can occur due to clock skew or endsAt updates; treat as benign.
        if (res.code !== 'NOT_ENDED') errors++;
        continue;
      }
      if (res.didFinalize) finalized++;
      else noops++;
    }

    logInfo('finalizeAuctions: completed', { requestId, route: 'finalizeAuctions', scanned, finalized, noops, errors });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, finalized, noops, errors }) };
  } catch (e: any) {
    // Missing indexes / failed-precondition should not crash the platform; log and return 200 so cron doesn't thrash retries.
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    const looksLikeIndex = code === 'failed-precondition' || /requires an index/i.test(msg);
    if (looksLikeIndex) {
      logWarn('finalizeAuctions: missing Firestore index; skipping run', { requestId, route: 'finalizeAuctions', code, message: msg });
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: 'MISSING_INDEX' }) };
    }

    logError('finalizeAuctions: fatal error', e, { requestId, route: 'finalizeAuctions' });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: msg || 'Unknown error' }) };
  }
};

export const handler = schedule('*/2 * * * *', baseHandler);

