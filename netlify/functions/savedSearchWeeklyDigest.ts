/**
 * Netlify Scheduled Function: Saved Search Weekly Digest
 *
 * Runs weekly:
 * - Finds weekly saved searches
 * - Builds a small digest of matching listings from the last 7 days
 * - Emits Marketing.WeeklyDigest (marketing opt-in required by rules)
 */

import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { emitEventForUser } from '../../lib/notifications/emitEvent';
import { getSiteUrl } from '../../lib/site-url';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';
import { matchListingToSavedSearch } from '../../lib/search/matchListingToSavedSearch';

const MAX_SEARCHES_PER_RUN = 500;
const MAX_LISTINGS_PER_SEARCH = 25;

function extractUserIdFromSavedSearchPath(path: string): string | null {
  const parts = path.split('/');
  const usersIdx = parts.indexOf('users');
  if (usersIdx >= 0 && parts.length > usersIdx + 1) return parts[usersIdx + 1] || null;
  return null;
}

const baseHandler: Handler = async () => {
  const db = getAdminDb();
  const now = new Date();
  const nowTs = Timestamp.fromDate(now);
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const cutoffTs = Timestamp.fromDate(cutoff);
  const siteUrl = getSiteUrl();

  let scannedSearches = 0;
  let emitted = 0;

  try {
    const searchesSnap = await db.collectionGroup('savedSearches').where('alertFrequency', '==', 'weekly').limit(MAX_SEARCHES_PER_RUN).get();
    scannedSearches = searchesSnap.size;

    for (const ssDoc of searchesSnap.docs) {
      const userId = extractUserIdFromSavedSearchPath(ssDoc.ref.path);
      if (!userId) continue;

      const searchId = ssDoc.id;
      const ss = ssDoc.data() as any;
      const criteria = ss.criteria || {};

      // Build a narrowed listings query when possible.
      let q: FirebaseFirestore.Query = db.collection('listings').where('status', '==', 'active').where('createdAt', '>=', cutoffTs);
      if (criteria.type) q = q.where('type', '==', criteria.type);
      if (criteria.category) q = q.where('category', '==', criteria.category);
      if (criteria.location?.state) q = q.where('location.state', '==', criteria.location.state);
      q = q.orderBy('createdAt', 'desc').limit(MAX_LISTINGS_PER_SEARCH);

      const listingsSnap = await q.get();
      const matches: Array<{ listingId: string; title: string; url: string; price?: number; endsAt?: string }> = [];

      for (const listingDoc of listingsSnap.docs) {
        const listingId = listingDoc.id;
        const listing = listingDoc.data() as any;
        if (!matchListingToSavedSearch(listing, criteria)) continue;
        matches.push({
          listingId,
          title: String(listing.title || 'Listing'),
          url: `${siteUrl}/listing/${listingId}`,
          price: typeof listing.price === 'number' ? listing.price : typeof listing.currentBid === 'number' ? listing.currentBid : undefined,
          endsAt: listing.endsAt?.toDate ? listing.endsAt.toDate().toISOString() : undefined,
        });
        if (matches.length >= 10) break;
      }

      if (matches.length === 0) continue;

      try {
        const weekKey = `${cutoff.toISOString().slice(0, 10)}`; // YYYY-MM-DD
        const res = await emitEventForUser({
          type: 'Marketing.WeeklyDigest',
          actorId: 'system',
          entityType: 'system',
          entityId: searchId,
          targetUserId: userId,
          payload: {
            type: 'Marketing.WeeklyDigest',
            userId,
            listings: matches,
            channels: { email: true },
          },
          optionalHash: `savedSearchWeekly:${searchId}:${weekKey}`,
        });
        if (res.ok) emitted += res.created ? 1 : 0;

        await db.collection('users').doc(userId).collection('savedSearches').doc(searchId).set(
          { lastNotifiedAt: nowTs, updatedAt: nowTs },
          { merge: true }
        );
      } catch (e) {
        logWarn('savedSearchWeeklyDigest: emit failed', { userId, searchId, error: String(e) });
      }
    }

    logInfo('savedSearchWeeklyDigest: done', { scannedSearches, emitted });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scannedSearches, emitted }) };
  } catch (e) {
    logError('savedSearchWeeklyDigest: fatal', e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String((e as any)?.message || e) }) };
  }
};

// Mondays at 12:10pm UTC (safe default; adjust as needed)
export const handler = schedule('10 12 * * 1', baseHandler);

