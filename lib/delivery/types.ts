/**
 * Delivery Session types for Firestore deliverySessions collection
 */

import type { Timestamp } from 'firebase-admin/firestore';

export type DeliverySessionStatus = 'active' | 'delivered' | 'expired' | 'cancelled';

export interface DeliverySessionSignature {
  url: string;
  storagePath: string;
  hash: string;
}

export interface DeliverySessionTracking {
  enabled: boolean;
  lastLocation?: { lat: number; lng: number; ts: Timestamp | Date };
  startedAt?: Timestamp | Date;
  stoppedAt?: Timestamp | Date;
  pingsCount?: number;
}

export interface DeliverySession {
  orderId: string;
  transactionId?: string;
  sellerUid: string;
  buyerUid?: string;
  status: DeliverySessionStatus;
  createdAt: Timestamp | Date;
  expiresAt: Timestamp | Date;
  deliveredAt?: Timestamp | Date;
  oneTimeSignature: boolean;
  signature?: DeliverySessionSignature;
  driver?: {
    assignedBySeller?: boolean;
    label?: string;
    phone?: string;
    email?: string;
  };
  tracking?: DeliverySessionTracking;
}
