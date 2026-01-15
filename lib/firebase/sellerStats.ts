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
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
/**
 * Get seller statistics including completed sales count and completion rate
 */
export async function getSellerStats(sellerId: string): Promise<{
  completedSalesCount: number;
  completionRate: number;
}> {
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
    };
  } catch (error) {
    console.error('Error fetching seller stats:', error);
    return {
      completedSalesCount: 0,
      completionRate: 0,
    };
  }
}