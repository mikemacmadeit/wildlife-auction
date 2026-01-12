/**
 * Firestore Orders Collection Helpers
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Order } from '@/lib/types';

/**
 * Order document as stored in Firestore
 */
export interface OrderDoc {
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  platformFee: number;
  sellerAmount: number;
  status: 'pending' | 'paid' | 'completed' | 'refunded' | 'cancelled';
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
}

/**
 * Convert Firestore OrderDoc to UI Order type
 */
function toOrder(docId: string, data: OrderDoc): Order {
  return {
    id: docId,
    listingId: data.listingId,
    buyerId: data.buyerId,
    sellerId: data.sellerId,
    amount: data.amount,
    platformFee: data.platformFee,
    sellerAmount: data.sellerAmount,
    status: data.status,
    stripeCheckoutSessionId: data.stripeCheckoutSessionId,
    stripePaymentIntentId: data.stripePaymentIntentId,
    stripeTransferId: data.stripeTransferId,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
    completedAt: data.completedAt?.toDate(),
  };
}

/**
 * Create an order document in Firestore
 */
export async function createOrder(data: {
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  platformFee: number;
  sellerAmount: number;
  stripeCheckoutSessionId?: string;
}): Promise<string> {
  const ordersRef = collection(db, 'orders');
  const orderRef = doc(ordersRef);

  const orderData: OrderDoc = {
    listingId: data.listingId,
    buyerId: data.buyerId,
    sellerId: data.sellerId,
    amount: data.amount,
    platformFee: data.platformFee,
    sellerAmount: data.sellerAmount,
    status: 'pending',
    stripeCheckoutSessionId: data.stripeCheckoutSessionId,
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
  };

  await setDoc(orderRef, orderData);
  return orderRef.id;
}

/**
 * Get an order by ID
 */
export async function getOrderById(orderId: string): Promise<Order | null> {
  const orderRef = doc(db, 'orders', orderId);
  const orderDoc = await getDoc(orderRef);

  if (!orderDoc.exists()) {
    return null;
  }

  return toOrder(orderDoc.id, orderDoc.data() as OrderDoc);
}

/**
 * Get an order by Stripe checkout session ID
 */
export async function getOrderByCheckoutSessionId(
  checkoutSessionId: string
): Promise<Order | null> {
  const ordersRef = collection(db, 'orders');
  const q = query(ordersRef, where('stripeCheckoutSessionId', '==', checkoutSessionId));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const orderDoc = snapshot.docs[0];
  return toOrder(orderDoc.id, orderDoc.data() as OrderDoc);
}

/**
 * Update an order
 */
export async function updateOrder(
  orderId: string,
  updates: Partial<OrderDoc>
): Promise<void> {
  const orderRef = doc(db, 'orders', orderId);
  await updateDoc(orderRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Mark an order as paid and completed
 */
export async function markOrderAsPaid(
  orderId: string,
  stripePaymentIntentId?: string,
  stripeTransferId?: string
): Promise<void> {
  await updateOrder(orderId, {
    status: 'paid',
    stripePaymentIntentId,
    stripeTransferId,
    completedAt: serverTimestamp() as Timestamp,
  });
}

/**
 * Get orders for a user (as buyer or seller)
 */
export async function getOrdersForUser(
  userId: string,
  role: 'buyer' | 'seller' = 'buyer'
): Promise<Order[]> {
  const ordersRef = collection(db, 'orders');
  const q = query(
    ordersRef,
    where(role === 'buyer' ? 'buyerId' : 'sellerId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => toOrder(doc.id, doc.data() as OrderDoc));
}
