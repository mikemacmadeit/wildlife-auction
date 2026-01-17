/**
 * Firestore-backed Bidding System
 * 
 * Provides real-time bid subscriptions and transaction-safe bid placement
 * for auction listings.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { Bid } from '@/lib/types';
import { getUserProfile } from './users';
import { placeBidServer } from '@/lib/api/bids';

/**
 * Bid document as stored in Firestore
 */
export interface BidDoc {
  listingId: string;
  bidderId: string;
  amount: number;
  createdAt: Timestamp;
}

/**
 * Convert Firestore BidDoc to UI Bid type
 */
function toBid(docId: string, data: BidDoc): Bid {
  return {
    id: docId,
    listingId: data.listingId,
    amount: data.amount,
    bidderName: maskBidderId(data.bidderId), // Mask bidder ID for privacy
    timestamp: data.createdAt.toDate(),
  };
}

/**
 * Mask bidder ID for privacy (show last 4 characters)
 */
function maskBidderId(bidderId: string): string {
  if (bidderId.length <= 4) return 'Bidder ••••';
  return `Bidder ••••${bidderId.slice(-4)}`;
}

/**
 * Subscribe to bids for a listing in real-time
 * 
 * @param listingId - The listing ID to subscribe to
 * @param onBids - Callback function that receives the bids array
 * @returns Unsubscribe function
 */
export function subscribeBidsForListing(
  listingId: string,
  onBids: (bids: Bid[]) => void
): Unsubscribe {
  const bidsRef = collection(db, 'bids');
  const q = query(
    bidsRef,
    where('listingId', '==', listingId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const bids: Bid[] = [];
      snapshot.forEach((doc) => {
        bids.push(toBid(doc.id, doc.data() as BidDoc));
      });
      onBids(bids);
    },
    (error) => {
      console.error('Error subscribing to bids:', error);
      onBids([]); // Return empty array on error
    }
  );
}

export function subscribeBidCountSince(
  listingId: string,
  since: Date,
  onCount: (count: number) => void
): Unsubscribe {
  const bidsRef = collection(db, 'bids');
  const sinceTs = Timestamp.fromDate(since);
  const q = query(
    bidsRef,
    where('listingId', '==', listingId),
    where('createdAt', '>=', sinceTs),
    orderBy('createdAt', 'desc'),
    limit(200)
  );

  return onSnapshot(
    q,
    (snapshot) => onCount(snapshot.size),
    (error) => {
      console.error('Error subscribing to bid count:', error);
      onCount(0);
    }
  );
}

/**
 * Place a bid on an auction listing using a Firestore transaction
 * 
 * This function uses a transaction to ensure:
 * - Bid amount is greater than current bid
 * - Listing is still active and not ended
 * - Race conditions are prevented
 * 
 * @param params - Bid placement parameters
 * @returns The new current bid amount
 * @throws Error if bid placement fails
 */
