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

  return {
    id: docId,
    listingId: data.listingId,
    offerId: data.offerId,
    buyerId: data.buyerId,
    sellerId: data.sellerId,
    amount: data.amount,
    platformFee: data.platformFee,
    sellerAmount: data.sellerAmount,
    status: data.status,
    stripeCheckoutSessionId: data.stripeCheckoutSessionId,
    stripePaymentIntentId: data.stripePaymentIntentId,
    stripeTransferId: data.stripeTransferId,
    stripeRefundId: data.stripeRefundId,
    sellerStripeAccountId: data.sellerStripeAccountId,
    releasedBy: data.releasedBy,
    releasedAt: data.releasedAt?.toDate(),
    refundedBy: data.refundedBy,
    refundedAt: data.refundedAt?.toDate(),
    refundReason: data.refundReason,
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
    completedAt: data.completedAt?.toDate(),
    // Escrow workflow fields
    paidAt: data.paidAt?.toDate(),
    disputeDeadlineAt: data.disputeDeadlineAt?.toDate(),
    deliveredAt: data.deliveredAt?.toDate(),
    acceptedAt: data.acceptedAt?.toDate(),
    disputedAt: data.disputedAt?.toDate(),
    disputeReason: data.disputeReason,
    disputeNotes: data.disputeNotes,
    deliveryProofUrls: data.deliveryProofUrls,
    adminHold: data.adminHold,
    lastUpdatedByRole: data.lastUpdatedByRole,
    // Protected Transaction fields
    deliveryConfirmedAt: data.deliveryConfirmedAt?.toDate(),
    protectionStartAt: data.protectionStartAt?.toDate(),
    protectionEndsAt: data.protectionEndsAt?.toDate(),
    buyerAcceptedAt: data.buyerAcceptedAt?.toDate(),
    disputeOpenedAt: data.disputeOpenedAt?.toDate(),
    disputeReasonV2: data.disputeReasonV2,
    disputeStatus: data.disputeStatus,
    disputeEvidence: data.disputeEvidence?.map((e: any) => ({
      type: e.type,
      url: e.url,
      uploadedAt: e.uploadedAt?.toDate() || new Date(),
    })),
    payoutHoldReason: data.payoutHoldReason,
    protectedTransactionDaysSnapshot: data.protectedTransactionDaysSnapshot,
    protectedTermsVersion: data.protectedTermsVersion,

    billOfSaleGeneratedAt: data.billOfSaleGeneratedAt?.toDate(),
    billOfSaleBuyerSignedAt: data.billOfSaleBuyerSignedAt?.toDate(),
    billOfSaleBuyerSignedBy: data.billOfSaleBuyerSignedBy,
    billOfSaleSellerSignedAt: data.billOfSaleSellerSignedAt?.toDate(),
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

/**
 * Get all orders for admin (no user filter)
 * Used by admin dashboard
 */
export async function getOrdersForAdmin(): Promise<Order[]> {
  const ordersRef = collection(db, 'orders');
  const q = query(
    ordersRef,
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => toOrder(doc.id, doc.data() as OrderDoc));
}
