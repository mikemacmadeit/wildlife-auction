/**
 * POST /api/listings/update-seller-snapshots
 * 
 * Updates sellerSnapshot.displayName on all active listings for the authenticated user
 * when their displayNamePreference or businessName changes.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { json, requireAuth } from '../_util';

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;

  const userId = auth.decoded.uid;
  const db = getAdminDb();

  try {
    // Get the current user profile to determine the correct display name
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return json({ ok: false, error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const displayNamePreference = userData?.profile?.preferences?.displayNamePreference || 'personal';
    
    // Determine display name based on preference
    let displayName: string;
    if (displayNamePreference === 'business' && userData?.profile?.businessName?.trim()) {
      displayName = String(userData.profile.businessName).trim();
    } else {
      displayName =
        (userData?.displayName && String(userData.displayName)) ||
        (userData?.profile?.fullName && String(userData.profile.fullName)) ||
        userData?.email?.split('@')[0] ||
        'Seller';
    }

    // Get all active listings for this user
    const listingsRef = db.collection('listings');
    const activeListingsQuery = listingsRef
      .where('sellerId', '==', userId)
      .where('status', '==', 'active');

    const snapshot = await activeListingsQuery.get();
    
    if (snapshot.empty) {
      return json({ ok: true, updated: 0, message: 'No active listings to update' });
    }

    // Update each listing's sellerSnapshot.displayName
    const batch = db.batch();
    let updateCount = 0;

    snapshot.docs.forEach((doc) => {
      const listingData = doc.data();
      // Only update if the display name has actually changed
      if (listingData.sellerSnapshot?.displayName !== displayName) {
        batch.update(doc.ref, {
          'sellerSnapshot.displayName': displayName,
          updatedAt: Timestamp.now(),
        });
        updateCount++;
      }
    });

    if (updateCount > 0) {
      await batch.commit();
    }

    return json({ 
      ok: true, 
      updated: updateCount,
      displayName,
      message: `Updated ${updateCount} listing${updateCount !== 1 ? 's' : ''}` 
    });
  } catch (error: any) {
    console.error('[listings/update-seller-snapshots] Error:', error);
    return json(
      { ok: false, error: 'Failed to update listings', message: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