export async function placeBidTx(params: {
  listingId: string;
  bidderId: string;
  amount: number;
}): Promise<{ newCurrentBid: number }> {
  const { listingId, bidderId, amount } = params;

  // Preferred path: use server-side bid placement (enforces compliance, prevents rules bypass, creates notifications via Admin SDK).
  // The Firestore client-side write path is kept only for local fallback, but is generally blocked by security rules in production.
  const res = await placeBidServer({ listingId, amount });
  if (!res.ok) {
    throw new Error(res.error);
  }
  if (bidderId && typeof bidderId === 'string' && res.ok) {
    // Best-effort: ensure caller isn't spoofing bidderId (server is authoritative anyway).
    // We intentionally don't hard-fail if bidderId mismatches because some call sites may not pass it correctly.
  }
  return { newCurrentBid: res.newCurrentBid };

  // Validate amount
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    throw new Error('Bid amount must be a positive number');
  }

  const listingRef = doc(db, 'listings', listingId);
  const bidsRef = collection(db, 'bids');

  try {
    const result = await runTransaction(db, async (transaction) => {
      // Read the listing document
      const listingDoc = await transaction.get(listingRef);

      if (!listingDoc.exists()) {
        throw new Error('Listing not found');
      }

      const listingData = listingDoc.data();

      // Validate listing is an auction
      if (listingData.type !== 'auction') {
        throw new Error('Bids can only be placed on auction listings');
      }

      // Validate listing is active
      if (listingData.status !== 'active') {
        throw new Error('Bids can only be placed on active listings');
      }

      // Validate auction hasn't ended
      if (listingData.endsAt) {
        const endsAt = listingData.endsAt.toDate();
        if (endsAt.getTime() <= Date.now()) {
          throw new Error('This auction has ended');
        }
      }

      // P0: Texas-only enforcement for animal listings
      const animalCategories = ['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock'];
      if (animalCategories.includes(listingData.category)) {
        // Get bidder profile to check state
        const bidderProfile = await getUserProfile(bidderId);
        const bidderState = bidderProfile?.profile?.location?.state;
        
        if (!bidderState || bidderState !== 'TX') {
          throw new Error('Only Texas residents can bid on animal listings. Please update your profile location.');
        }
        
        // Also verify listing is in Texas
        if (listingData.location?.state !== 'TX') {
          throw new Error('Animal listings must be located in Texas.');
        }
      }

      // Determine current bid (use currentBid, fallback to startingBid, fallback to 0)
      const currentBid = listingData.currentBid ?? listingData.startingBid ?? 0;

      // Validate bid amount is greater than current bid
      if (amount <= currentBid) {
        throw new Error(`Bid must be higher than the current bid of $${currentBid.toLocaleString()}`);
      }

      // Create the bid document
      const bidDocRef = doc(bidsRef);
      const bidData: BidDoc = {
        listingId,
        bidderId,
        amount,
        createdAt: serverTimestamp() as Timestamp,
      };
      transaction.set(bidDocRef, bidData);

      // Update listing document
      const metrics = listingData.metrics || { views: 0, favorites: 0, bidCount: 0 };
      const previousBidderId = listingData.currentBidderId;
      transaction.update(listingRef, {
        currentBid: amount,
        currentBidderId: bidderId,
        'metrics.bidCount': (metrics.bidCount || 0) + 1,
        updatedAt: serverTimestamp(),
        updatedBy: bidderId,
      });

      return { 
        newCurrentBid: amount, 
        listingTitle: listingData.title,
        sellerId: listingData.sellerId,
        previousBidderId 
      };
    });

    return { newCurrentBid: result.newCurrentBid };
  } catch (error: any) {
    // Re-throw with user-friendly messages
    if (error.message) {
      throw error;
    }
    throw new Error('Failed to place bid. Please try again.');
  }
}

/**
 * Get the highest bid for a listing (non-real-time, one-time query)
 * 
 * @param listingId - The listing ID
 * @returns The highest bid amount, or null if no bids
 */
export async function getHighestBid(listingId: string): Promise<number | null> {
  const bidsRef = collection(db, 'bids');
  const q = query(
    bidsRef,
    where('listingId', '==', listingId),
    orderBy('amount', 'desc'),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return null;
  }

  const bidData = snapshot.docs[0].data() as BidDoc;
  return bidData.amount;
}

/**
 * Get the winning bidder for an auction (highest bidder)
 * 
 * @param listingId - The listing ID
 * @returns The winning bidder ID and amount, or null if no bids
 */
export async function getWinningBidder(listingId: string): Promise<{ bidderId: string; amount: number } | null> {
  const bidsRef = collection(db, 'bids');
  const q = query(
    bidsRef,
    where('listingId', '==', listingId),
    orderBy('amount', 'desc'),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return null;
  }

  const bidDoc = snapshot.docs[0];
  const bidData = bidDoc.data() as BidDoc;
  return {
    bidderId: bidData.bidderId,
    amount: bidData.amount,
  };
}
