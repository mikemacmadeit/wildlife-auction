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
import type { Order, OrderListingSnapshot, OrderSellerSnapshot } from '@/lib/types';
import { normalizeFirestoreValue, assertNoCorruptValuesAfterNormalization } from './normalizeFirestoreValue';

/**
 * Order document as stored in Firestore
 */
export interface OrderDoc {
  listingId: string;
  offerId?: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  platformFee: number;
  sellerAmount: number;
  /**
   * Multi-quantity purchases (optional; back-compat: default 1).
   */
  quantity?: number;
  unitPrice?: number;
  status:
    | 'pending'
    | 'awaiting_bank_transfer'
    | 'awaiting_wire'
    | 'paid_held'
    | 'paid' // legacy
    | 'in_transit'
    | 'delivered'
    | 'buyer_confirmed'
    | 'accepted' // legacy
    | 'ready_to_release'
    | 'disputed'
    | 'completed'
    | 'refunded'
    | 'cancelled';
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeTransferId?: string;
  stripeRefundId?: string;
  sellerStripeAccountId?: string;
  releasedBy?: string;
  releasedAt?: Timestamp;
  refundedBy?: string;
  refundedAt?: Timestamp;
  refundReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  // Escrow workflow fields
  paidAt?: Timestamp;
  disputeDeadlineAt?: Timestamp;
  sellerPreparingAt?: Timestamp;
  inTransitAt?: Timestamp;
  deliveredAt?: Timestamp;
  acceptedAt?: Timestamp;
  disputedAt?: Timestamp;
  disputeReason?: string;
  disputeNotes?: string;
  deliveryProofUrls?: string[];
  adminHold?: boolean;
  lastUpdatedByRole?: 'buyer' | 'seller' | 'admin';
  // Protected Transaction fields
  deliveryConfirmedAt?: Timestamp;
  protectionStartAt?: Timestamp;
  protectionEndsAt?: Timestamp;
  buyerAcceptedAt?: Timestamp;
  disputeOpenedAt?: Timestamp;
  disputeReasonV2?: 'death' | 'serious_illness' | 'injury' | 'escape' | 'wrong_animal';
  disputeStatus?: 'none' | 'open' | 'needs_evidence' | 'under_review' | 'resolved_refund' | 'resolved_partial_refund' | 'resolved_release' | 'cancelled';
  disputeEvidence?: Array<{
    type: 'photo' | 'video' | 'vet_report' | 'delivery_doc' | 'tag_microchip';
    url: string;
    uploadedAt: Timestamp;
  }>;
  payoutHoldReason?: 'none' | 'protection_window' | 'dispute_open';
  protectedTransactionDaysSnapshot?: 7 | 14 | null;
  protectedTermsVersion?: string;

  // Bill of Sale / Written Transfer (attestation timestamps; server-authored)
  billOfSaleGeneratedAt?: Timestamp;
  billOfSaleBuyerSignedAt?: Timestamp;
  billOfSaleBuyerSignedBy?: string;
  billOfSaleSellerSignedAt?: Timestamp;
  billOfSaleSellerSignedBy?: string;

  // Order document compliance snapshot (server-computed)
  complianceDocsStatus?: {
    required: any[];
    provided: any[];
    missing: any[];
  };

  /**
   * Public-safe snapshots (server-authored) to avoid N+1 listing reads
   * on purchases/sales list views.
   */
  listingSnapshot?: OrderListingSnapshot;
  sellerSnapshot?: OrderSellerSnapshot;
  timeline?: Array<{
    id: string;
    type: any;
    label: string;
    timestamp: Timestamp | any;
    actor: any;
    visibility?: any;
    meta?: any;
  }>;
}

/**
 * Convert Firestore OrderDoc to UI Order type
 */
