/**
 * Netlify Scheduled Function: Auction Ending Soon
 *
 * Emits Auction.EndingSoon events for watchers/bidders at thresholds:
 * 24h, 1h, 10m, 2m
 *
 * Deduped via deterministic eventId (eventKey includes threshold).
 */

import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { emitAndProcessEventForUser } from '../../lib/notifications/emitEvent';
import { getSiteUrl } from '../../lib/site-url';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';

const THRESHOLDS: Array<{ key: '24h' | '1h' | '10m' | '2m'; seconds: number }> = [
  { key: '24h', seconds: 24 * 60 * 60 },
  { key: '1h', seconds: 60 * 60 },
  { key: '10m', seconds: 10 * 60 },
  { key: '2m', seconds: 2 * 60 },
];

const MAX_AUCTIONS_PER_RUN = 200;
const TOLERANCE_SECONDS = 5 * 60; // schedule runs every 5m

function extractUserIdFromWatchlistPath(path: string): string | null {
  // users/{uid}/watchlist/{listingId}
  const parts = path.split('/');
  const usersIdx = parts.indexOf('users');
  if (usersIdx >= 0 && parts.length > usersIdx + 1) return parts[usersIdx + 1] || null;
  return null;
}

const baseHandler: Handler = async () => {
  const db = getAdminDb();
  const now = new Date();
  const nowTs = Timestamp.fromDate(now);
  const maxWindowSeconds = THRESHOLDS[0].seconds + TOLERANCE_SECONDS;
  const maxWindowTs = Timestamp.fromDate(new Date(now.getTime() + maxWindowSeconds * 1000));

  let scanned = 0;
  let emitted = 0;
  let skipped = 0;

  try {
    const listingsSnap = await db
      .collection('listings')
      .where('type', '==', 'auction')
      .where('status', '==', 'active')
      .where('endsAt', '>=', nowTs)
      .where('endsAt', '<=', maxWindowTs)
      .orderBy('endsAt', 'asc')
      .limit(MAX_AUCTIONS_PER_RUN)
      .get();

    scanned = listingsSnap.size;
    if (listingsSnap.empty) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, emitted, skipped }) };
    }

    for (const doc of listingsSnap.docs) {
      const listingId = doc.id;
      const listing = doc.data() as any;
      const endsAt = listing.endsAt?.toDate?.() as Date | undefined;
      if (!endsAt) continue;
      const remainingSeconds = Math.floor((endsAt.getTime() - now.getTime()) / 1000);
      if (remainingSeconds <= 0) continue;

      const listingTitle = String(listing.title || 'a listing');
      const listingUrl = `${getSiteUrl()}/listing/${listingId}`;
      const currentBidAmount = typeof listing.currentBid === 'number' ? listing.currentBid : undefined;

      const matches = THRESHOLDS.filter(
        (t) => remainingSeconds <= t.seconds + TOLERANCE_SECONDS && remainingSeconds >= t.seconds - TOLERANCE_SECONDS
      );
      if (matches.length === 0) {
        skipped++;
        continue;
      }

      // Watchers (prefer indexed listing watchers; fallback to collectionGroup watchlist for legacy installs)
      let watcherUserIds: string[] = [];
      try {
        const watchersIndexSnap = await db.collection('listings').doc(listingId).collection('watchers').get();
        watcherUserIds = watchersIndexSnap.docs.map((d) => d.id);

        if (watcherUserIds.length === 0) {
          const watchersSnap = await db.collectionGroup('watchlist').where('listingId', '==', listingId).get();
          watcherUserIds = watchersSnap.docs
            .map((d) => extractUserIdFromWatchlistPath(d.ref.path))
            .filter(Boolean) as string[];
          if (watcherUserIds.length > 0) {
            logWarn('auctionEndingSoon: using legacy collectionGroup watchlist scan (scale warning)', { listingId });
          }
        }
      } catch (e: any) {
        // If watchlist schema differs, skip watchers (bidders will still get notified).
        logWarn('auctionEndingSoon: failed to load watchers', { listingId, error: String(e?.message || e) });
      }

      // Also include current high bidder if present
      const bidderId = typeof listing.currentBidderId === 'string' ? listing.currentBidderId : null;
      const targets = new Set<string>(watcherUserIds);
      if (bidderId) targets.add(bidderId);

      for (const threshold of matches) {
        for (const uid of Array.from(targets)) {
          const res = await emitAndProcessEventForUser({
            type: 'Auction.EndingSoon',
            actorId: null,
            entityType: 'listing',
            entityId: listingId,
            targetUserId: uid,
            payload: {
              type: 'Auction.EndingSoon',
              listingId,
              listingTitle,
              listingUrl,
              threshold: threshold.key,
              endsAt: endsAt.toISOString(),
              ...(typeof currentBidAmount === 'number' ? { currentBidAmount } : {}),
            },
            optionalHash: threshold.key,
          });
          if (res.ok && res.created) emitted++;
        }
      }
    }

    logInfo('auctionEndingSoon: completed', { scanned, emitted, skipped });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, emitted, skipped }) };
  } catch (e: any) {
    logError('auctionEndingSoon: fatal error', e, { scanned, emitted, skipped });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || 'Unknown error' }) };
  }
};

export const handler = schedule('*/5 * * * *', baseHandler);

