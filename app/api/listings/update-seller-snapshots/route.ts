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

    // If display name wasn't provided in body, read from Firestore
    if (!displayName) {
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        return json({ ok: false, error: 'User not found' }, { status: 404 });
      }

      const userData = userDoc.data();
      const displayNamePreference = userData?.profile?.preferences?.displayNamePreference || 'personal';
      
      // Determine display name based on preference
      if (displayNamePreference === 'business' && userData?.profile?.businessName?.trim()) {
        displayName = String(userData.profile.businessName).trim();
      } else {
        displayName =
          (userData?.displayName && String(userData.displayName)) ||
          (userData?.profile?.fullName && String(userData.profile.fullName)) ||
          userData?.email?.split('@')[0] ||
          'Seller';
      }
    }

    // Get ALL listings for this user (not just active/pending - update all to ensure consistency)
    // This ensures that if a listing status changes later, it will still have the correct display name
    const listingsRef = db.collection('listings');
    
    // Query for listings by status - we'll query multiple statuses to get all visible listings
    // Statuses that appear on browse/homepage: active, pending, sold, ended, expired
    // We'll query these explicitly to avoid index issues
    const statusesToUpdate: string[] = ['active', 'pending', 'sold', 'ended', 'expired'];
    const allDocs: any[] = [];
    
    // Firestore 'in' operator supports up to 10 values, so we can query all statuses at once
    try {
      const statusQuery = listingsRef
        .where('sellerId', '==', userId)
        .where('status', 'in', statusesToUpdate);
      const statusSnapshot = await statusQuery.get();
      allDocs.push(...statusSnapshot.docs);
    } catch (error: any) {
      // If 'in' query fails (e.g., missing index), fall back to individual queries
      console.warn('[update-seller-snapshots] Status "in" query failed, falling back to individual queries:', error);
      const queries = statusesToUpdate.map(status => 
        listingsRef.where('sellerId', '==', userId).where('status', '==', status).get()
      );
      const results = await Promise.all(queries);
      results.forEach(snapshot => allDocs.push(...snapshot.docs));
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
        batch.update(doc.ref, {
          sellerSnapshot: {
            ...existingSnapshot,
            displayName: displayName,
            // Preserve other sellerSnapshot fields if they exist, otherwise set defaults
            verified: existingSnapshot.verified !== undefined ? existingSnapshot.verified : false,
            photoURL: existingSnapshot.photoURL || null,
            completedSalesCount: existingSnapshot.completedSalesCount !== undefined ? existingSnapshot.completedSalesCount : 0,
            badges: Array.isArray(existingSnapshot.badges) ? existingSnapshot.badges : [],
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