function toOrder(docId: string, data: OrderDoc): Order {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orders.ts:130',message:'toOrder entry',data:{docId,createdAtType:typeof data.createdAt,createdAtValue:data.createdAt,hasToDate:typeof data.createdAt?.toDate === 'function',isDate:data.createdAt instanceof Date,isPlainObject:data.createdAt && typeof data.createdAt === 'object' && 'seconds' in data.createdAt},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  const timeline =
    Array.isArray(data.timeline)
      ? data.timeline
          .map((e: any) => ({
            id: String(e?.id || ''),
            type: String(e?.type || ''),
            label: String(e?.label || ''),
            timestamp:
              typeof e?.timestamp?.toDate === 'function'
                ? e.timestamp.toDate()
                : e?.timestamp instanceof Date
                  ? e.timestamp
                  : new Date(0),
            actor: String(e?.actor || 'system'),
            visibility: e?.visibility ? String(e.visibility) : undefined,
            meta: e?.meta && typeof e.meta === 'object' ? e.meta : undefined,
          }))
          .filter((e: any) => e.id && e.type && e.label)
      : undefined;

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orders.ts:151',message:'Before createdAt conversion',data:{createdAtType:typeof data.createdAt,createdAtValue:data.createdAt,hasSeconds:data.createdAt && typeof (data.createdAt as any).seconds === 'number',hasNanoseconds:data.createdAt && typeof (data.createdAt as any).nanoseconds === 'number'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  // Helper to safely convert timestamp-like values to Date
  const toDateSafe = (value: any): Date => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orders.ts:toDateSafe',message:'toDateSafe called',data:{valueType:typeof value,isDate:value instanceof Date,hasToDate:typeof value?.toDate === 'function',hasSeconds:value && typeof value.seconds === 'number',hasNanoseconds:value && typeof value.nanoseconds === 'number'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (!value) return new Date(0);
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    // Handle normalized {seconds, nanoseconds} objects from normalizeFirestoreValue
    if (value && typeof value === 'object' && typeof value.seconds === 'number') {
      const ms = value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000;
      const result = new Date(ms);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'orders.ts:toDateSafe',message:'toDateSafe conversion success',data:{inputSeconds:value.seconds,inputNanoseconds:value.nanoseconds,outputMs:ms,outputDate:result.toISOString(),isValidDate:!isNaN(result.getTime())},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return result;
    }
    // Fallback
    return new Date(0);
  };

  return {
    id: docId,
    listingId: data.listingId,
    offerId: data.offerId,
    buyerId: data.buyerId,
    sellerId: data.sellerId,
    amount: data.amount,
    platformFee: data.platformFee,
    sellerAmount: data.sellerAmount,
    quantity: typeof (data as any).quantity === 'number' ? (data as any).quantity : undefined,
    unitPrice: typeof (data as any).unitPrice === 'number' ? (data as any).unitPrice : undefined,
    status: data.status,
    stripeCheckoutSessionId: data.stripeCheckoutSessionId,
    stripePaymentIntentId: data.stripePaymentIntentId,
    stripeTransferId: data.stripeTransferId,
    stripeRefundId: data.stripeRefundId,
    sellerStripeAccountId: data.sellerStripeAccountId,
    releasedBy: data.releasedBy,
    releasedAt: data.releasedAt ? toDateSafe(data.releasedAt) : undefined,
    refundedBy: data.refundedBy,
    refundedAt: data.refundedAt ? toDateSafe(data.refundedAt) : undefined,
    refundReason: data.refundReason,
    createdAt: toDateSafe(data.createdAt),
    updatedAt: toDateSafe(data.updatedAt),
    completedAt: data.completedAt ? toDateSafe(data.completedAt) : undefined,
    // Escrow workflow fields
    paidAt: data.paidAt ? toDateSafe(data.paidAt) : undefined,
    disputeDeadlineAt: data.disputeDeadlineAt ? toDateSafe(data.disputeDeadlineAt) : undefined,
    sellerPreparingAt: data.sellerPreparingAt ? toDateSafe(data.sellerPreparingAt) : undefined,
    inTransitAt: data.inTransitAt ? toDateSafe(data.inTransitAt) : undefined,
    deliveredAt: data.deliveredAt ? toDateSafe(data.deliveredAt) : undefined,
    acceptedAt: data.acceptedAt ? toDateSafe(data.acceptedAt) : undefined,
    disputedAt: data.disputedAt ? toDateSafe(data.disputedAt) : undefined,
    disputeReason: data.disputeReason,
    disputeNotes: data.disputeNotes,
    deliveryProofUrls: data.deliveryProofUrls,
    adminHold: data.adminHold,
    lastUpdatedByRole: data.lastUpdatedByRole,
    // Protected Transaction fields
    deliveryConfirmedAt: data.deliveryConfirmedAt ? toDateSafe(data.deliveryConfirmedAt) : undefined,
    protectionStartAt: data.protectionStartAt ? toDateSafe(data.protectionStartAt) : undefined,
    protectionEndsAt: data.protectionEndsAt ? toDateSafe(data.protectionEndsAt) : undefined,
    buyerAcceptedAt: data.buyerAcceptedAt ? toDateSafe(data.buyerAcceptedAt) : undefined,
    disputeOpenedAt: data.disputeOpenedAt ? toDateSafe(data.disputeOpenedAt) : undefined,
    disputeReasonV2: data.disputeReasonV2,
    disputeStatus: data.disputeStatus,
    disputeEvidence: data.disputeEvidence?.map((e: any) => ({
      type: e.type,
      url: e.url,
      uploadedAt: e.uploadedAt ? toDateSafe(e.uploadedAt) : new Date(),
    })),
    payoutHoldReason: data.payoutHoldReason,
    protectedTransactionDaysSnapshot: data.protectedTransactionDaysSnapshot,
    protectedTermsVersion: data.protectedTermsVersion,

    billOfSaleGeneratedAt: data.billOfSaleGeneratedAt ? toDateSafe(data.billOfSaleGeneratedAt) : undefined,
    billOfSaleBuyerSignedAt: data.billOfSaleBuyerSignedAt ? toDateSafe(data.billOfSaleBuyerSignedAt) : undefined,
    billOfSaleBuyerSignedBy: data.billOfSaleBuyerSignedBy,
    billOfSaleSellerSignedAt: data.billOfSaleSellerSignedAt ? toDateSafe(data.billOfSaleSellerSignedAt) : undefined,
    billOfSaleSellerSignedBy: data.billOfSaleSellerSignedBy,
    complianceDocsStatus: data.complianceDocsStatus as any,
    listingSnapshot: data.listingSnapshot,
    sellerSnapshot: data.sellerSnapshot,
    timeline: timeline as any,
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
 * CRITICAL: Normalizes data on read to prevent int32 serialization errors
 */
export async function getOrderById(orderId: string): Promise<Order | null> {
  const orderRef = doc(db, 'orders', orderId);
  const orderDoc = await getDoc(orderRef);

  if (!orderDoc.exists()) {
    return null;
  }

  // Normalize data immediately after reading to prevent int32 serialization errors
  const rawData = orderDoc.data() as OrderDoc;
  const normalizedData = normalizeFirestoreValue(rawData) as OrderDoc;
  
  // Guard: throw if corruption still detected after normalization
  if (process.env.NODE_ENV !== 'production') {
    assertNoCorruptValuesAfterNormalization(normalizedData, [], `order ${orderId}`);
  }

  return toOrder(orderDoc.id, normalizedData);
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
 * CRITICAL: Normalizes data on read to prevent int32 serialization errors
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

  return snapshot.docs.map((doc) => {
    // Normalize data immediately after reading to prevent int32 serialization errors
    const rawData = doc.data() as OrderDoc;
    const normalizedData = normalizeFirestoreValue(rawData) as OrderDoc;
    
    // Guard: throw if corruption still detected after normalization
    if (process.env.NODE_ENV !== 'production') {
      assertNoCorruptValuesAfterNormalization(normalizedData, [], `order ${doc.id}`);
    }
    
    return toOrder(doc.id, normalizedData);
  });
}

/**
 * Get all orders for admin (no user filter)
 * Used by admin dashboard
 * CRITICAL: Normalizes data on read to prevent int32 serialization errors
 */
export async function getOrdersForAdmin(): Promise<Order[]> {
  const ordersRef = collection(db, 'orders');
  const q = query(
    ordersRef,
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    // Normalize data immediately after reading to prevent int32 serialization errors
    const rawData = doc.data() as OrderDoc;
    const normalizedData = normalizeFirestoreValue(rawData) as OrderDoc;
    
    // Guard: throw if corruption still detected after normalization
    if (process.env.NODE_ENV !== 'production') {
      assertNoCorruptValuesAfterNormalization(normalizedData, [], `order ${doc.id}`);
    }
    
    return toOrder(doc.id, normalizedData);
  });
}
