/**
 * Netlify Scheduled Function: Saved Search Instant Alerts
 *
 * Runs every 5 minutes:
 * - Finds listings created since last run
 * - Matches against users/{uid}/savedSearches via simple `keys` reverse-index
 * - Emits Marketing.SavedSearchAlert events (marketing opt-in required by rules)
 */

import { Handler, schedule } from '@netlify/functions';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { emitEventForUser } from '../../lib/notifications/emitEvent';
import { getSiteUrl } from '../../lib/site-url';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';
import { matchListingToSavedSearch } from '../../lib/search/matchListingToSavedSearch';

const STATE_DOC = 'savedSearchInstant';
const WINDOW_MINUTES = 5;
const MAX_LISTINGS_PER_RUN = 200;
const MAX_CANDIDATE_SEARCHES_PER_LISTING = 500;

function extractUserIdFromSavedSearchPath(path: string): string | null {
  // users/{uid}/savedSearches/{searchId}
  const parts = path.split('/');
  const usersIdx = parts.indexOf('users');
  if (usersIdx >= 0 && parts.length > usersIdx + 1) return parts[usersIdx + 1] || null;
  return null;
}

const baseHandler: Handler = async () => {
  const db = getAdminDb();
  const now = new Date();
  const nowTs = Timestamp.fromDate(now);
  const siteUrl = getSiteUrl();

  let scannedListings = 0;
  let matchedGroups = 0;
  let emitted = 0;

  try {
    const stateRef = db.collection('jobsState').doc(STATE_DOC);
    const stateSnap = await stateRef.get();
    const lastRunAt: Date | null = stateSnap.exists ? (stateSnap.data() as any)?.lastRunAt?.toDate?.() || null : null;
    const windowStart = lastRunAt || new Date(now.getTime() - WINDOW_MINUTES * 60_000);
    const startTs = Timestamp.fromDate(windowStart);

    const listingsSnap = await db
      .collection('listings')
      .where('status', '==', 'active')
      .where('createdAt', '>', startTs)
      .where('createdAt', '<=', nowTs)
      .orderBy('createdAt', 'asc')
      .limit(MAX_LISTINGS_PER_RUN)
      .get();

    scannedListings = listingsSnap.size;
    if (listingsSnap.empty) {
      await stateRef.set({ lastRunAt: nowTs }, { merge: true });
      return { statusCode: 200, body: JSON.stringify({ ok: true, scannedListings, matchedGroups, emitted }) };
    }

    // Group matches by (userId, searchId)
    const grouped = new Map<string, { userId: string; searchId: string; searchName: string; channels: any; hits: number }>();

    for (const listingDoc of listingsSnap.docs) {
      const listingId = listingDoc.id;
      const listing = listingDoc.data() as any;

      // Build listing keys (must match buildSavedSearchKeys() conventions)
      const listingKeys: string[] = [];
      if (listing.type) listingKeys.push(`type:${listing.type}`);
      if (listing.category) listingKeys.push(`category:${listing.category}`);
      if (listing.location?.state) listingKeys.push(`state:${listing.location.state}`);
      if (listing.attributes?.speciesId) listingKeys.push(`species:${listing.attributes.speciesId}`);
      if (listingKeys.length === 0) listingKeys.push('all');

      // Firestore array-contains-any supports up to 10 values.
      const queryKeys = listingKeys.slice(0, 10);

      const candidatesSnap = await db
        .collectionGroup('savedSearches')
        .where('keys', 'array-contains-any', queryKeys)
        .limit(MAX_CANDIDATE_SEARCHES_PER_LISTING)
        .get();

      for (const cand of candidatesSnap.docs) {
        const userId = extractUserIdFromSavedSearchPath(cand.ref.path);
        if (!userId) continue;
        const searchId = cand.id;
        const ss = cand.data() as any;
        if (ss.alertFrequency !== 'instant') continue;
        if (!ss.channels || (ss.channels.inApp !== true && ss.channels.push !== true && ss.channels.email !== true)) continue;

        if (!matchListingToSavedSearch(listing, ss.criteria || {})) continue;

        const key = `${userId}:${searchId}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.hits += 1;
        } else {
          grouped.set(key, {
            userId,
            searchId,
            searchName: String(ss.name || 'Saved search'),
            channels: ss.channels || {},
            hits: 1,
          });
        }
      }
    }

    matchedGroups = grouped.size;
    const bucket = Math.floor(now.getTime() / (WINDOW_MINUTES * 60_000));

    // NOTE: avoid relying on TS downlevel iteration for Map iterators.
    for (const g of Array.from(grouped.values())) {
      try {
        const searchUrl = `${siteUrl}/browse?savedSearchId=${encodeURIComponent(g.searchId)}`;
        const res = await emitEventForUser({
          type: 'Marketing.SavedSearchAlert',
          actorId: 'system',
          entityType: 'system',
          entityId: g.searchId,
          targetUserId: g.userId,
          payload: {
            type: 'Marketing.SavedSearchAlert',
            userId: g.userId,
            queryName: g.searchName,
            resultsCount: g.hits,
            searchUrl,
            channels: {
              inApp: g.channels?.inApp === true,
              push: g.channels?.push === true,
              email: g.channels?.email === true,
            },
          },
          optionalHash: `savedSearchInstant:${g.searchId}:${bucket}`,
        });
        if (res.ok) emitted += res.created ? 1 : 0;

        // Best-effort update lastNotifiedAt for this search to support UX + future throttling.
        await db.collection('users').doc(g.userId).collection('savedSearches').doc(g.searchId).set(
          { lastNotifiedAt: nowTs, updatedAt: nowTs },
          { merge: true }
        );
      } catch (e) {
        logWarn('savedSearchInstant: emit failed', { searchId: g.searchId, userId: g.userId, error: String(e) });
      }
    }

    await stateRef.set({ lastRunAt: nowTs }, { merge: true });
    logInfo('savedSearchInstant: done', { scannedListings, matchedGroups, emitted });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scannedListings, matchedGroups, emitted }) };
  } catch (e) {
    logError('savedSearchInstant: fatal', e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String((e as any)?.message || e) }) };
  }
};

export const handler = schedule('*/5 * * * *', baseHandler);

