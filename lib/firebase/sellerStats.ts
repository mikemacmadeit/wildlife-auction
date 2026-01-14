/**
 * Seller Stats Helpers
 * 
 * Computes seller statistics including plan savings
 */

import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Order } from '@/lib/types';

/**
 * Calculate plan savings for a seller
 * Compares actual fees paid vs what would have been paid on Free plan (7%)
 */
export async function calculatePlanSavings(
  sellerId: string,
  days: number = 30
): Promise<{
  feesPaid: number; // Actual fees paid in last N days
  feesIfFree: number; // Fees that would have been paid on Free plan (7%)
  savings: number; // Savings amount (feesIfFree - feesPaid)
  ordersCount: number; // Number of orders in period
  planBreakdown: {
    free: { count: number; fees: number };
    pro: { count: number; fees: number };
    elite: { count: number; fees: number };
    unknown: { count: number; fees: number };
  };
}> {
  try {
    // Calculate date range
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Query orders for seller, then filter client-side by paidAt window + status.
    //
    // Why: Firestore requires a composite index for (sellerId + paidAt), and the app
    // should not hard-fail if that index isn't created yet. This keeps the UI working
    // without requiring immediate index creation.
    //
    // Tradeoff: For high-volume sellers, this reads more docs. If/when this becomes
    // hot, create the composite index and switch back to server-side filtering.
    const ordersRef = collection(db, 'orders');
    const ordersQuery = query(
      ordersRef,
      where('sellerId', '==', sellerId)
    );

    const snapshot = await getDocs(ordersQuery);

    let feesPaid = 0;
    let feesIfFree = 0;
    let ordersCount = 0;
    const planBreakdown = {
      free: { count: 0, fees: 0 },
      pro: { count: 0, fees: 0 },
      elite: { count: 0, fees: 0 },
      unknown: { count: 0, fees: 0 },
    };

    snapshot.forEach((doc) => {
      const orderData = doc.data();

      // Filter by paidAt window client-side
      const paidAtRaw = orderData.paidAt;
      const paidAt: Date | null =
        paidAtRaw?.toDate?.() ||
        (paidAtRaw instanceof Date ? paidAtRaw : null);

      if (!paidAt || paidAt.getTime() < startDate.getTime()) {
        return;
      }
      
      // Filter by status client-side (Firestore 'in' query requires composite index)
      const status = orderData.status;
      if (!['paid', 'completed', 'ready_to_release'].includes(status)) {
        return; // Skip orders that don't have fees yet
      }

      // Get actual fee paid (use snapshot if available, otherwise calculate)
      const actualFee = orderData.platformFeeAmount || orderData.platformFee || 0;
      const orderAmount = orderData.amount || 0;

      // Calculate what fee would have been on Free plan (7%)
      const feeIfFree = orderAmount * 0.07;

      feesPaid += actualFee;
      feesIfFree += feeIfFree;
      ordersCount++;

      // Track by plan snapshot
      const planSnapshot = orderData.sellerPlanSnapshot || 'unknown';
      if (planSnapshot === 'free') {
        planBreakdown.free.count++;
        planBreakdown.free.fees += actualFee;
      } else if (planSnapshot === 'pro') {
        planBreakdown.pro.count++;
        planBreakdown.pro.fees += actualFee;
      } else if (planSnapshot === 'elite') {
        planBreakdown.elite.count++;
        planBreakdown.elite.fees += actualFee;
      } else {
        planBreakdown.unknown.count++;
        planBreakdown.unknown.fees += actualFee;
      }
    });

    const savings = Math.max(0, feesIfFree - feesPaid); // Savings cannot be negative

    return {
      feesPaid,
      feesIfFree,
      savings,
      ordersCount,
      planBreakdown,
    };
  } catch (error) {
    console.error('Error calculating plan savings:', error);
    // Return empty stats on error
    return {
      feesPaid: 0,
      feesIfFree: 0,
      savings: 0,
      ordersCount: 0,
      planBreakdown: {
        free: { count: 0, fees: 0 },
        pro: { count: 0, fees: 0 },
        elite: { count: 0, fees: 0 },
        unknown: { count: 0, fees: 0 },
      },
    };
  }
}

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