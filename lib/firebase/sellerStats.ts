/**
 * Seller Stats Helpers
 *
 * Computes seller statistics from orders (completion rate, completed sales).
 * Uses the same completion definition as the app: transactionStatus === 'COMPLETED'
 * or legacy status completed/accepted/buyer_confirmed/ready_to_release.
 */

import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from './config';

/** Order counts as completed when transaction is COMPLETED (delivery checklist done, no refund/cancel). */
function isOrderCompleted(orderData: Record<string, unknown>): boolean {
  const tx = orderData.transactionStatus as string | undefined;
  if (tx === 'COMPLETED') return true;
  const s = orderData.status as string | undefined;
  return s === 'completed' || s === 'accepted' || s === 'buyer_confirmed' || s === 'ready_to_release';
}

/**
 * Get seller statistics from orders: completed sales count and completion rate.
 * Completion rate = (orders with status COMPLETED) / (all seller orders), as a percentage.
 */
export async function getSellerStats(
  sellerId: string,
  viewerId?: string | null
): Promise<{
  completedSalesCount: number;
  completionRate: number;
  totalOrders: number;
  visible: boolean;
}> {
  if (!viewerId || viewerId !== sellerId) {
    return { completedSalesCount: 0, completionRate: 0, totalOrders: 0, visible: false };
  }

  try {
    const ordersRef = collection(db, 'orders');
    const sellerOrdersQuery = query(
      ordersRef,
      where('sellerId', '==', sellerId)
    );

    const snapshot = await getDocs(sellerOrdersQuery);
    let completedCount = 0;
    const totalCount = snapshot.size;

    snapshot.forEach((doc) => {
      const orderData = doc.data() as Record<string, unknown>;
      if (isOrderCompleted(orderData)) completedCount++;
    });

    const completionRate =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 1000) / 10 : 0;

    return {
      completedSalesCount: completedCount,
      completionRate,
      totalOrders: totalCount,
      visible: true,
    };
  } catch {
    return {
      completedSalesCount: 0,
      completionRate: 0,
      totalOrders: 0,
      visible: false,
    };
  }
}