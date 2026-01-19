/**
 * Netlify Scheduled Function: Expire Unpaid Auctions + Auto-Relist
 *
 * Scans AuctionResults that are:
 * - status == ended_winner_pending_payment
 * - paymentDueAt <= now
 *
 * Then, transactionally:
 * - Marks AuctionResult -> ended_relisted (records unpaidExpiredAt + relistedToListingId)
 * - Clears any stale purchase reservation on the old listing
 * - Creates a NEW listing document (new ID) for a clean auction cycle (no old bids)
 *
 * Notes:
 * - We do not delete old listings or bids (audit trail).
 * - Relist uses a new listingId so bid history does not leak across cycles.
 */
import { Handler, schedule } from '@netlify/functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';

const MAX_PER_RUN = 50;
const TIME_BUDGET_MS = 45_000;

function toMillis(v: any): number | null {
  if (!v) return null;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.toDate === 'function') {
    const d = v.toDate();
    return d instanceof Date && Number.isFinite(d.getTime()) ? d.getTime() : null;
  }
  return null;
}

const baseHandler: Handler = async () => {
  const requestId = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const start = Date.now();
  const db = getAdminDb();
  const nowTs = Timestamp.now();

  let scanned = 0;
  let expired = 0;
  let relisted = 0;
  let noops = 0;
  let errors = 0;

  try {
    // This requires an index on (status, paymentDueAt).
    const snap = await db
      .collection('auctionResults')
      .where('status', '==', 'ended_winner_pending_payment')
      .where('paymentDueAt', '<=', nowTs)
      .orderBy('paymentDueAt', 'asc')
      .limit(MAX_PER_RUN)
      .get();

    scanned = snap.size;
    if (snap.empty) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, expired, relisted, noops, errors }) };
    }

    for (const doc of snap.docs) {
      if (Date.now() - start > TIME_BUDGET_MS) {
        logWarn('expireUnpaidAuctions: time budget reached; exiting early', {
          requestId,
          route: 'expireUnpaidAuctions',
          scanned,
          expired,
          relisted,
          noops,
          errors,
        });
        break;
      }

      const listingId = doc.id;
      const resultRef = db.collection('auctionResults').doc(listingId);
      const oldListingRef = db.collection('listings').doc(listingId);
      const newListingRef = db.collection('listings').doc(); // new auction cycle
      const relistedToListingId = newListingRef.id;

      try {
        const outcome = await db.runTransaction(async (tx) => {
          const [resultSnap, listingSnap] = await Promise.all([tx.get(resultRef), tx.get(oldListingRef)]);
          if (!resultSnap.exists) {
            return 'noop_missing_result' as const;
          }
          const ar = resultSnap.data() as any;
          if (String(ar?.status || '') !== 'ended_winner_pending_payment') {
            return 'noop_not_pending' as const;
          }
          const dueMs = toMillis(ar?.paymentDueAt);
          if (!dueMs || dueMs > nowTs.toMillis()) {
            return 'noop_not_due' as const;
          }
          if (!listingSnap.exists) {
            // AuctionResult exists but listing missing; mark expired only.
            tx.set(
              resultRef,
              { status: 'ended_unpaid_expired', unpaidExpiredAt: nowTs, updatedAt: nowTs },
              { merge: true }
            );
            return 'expired_only' as const;
          }

          const listing = listingSnap.data() as any;
          const sellerId = String(listing?.sellerId || ar?.sellerId || '');
          if (!sellerId) throw new Error('Missing sellerId');

          const oldEndsAtMs = toMillis(listing?.endsAt);
          const baseMs = toMillis(listing?.publishedAt) || toMillis(listing?.createdAt) || null;
          const durationMs =
            typeof oldEndsAtMs === 'number' && typeof baseMs === 'number' && oldEndsAtMs > baseMs
              ? oldEndsAtMs - baseMs
              : null;
          if (!durationMs) throw new Error('Cannot compute original auction duration');

          const newEndsAt = Timestamp.fromMillis(nowTs.toMillis() + durationMs);

          // Create a new listing cycle. Copy safe fields; reset bid runtime state + reservations.
          tx.set(newListingRef, {
            // Core identity
            title: listing?.title || 'Listing',
            description: listing?.description || '',
            type: 'auction',
            category: listing?.category || '',
            subcategory: typeof listing?.subcategory === 'string' ? listing.subcategory : FieldValue.delete(),
            location: listing?.location || { city: '', state: 'TX' },
            trust: listing?.trust || { verified: false, insuranceAvailable: false, transportReady: false },
            attributes: listing?.attributes && typeof listing.attributes === 'object' ? listing.attributes : {},

            // Media
            images: Array.isArray(listing?.images) ? listing.images : [],
            ...(Array.isArray(listing?.photoIds) ? { photoIds: listing.photoIds } : {}),
            ...(Array.isArray(listing?.photos) ? { photos: listing.photos } : {}),
            ...(typeof listing?.coverPhotoId === 'string' ? { coverPhotoId: listing.coverPhotoId } : {}),

            // Pricing
            startingBid: typeof listing?.startingBid === 'number' ? listing.startingBid : undefined,
            reservePrice: typeof listing?.reservePrice === 'number' ? listing.reservePrice : undefined,
            // Ensure a fresh auction window
            endsAt: newEndsAt,
            // Clear bid runtime state
            currentBid: FieldValue.delete(),
            currentBidCents: FieldValue.delete(),
            currentBidderId: FieldValue.delete(),

            // Best offer is irrelevant for auctions; clear if present
            bestOfferEnabled: FieldValue.delete(),
            bestOfferMinPrice: FieldValue.delete(),
            bestOfferAutoAcceptPrice: FieldValue.delete(),
            bestOfferSettings: FieldValue.delete(),

            // Reservations cleared
            offerReservedByOfferId: FieldValue.delete(),
            offerReservedAt: FieldValue.delete(),
            purchaseReservedByOrderId: FieldValue.delete(),
            purchaseReservedAt: FieldValue.delete(),
            purchaseReservedUntil: FieldValue.delete(),

            // Status
            status: 'active',
            publishedAt: nowTs,

            // Seller snapshots (keep if present)
            sellerId,
            ...(listing?.sellerSnapshot ? { sellerSnapshot: listing.sellerSnapshot } : {}),
            ...(listing?.sellerTierSnapshot ? { sellerTierSnapshot: listing.sellerTierSnapshot } : {}),
            ...(listing?.sellerTierWeightSnapshot ? { sellerTierWeightSnapshot: listing.sellerTierWeightSnapshot } : {}),

            // Moderation/compliance (carry forward from a previously-active listing)
            ...(listing?.complianceStatus ? { complianceStatus: listing.complianceStatus } : {}),
            ...(listing?.internalFlags ? { internalFlags: listing.internalFlags } : {}),
            ...(listing?.internalFlagsNotes ? { internalFlagsNotes: listing.internalFlagsNotes } : {}),

            // Metrics reset
            metrics: { views: 0, favorites: 0, bidCount: 0 },
            watcherCount: FieldValue.delete(),

            // Audit
            createdAt: nowTs,
            updatedAt: nowTs,
            createdBy: sellerId,
            updatedBy: 'system',

            // Traceability
            relistedFromListingId: listingId,
          });

          // Clear stale reservation on old listing (if any), and record relist pointer.
          tx.set(
            oldListingRef,
            {
              purchaseReservedByOrderId: null,
              purchaseReservedAt: null,
              purchaseReservedUntil: null,
              relistedToListingId,
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: 'system',
            },
            { merge: true }
          );

          // Mark auction result as relisted (includes unpaid expiry).
          tx.set(
            resultRef,
            {
              status: 'ended_relisted',
              unpaidExpiredAt: nowTs,
              relistedToListingId,
              relistedAt: nowTs,
              finalizedBy: ar?.finalizedBy || 'system',
              finalizedVersion: ar?.finalizedVersion || 1,
            },
            { merge: true }
          );
          return 'relisted' as const;
        });

        if (outcome === 'relisted') {
          expired++;
          relisted++;
        } else if (outcome === 'expired_only') {
          expired++;
        } else {
          noops++;
        }
      } catch (e: any) {
        errors++;
        logWarn('expireUnpaidAuctions: failed to process auctionResult', {
          requestId,
          route: 'expireUnpaidAuctions',
          listingId,
          message: String(e?.message || e),
        });
      }
    }

    logInfo('expireUnpaidAuctions: completed', { requestId, route: 'expireUnpaidAuctions', scanned, expired, relisted, noops, errors });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, expired, relisted, noops, errors }) };
  } catch (e: any) {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    const looksLikeIndex = code === 'failed-precondition' || /requires an index/i.test(msg);
    if (looksLikeIndex) {
      logWarn('expireUnpaidAuctions: missing Firestore index; skipping run', { requestId, route: 'expireUnpaidAuctions', code, message: msg });
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: 'MISSING_INDEX' }) };
    }
    logError('expireUnpaidAuctions: fatal error', e, { requestId, route: 'expireUnpaidAuctions' });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: msg || 'Unknown error' }) };
  }
};

export const handler = schedule('*/5 * * * *', baseHandler);

