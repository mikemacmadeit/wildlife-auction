/**
 * Seller Stats Helpers
 * 
 * Computes seller statistics for seller profile modules.
 */

import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from './config';
/**
 * Get seller statistics including completed sales count and completion rate
 */
export async function getSellerStats(
  sellerId: string,
  viewerId?: string | null
): Promise<{
  completedSalesCount: number;
  completionRate: number;
  visible: boolean;
}> {
  // Privacy + rules: only the seller (or admin) can read seller orders.
  // Listing pages are public, so avoid noisy permission errors for buyers/anon users.
  if (!viewerId || viewerId !== sellerId) {
    return { completedSalesCount: 0, completionRate: 0, visible: false };
  }

  try {
    const ordersRef = collection(db, 'orders');
    const sellerOrdersQuery = query(
      ordersRef,
      where('sellerId', '==', sellerId)
    );
    
    const snapshot = await getDocs(sellerOrdersQuery);
    
    let completedCount = 0;
    let totalCount = 0;
    
    snapshot.forEach((doc) => {
      const orderData = doc.data();
      totalCount++;
      if (orderData.status === 'completed' || orderData.status === 'accepted') {
        completedCount++;
      }
    });
    
    const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
    
    return {
      completedSalesCount: completedCount,
      completionRate: Math.round(completionRate * 10) / 10, // Round to 1 decimal place
      visible: true,
    };
  } catch (error) {
    // Don't spam console on public listing pages; treat as "not available".
    return {
      completedSalesCount: 0,
      completionRate: 0,
      visible: false,
    };
  }
}