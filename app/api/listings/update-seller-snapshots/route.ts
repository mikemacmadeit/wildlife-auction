/**
 * POST /api/listings/update-seller-snapshots
 * 
 * Updates sellerSnapshot.displayName on all listings for the authenticated user
 * when their displayNamePreference or businessName changes.
 * Updates all non-draft, non-removed listings to ensure consistency across all visible listings.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { json, requireAuth } from '../../offers/_util';

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const userId = auth.decoded.uid;
  const db = getAdminDb();

  try {
    // Try to get display name from request body first (to avoid race conditions with Firestore updates)
    // If not provided, fall back to reading from Firestore
    let displayName: string | null = null;
    
    // Read request body once (if it exists)
    let requestBody: any = {};
    try {
      const bodyText = await request.text();
      if (bodyText) {
        requestBody = JSON.parse(bodyText);
        if (requestBody?.displayName && typeof requestBody.displayName === 'string') {
          displayName = requestBody.displayName.trim();
        }
      }
    } catch {
      // Request body parsing failed or no body, continue to Firestore read
    }

    // Always read user profile to get complete sellerSnapshot data and verify displayName
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const displayNamePreference = userData?.profile?.preferences?.displayNamePreference || 'personal';
    
    // Always recalculate displayName from Firestore to ensure it matches current preference
    // This ensures consistency even if the request body has stale data
    let calculatedDisplayName: string;
    if (displayNamePreference === 'business' && userData?.profile?.businessName?.trim()) {
      calculatedDisplayName = String(userData.profile.businessName).trim();
    } else {
      calculatedDisplayName =
        (userData?.displayName && String(userData.displayName)) ||
        (userData?.profile?.fullName && String(userData.profile.fullName)) ||
        userData?.email?.split('@')[0] ||
        'Seller';
    }
    
    // Use calculated displayName (from Firestore) to ensure it's always correct
    // The request body displayName is just a hint to avoid race conditions, but we verify against Firestore
    displayName = calculatedDisplayName;
    
    // Get other sellerSnapshot fields from user profile for complete update
    const sellerVerified = userData?.seller?.verified === true || userData?.verified === true;
    const photoURL = typeof userData?.photoURL === 'string' && userData.photoURL.trim().length > 0 
      ? String(userData.photoURL) 
      : null;
    
    // Get completed sales count and badges from publicSellerTrust (read once)
    let completedSalesCount = 0;
    let badges: string[] = [];
    try {
      const trustDoc = await db.collection('publicSellerTrust').doc(userId).get();
      if (trustDoc.exists) {
        const trustData = trustDoc.data();
        completedSalesCount = typeof trustData?.completedSalesCount === 'number' ? trustData.completedSalesCount : 0;
        badges = Array.isArray(trustData?.badgeIds) ? trustData?.badgeIds : [];
      }
    } catch {
      // Best effort - use defaults if we can't read it
    }

    // Get ALL listings for this user (regardless of status) - update all to ensure consistency
    // This ensures that when a user toggles the business name preference, ALL their listings
    // (including drafts, removed, etc.) are updated immediately
    const listingsRef = db.collection('listings');
    
    // Query ALL listings by sellerId (no status filter) to update every single listing
    // We'll fetch a large batch and process them
    let allDocs: any[] = [];
    
    try {
      // Query all listings by sellerId (no status filter) - use orderBy to enable pagination
      // Note: This requires a Firestore index on (sellerId, createdAt) or (sellerId, updatedAt)
      // If the index doesn't exist, we'll fall back to status-based queries
      let query = listingsRef.where('sellerId', '==', userId).orderBy('updatedAt', 'desc').limit(1000);
      let snapshot = await query.get();
      allDocs = snapshot.docs;
      
      // If we got 1000 results, there might be more - fetch remaining in batches
      while (snapshot.docs.length === 1000) {
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        const nextQuery = listingsRef
          .where('sellerId', '==', userId)
          .orderBy('updatedAt', 'desc')
          .startAfter(lastDoc)
          .limit(1000);
        const nextSnapshot = await nextQuery.get();
        
        if (nextSnapshot.docs.length > 0) {
          allDocs.push(...nextSnapshot.docs);
          snapshot = nextSnapshot;
        } else {
          break;
        }
      }
    } catch (error: any) {
      console.warn('[update-seller-snapshots] Query with orderBy failed, trying without orderBy:', error);
      // If orderBy query fails (e.g., missing index), try without orderBy
      try {
        const query = listingsRef.where('sellerId', '==', userId).limit(1000);
        const snapshot = await query.get();
        allDocs = snapshot.docs;
        
        // Paginate if needed (without orderBy, we can't use startAfter reliably, so just get first 1000)
        // For most users, 1000 listings should be enough. If they have more, they'll need to run this multiple times
        // or we can implement a more sophisticated pagination strategy
      } catch (fallbackError: any) {
        console.error('[update-seller-snapshots] Query failed:', fallbackError);
        // Last resort: try querying by individual statuses
        const statusesToUpdate: string[] = ['active', 'pending', 'sold', 'ended', 'expired', 'draft', 'removed'];
        try {
          const queries = statusesToUpdate.map(status => 
            listingsRef.where('sellerId', '==', userId).where('status', '==', status).limit(500).get()
          );
          const results = await Promise.all(queries);
          results.forEach(snapshot => allDocs.push(...snapshot.docs));
        } catch (finalError) {
          console.error('[update-seller-snapshots] All query strategies failed:', finalError);
          return json({ ok: false, error: 'Failed to query listings', message: String(fallbackError?.message || finalError) }, { status: 500 });
        }
      }
    }
    
    // Remove duplicates (in case a listing appears in multiple queries)
    const uniqueDocs = Array.from(
      new Map(allDocs.map(doc => [doc.id, doc])).values()
    );
    
    if (uniqueDocs.length === 0) {
      return json({ ok: true, updated: 0, message: 'No listings to update' });
    }

    console.log(`[update-seller-snapshots] Found ${uniqueDocs.length} listings for user ${userId}, target displayName: ${displayName}`);

    // Update each listing's sellerSnapshot.displayName
    // Firestore batch limit is 500, but we'll process in batches of 400 to be safe
    const BATCH_SIZE = 400;
    let totalUpdateCount = 0;
    
    for (let i = 0; i < uniqueDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const batchDocs = uniqueDocs.slice(i, i + BATCH_SIZE);
      let batchUpdateCount = 0;

      batchDocs.forEach((doc) => {
        const listingData = doc.data();
        const currentDisplayName = listingData.sellerSnapshot?.displayName;
        const listingId = doc.id;
        const listingStatus = listingData.status;
        
        // Always update ALL listings when this API is called
        // This ensures that when a user toggles the business name preference,
        // ALL their listings are updated immediately, regardless of current state
        const existingSnapshot = listingData.sellerSnapshot || {};
        
        // Always update to ensure consistency - this is critical when toggling preferences
        // Use the latest data from user profile to ensure all sellerSnapshot fields are up to date
        batch.update(doc.ref, {
          sellerSnapshot: {
            displayName: displayName, // Always use the calculated displayName
            verified: sellerVerified, // Use current verification status
            photoURL: photoURL, // Use current photo URL
            completedSalesCount: completedSalesCount, // Use current sales count
            badges: badges, // Use current badges
            // Preserve any other fields that might exist
            ...(existingSnapshot.updatedAt ? { updatedAt: existingSnapshot.updatedAt } : {}),
          },
          updatedAt: Timestamp.now(),
        });
        batchUpdateCount++;
        console.log(`[update-seller-snapshots] Updating listing ${listingId} (status: ${listingStatus}) from "${currentDisplayName || 'none'}" to "${displayName}"`);
      });

      if (batchUpdateCount > 0) {
        await batch.commit();
        totalUpdateCount += batchUpdateCount;
        console.log(`[update-seller-snapshots] Committed batch: ${batchUpdateCount} listings updated`);
      }
    }

    console.log(`[update-seller-snapshots] Completed: ${totalUpdateCount} updated out of ${uniqueDocs.length} total listings`);

    return json({ 
      ok: true, 
      updated: totalUpdateCount,
      displayName,
      message: `Updated ${totalUpdateCount} listing${totalUpdateCount !== 1 ? 's' : ''}` 
    });
  } catch (error: any) {
    console.error('[listings/update-seller-snapshots] Error:', error);
    return json(
      { ok: false, error: 'Failed to update listings', message: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
