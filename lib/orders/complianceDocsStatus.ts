import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { normalizeCategory } from '@/lib/listings/normalizeCategory';
import { getRequiredOrderDocuments } from '@/lib/compliance/requirements';

export type ComplianceDocsStatus = {
  required: string[];
  provided: string[];
  missing: string[];
};

export async function recomputeOrderComplianceDocsStatus(params: {
  db: Firestore;
  orderId: string;
}): Promise<ComplianceDocsStatus> {
  const { db, orderId } = params;

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new Error('Order not found');
  const order = orderSnap.data() as any;
  const listingId = String(order?.listingId || '');
  if (!listingId) throw new Error('Order missing listingId');

  const listingSnap = await db.collection('listings').doc(listingId).get();
  if (!listingSnap.exists) throw new Error('Listing not found for order');
  const listing = listingSnap.data() as any;

  const category = normalizeCategory(listing?.category);
  const required = getRequiredOrderDocuments(category as any).map(String);

  const docsSnap = await db.collection('orders').doc(orderId).collection('documents').get();
  const provided = Array.from(
    new Set(
      docsSnap.docs
        .map((d) => String((d.data() as any)?.type || ''))
        .filter((t) => t.length > 0)
    )
  );

  const missing = required.filter((t) => !provided.includes(t));
  const status: ComplianceDocsStatus = { required, provided, missing };

  await orderRef.set(
    {
      complianceDocsStatus: status,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  return status;
}

