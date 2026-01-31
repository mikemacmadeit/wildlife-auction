/**
 * Firestore Orders Collection Helpers
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
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
  /** Live delivery tracking (Uber-style). Only latest location in RTDB; metadata here. */
  deliveryTracking?: {
    enabled: boolean;
    driverUid: string | null;
    startedAt: Timestamp | null;
    endedAt: Timestamp | null;
    lastLocationAt: Timestamp | null;
  };
}

/**
 * Convert Firestore OrderDoc to UI Order type
 */
function toOrder(docId: string, data: OrderDoc): Order {
  // Helper to safely convert timestamp-like values to Date
  const toDateSafe = (value: any): Date => {
    if (!value) return new Date(0);
    if (value instanceof Date) {
      // Verify it's a valid Date
      if (Number.isFinite(value.getTime())) {
        return value;
      }
      return new Date(0);
    }
    // Try toDate() method (Firestore Timestamp) with error handling
    if (typeof value?.toDate === 'function') {
      try {
        const result = value.toDate();
        if (result instanceof Date && Number.isFinite(result.getTime())) {
          return result;
        }
      } catch (err) {
        // If toDate() fails, fall through to other checks
        // This can happen if value is a serialized object that looks like it has toDate but doesn't work
      }
    }
    // Handle normalized {seconds, nanoseconds} objects from normalizeFirestoreValue
    if (value && typeof value === 'object' && typeof value.seconds === 'number') {
      const ms = value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000;
      const result = new Date(ms);
      if (Number.isFinite(result.getTime())) {
        return result;
      }
    }
    // Handle string/number timestamps (from JSON serialization)
    if (typeof value === 'string' || typeof value === 'number') {
      const result = new Date(value);
      if (Number.isFinite(result.getTime())) {
        return result;
      }
    }
    // Fallback
    return new Date(0);
  };
  
  const timeline =
    Array.isArray(data.timeline)
      ? data.timeline
          .map((e: any) => ({
            id: String(e?.id || ''),
            type: String(e?.type || ''),
            label: String(e?.label || ''),
            timestamp: toDateSafe(e?.timestamp),
            actor: String(e?.actor || 'system'),
            visibility: e?.visibility ? String(e.visibility) : undefined,
            meta: e?.meta && typeof e.meta === 'object' ? e.meta : undefined,
          }))
          .filter((e: any) => e.id && e.type && e.label)
      : undefined;

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
    fulfillmentSlaDeadlineAt: (data as any).fulfillmentSlaDeadlineAt ? toDateSafe((data as any).fulfillmentSlaDeadlineAt) : undefined,
    fulfillmentSlaStartedAt: (data as any).fulfillmentSlaStartedAt ? toDateSafe((data as any).fulfillmentSlaStartedAt) : undefined,
    transportOption: (data as any).transportOption,
    transactionStatus: (data as any).transactionStatus,
    delivery: (data as any).delivery ? (() => {
      const d = (data as any).delivery;
      const mapWindow = (w: any) => ({
        start: w?.start ? toDateSafe(w.start) : undefined,
        end: w?.end ? toDateSafe(w.end) : undefined,
      });
      return {
        ...d,
        eta: d.eta ? toDateSafe(d.eta) : undefined,
        windows: Array.isArray(d.windows) ? d.windows.map(mapWindow) : undefined,
        agreedWindow: d.agreedWindow ? mapWindow(d.agreedWindow) : undefined,
        agreedAt: d.agreedAt ? toDateSafe(d.agreedAt) : undefined,
        proposedAt: d.proposedAt ? toDateSafe(d.proposedAt) : undefined,
      };
    })() : undefined,
    deliveryAddress: (data as any).deliveryAddress ?? undefined,
    deliveryTracking: (data as any).deliveryTracking ? (() => {
      const dt = (data as any).deliveryTracking;
      return {
        enabled: !!dt.enabled,
        driverUid: dt.driverUid ?? null,
        startedAt: dt.startedAt ? toDateSafe(dt.startedAt) : null,
        endedAt: dt.endedAt ? toDateSafe(dt.endedAt) : null,
        lastLocationAt: dt.lastLocationAt ? toDateSafe(dt.lastLocationAt) : null,
      };
    })() : undefined,
    pickup: (data as any).pickup ? (() => {
      const p = (data as any).pickup;
      const mapWindow = (w: any) => ({
        start: w?.start ? toDateSafe(w.start) : undefined,
        end: w?.end ? toDateSafe(w.end) : undefined,
      });
      return {
        ...p,
        windows: Array.isArray(p.windows) ? p.windows.map(mapWindow) : undefined,
        selectedWindow: p.selectedWindow ? mapWindow(p.selectedWindow) : undefined,
        confirmedAt: p.confirmedAt ? toDateSafe(p.confirmedAt) : undefined,
        proposedAt: p.proposedAt ? toDateSafe(p.proposedAt) : undefined,
        agreedAt: p.agreedAt ? toDateSafe(p.agreedAt) : undefined,
      };
    })() : undefined,
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
 * Subscribe to order doc for real-time updates (e.g. seller marks delivered, buyer confirms).
 * Returns an unsubscribe function.
 */
export function subscribeToOrder(
  orderId: string,
  callback: (order: Order | null) => void
): () => void {
  const orderRef = doc(db, 'orders', orderId);
  return onSnapshot(
    orderRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      const rawData = snapshot.data() as OrderDoc;
      const normalizedData = normalizeFirestoreValue(rawData) as OrderDoc;
      try {
        callback(toOrder(snapshot.id, normalizedData));
      } catch (e) {
        console.warn('[subscribeToOrder] toOrder failed', orderId, e);
        callback(null);
      }
    },
    (err) => {
      console.warn('[subscribeToOrder]', orderId, err);
      callback(null);
    }
  );
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

/** Statuses that mean "awaiting payment" – excluded from buyer list unless from a real checkout (has session id). */
const AWAITING_PAYMENT_STATUSES = ['pending', 'awaiting_bank_transfer', 'awaiting_wire'] as const;

/** Buyer "My purchases": exclude cancelled. Show pending/awaiting_* only when from checkout (stripeCheckoutSessionId). */
const BUYER_HIDDEN_STATUSES = ['cancelled'] as const;

/**
 * Get orders for a user (as buyer or seller)
 * CRITICAL: Normalizes data on read to prevent int32 serialization errors
 *
 * For buyers: returns real purchases and in-progress checkouts. Includes pending / awaiting_bank_transfer /
 * awaiting_wire when the order has stripeCheckoutSessionId (from checkout), so "My Purchases" shows
 * "Payment processing" until payment confirms. Excludes cancelled and abandoned checkouts (no session id).
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

  const orders = snapshot.docs.map((doc) => {
    // Normalize data immediately after reading to prevent int32 serialization errors
    const rawData = doc.data() as OrderDoc;
    const normalizedData = normalizeFirestoreValue(rawData) as OrderDoc;
    
    // Guard: throw if corruption still detected after normalization
    if (process.env.NODE_ENV !== 'production') {
      assertNoCorruptValuesAfterNormalization(normalizedData, [], `order ${doc.id}`);
    }
    
    return toOrder(doc.id, normalizedData);
  });

  if (role === 'buyer') {
    return orders.filter((o) => {
      if ((BUYER_HIDDEN_STATUSES as readonly string[]).includes(o.status ?? '')) return false;
      // Include pending/awaiting_* only when from checkout (has session id) so "My Purchases" shows "Payment processing".
      const status = o.status ?? '';
      const fromCheckout = Boolean((o as any).stripeCheckoutSessionId);
      if (AWAITING_PAYMENT_STATUSES.includes(status as any) && !fromCheckout) return false;
      return true;
    });
  }
  return orders;
}

/**
 * Filter orders for seller-facing UIs (sales, overview).
 * Excludes:
 * - Pending orders with a checkout session (abandoned checkout skeletons).
 * - Cancelled orders that never had payment (failed/abandoned checkout attempts).
 * "Cancelled" in sales = paid-then-cancelled or refunded; not "attempted but never paid".
 */
export function filterSellerRelevantOrders<T extends { status?: string; paidAt?: unknown; stripeCheckoutSessionId?: string }>(
  orders: T[]
): T[] {
  return orders.filter((o) => {
    if (o.status === 'pending' && o.stripeCheckoutSessionId) return false;
    if (o.status === 'cancelled' && !o.paidAt) return false;
    return true;
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
