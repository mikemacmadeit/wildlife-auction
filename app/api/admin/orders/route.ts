/**
 * GET /api/admin/orders
 * 
 * Admin-only endpoint to fetch orders with server-side filtering
 * Query params:
 * - filter: 'fulfillment_issues' | 'protected' | 'disputes' | 'fulfillment_pending' | 'all'
   *   (legacy filter keys still supported for backward compatibility)
 * - limit: number (default 100)
 * - cursor: string (order ID for pagination)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// IMPORTANT:
// Avoid importing `NextRequest` / `NextResponse` from `next/server` here.
// In this repo's current environment, dev bundling can attempt to resolve a missing internal
// Next module (`next/dist/server/web/exports/next-response`) and crash compilation.
// Route handlers work fine with standard Web `Request` / `Response`.
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { OrderStatus, DisputeStatus } from '@/lib/types';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { normalizeFirestoreValue, assertNoCorruptValuesAfterNormalization } from '@/lib/firebase/normalizeFirestoreValue';
import { safePositiveInt } from '@/lib/firebase/safeQueryInts';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function GET(request: Request) {
  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    // Authenticate user and check for admin role
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized - Missing or invalid authorization header' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error: any) {
      return json({ error: 'Unauthorized - Invalid token', details: error?.message }, { status: 401 });
    }

    const adminId = decodedToken.uid;

    // Verify admin role
    const adminUserDoc = await db.collection('users').doc(adminId).get();
    if (!adminUserDoc.exists || (adminUserDoc.data()?.role !== 'admin' && adminUserDoc.data()?.role !== 'super_admin')) {
      return json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    // Clamp limit to >= 1 to prevent -1/NaN/undefined from causing int32 serialization errors
    const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
    const limit = safePositiveInt(rawLimit, 100);
    const cursor = searchParams.get('cursor');
    
    // Tripwire: catch invalid limit before Firestore query
    const { assertInt32 } = await import('@/lib/debug/int32Tripwire');
    assertInt32(limit, 'Firestore.limit');

    // Build Firestore query.
    //
    // IMPORTANT: We must filter *before* limiting, otherwise real paid_held orders can be pushed
    // out of the first N documents and never appear in Admin Ops.
    //
    // For complex filters we still do some in-memory checks, but we always narrow the query first.
    const ordersCol = db.collection('orders');
    const now = Timestamp.now();

    const isMissingIndex = (e: any) => {
      const code = String(e?.code || '');
      const msg = String(e?.message || '').toLowerCase();
      return code === 'failed-precondition' || msg.includes('requires an index') || msg.includes('failed-precondition');
    };

    let ordersQuery: any;
    if (filter === 'fulfillment_issues') {
      // Fulfillment Issues: Orders needing admin attention
      // Filter by transactionStatus instead of legacy status
      ordersQuery = ordersCol
        .where('transactionStatus', 'in', [
          'SELLER_NONCOMPLIANT',
          'DISPUTE_OPENED',
          'FULFILLMENT_REQUIRED',
          'DELIVERED_PENDING_CONFIRMATION',
        ])
        .orderBy('createdAt', 'desc')
        .limit(limit);
    } else if (filter === 'disputes') {
      ordersQuery = ordersCol
        .where('disputeStatus', 'in', ['open', 'needs_evidence', 'under_review'])
        .orderBy('createdAt', 'desc')
        .limit(limit);
    } else if (filter === 'ready_to_release' || filter === 'fulfillment_pending') {
      // Fulfillment Pending: Orders in fulfillment but not completed
      ordersQuery = ordersCol
        .where('transactionStatus', 'in', [
          'FULFILLMENT_REQUIRED',
          'READY_FOR_PICKUP',
          'PICKUP_SCHEDULED',
          'DELIVERY_SCHEDULED',
          'OUT_FOR_DELIVERY',
          'DELIVERED_PENDING_CONFIRMATION',
        ])
        .orderBy('createdAt', 'desc')
        .limit(limit);
    } else {
      // 'protected' and 'all' start with the broadest query; protected requires further in-memory checks.
      ordersQuery = ordersCol.orderBy('createdAt', 'desc').limit(limit);
    }

    // Apply cursor for pagination (must match the same ordering).
    if (cursor) {
      const cursorDoc = await ordersCol.doc(cursor).get();
      if (cursorDoc.exists) {
        ordersQuery = ordersQuery.startAfter(cursorDoc);
      }
    }

    // Execute query (with safe fallback for missing composite indexes).
    let snapshot: any;
    try {
      snapshot = await ordersQuery.get();
    } catch (e: any) {
      if (isMissingIndex(e)) {
        console.warn(`[api/admin/orders] Missing Firestore index for filter=${filter}; falling back to broad query + in-memory filter. Please deploy indexes.`, e);
        let fallbackQuery: any = ordersCol.orderBy('createdAt', 'desc').limit(limit);
        if (cursor) {
          const cursorDoc = await ordersCol.doc(cursor).get();
          if (cursorDoc.exists) fallbackQuery = fallbackQuery.startAfter(cursorDoc);
        }
        snapshot = await fallbackQuery.get();
      } else {
        throw e;
      }
    }

    // CRITICAL: Normalize data immediately after reading to prevent int32 serialization errors
    let orders = snapshot.docs.map((doc: any) => {
      const rawData = doc.data();
      const normalizedData = normalizeFirestoreValue(rawData);
      
      // Guard: throw if corruption still detected after normalization
      if (process.env.NODE_ENV !== 'production') {
        assertNoCorruptValuesAfterNormalization(normalizedData, [], `order ${doc.id}`);
      }
      
      return {
        id: doc.id,
        ...normalizedData,
      };
    });

    // Airtight display fields: some admin tooling uses `listingTitle` for rendering.
    // Canonical snapshot is `listingSnapshot.title`, but older orders (or some flows) may not have `listingTitle`.
    orders = orders.map((o: any) => {
      const listingTitleFromSnapshot = o?.listingSnapshot?.title ? String(o.listingSnapshot.title) : '';
      const listingTitle = typeof o?.listingTitle === 'string' && o.listingTitle.trim() ? o.listingTitle.trim() : '';
      return {
        ...o,
        listingTitle: listingTitle || listingTitleFromSnapshot || o?.listingId || 'Unknown Listing',
      };
    });

    if (filter === 'fulfillment_issues') {
      // Fulfillment Issues: Filter by transactionStatus and SLA deadlines
      orders = orders.filter((order: any) => {
        const txStatus = order.transactionStatus as string | undefined;
        const now = Date.now();
        
        // SELLER_NONCOMPLIANT - always show
        if (txStatus === 'SELLER_NONCOMPLIANT') return true;
        
        // DISPUTE_OPENED - always show
        if (txStatus === 'DISPUTE_OPENED') return true;
        
        // FULFILLMENT_REQUIRED + SLA deadline passed
        if (txStatus === 'FULFILLMENT_REQUIRED') {
          let deadline: number | null = null;
          if (order.fulfillmentSlaDeadlineAt) {
            if (order.fulfillmentSlaDeadlineAt.toDate && typeof order.fulfillmentSlaDeadlineAt.toDate === 'function') {
              deadline = order.fulfillmentSlaDeadlineAt.toDate().getTime();
            } else if (order.fulfillmentSlaDeadlineAt instanceof Date) {
              deadline = order.fulfillmentSlaDeadlineAt.getTime();
            } else if (order.fulfillmentSlaDeadlineAt && typeof order.fulfillmentSlaDeadlineAt === 'object' && typeof order.fulfillmentSlaDeadlineAt.seconds === 'number') {
              deadline = order.fulfillmentSlaDeadlineAt.seconds * 1000 + (order.fulfillmentSlaDeadlineAt.nanoseconds || 0) / 1_000_000;
            }
          }
          if (deadline && now > deadline) return true;
        }
        
        // DELIVERED_PENDING_CONFIRMATION older than 7 days
        if (txStatus === 'DELIVERED_PENDING_CONFIRMATION') {
          let deliveredAt: number | null = null;
          if (order.deliveredAt) {
            if (order.deliveredAt.toDate && typeof order.deliveredAt.toDate === 'function') {
              deliveredAt = order.deliveredAt.toDate().getTime();
            } else if (order.deliveredAt instanceof Date) {
              deliveredAt = order.deliveredAt.getTime();
            } else if (order.deliveredAt && typeof order.deliveredAt === 'object' && typeof order.deliveredAt.seconds === 'number') {
              deliveredAt = order.deliveredAt.seconds * 1000 + (order.deliveredAt.nanoseconds || 0) / 1_000_000;
            }
          }
          if (!deliveredAt && order.delivery?.deliveredAt) {
            deliveredAt = new Date(order.delivery.deliveredAt).getTime();
          }
          if (deliveredAt) {
            const daysSinceDelivery = (now - deliveredAt) / (1000 * 60 * 60 * 24);
            if (daysSinceDelivery > 7) return true;
          }
        }
        
        return false;
      });
    } else if (filter === 'protected') {
      // Protected transactions: has protectedTransactionDaysSnapshot AND deliveryConfirmedAt exists
      orders = orders.filter((order: any) => {
        return order.protectedTransactionDaysSnapshot !== null && 
               order.protectedTransactionDaysSnapshot !== undefined &&
               order.deliveryConfirmedAt !== null &&
               order.deliveryConfirmedAt !== undefined;
      });
    } else if (filter === 'disputes') {
      // Open disputes: transactionStatus === DISPUTE_OPENED
      orders = orders.filter((order: any) => {
        const txStatus = order.transactionStatus as string | undefined;
        return txStatus === 'DISPUTE_OPENED';
      });
    } else if (filter === 'ready_to_release' || filter === 'fulfillment_pending') {
      // Fulfillment Pending: Orders in fulfillment but not completed
      orders = orders.filter((order: any) => {
        const txStatus = order.transactionStatus as string | undefined;
        return [
          'FULFILLMENT_REQUIRED',
          'READY_FOR_PICKUP',
          'PICKUP_SCHEDULED',
          'DELIVERY_SCHEDULED',
          'OUT_FOR_DELIVERY',
          'DELIVERED_PENDING_CONFIRMATION',
        ].includes(txStatus || '');
      });
    }
    // 'all' filter returns all orders (already fetched)

    // Convert Firestore Timestamps to ISO strings for JSON serialization
    const serializedOrders = orders.map((order: any) => {
      const serialized: any = { ...order };
      
      // Convert Timestamps to ISO strings
      const timestampFields = [
        'createdAt', 'updatedAt', 'paidAt', 'disputeDeadlineAt', 'deliveredAt',
        'acceptedAt', 'buyerConfirmedAt', 'releaseEligibleAt', 'disputedAt', 'deliveryConfirmedAt', 'protectionStartAt',
        'protectionEndsAt', 'buyerAcceptedAt', 'disputeOpenedAt', 'releasedAt',
        'refundedAt', 'completedAt',
        // Stripe settlement visibility (server-authored via webhooks)
        'stripeFundsAvailableOn'
      ];

      timestampFields.forEach((field) => {
        if (serialized[field]) {
          // Handle Firestore Timestamp objects (with .toDate method)
          if (serialized[field].toDate && typeof serialized[field].toDate === 'function') {
            serialized[field] = serialized[field].toDate().toISOString();
          } 
          // Handle Date objects
          else if (serialized[field] instanceof Date) {
            serialized[field] = serialized[field].toISOString();
          }
          // Handle normalized {seconds, nanoseconds} objects from normalizeFirestoreValue
          else if (serialized[field] && typeof serialized[field] === 'object' && typeof serialized[field].seconds === 'number') {
            const ms = serialized[field].seconds * 1000 + (serialized[field].nanoseconds || 0) / 1_000_000;
            serialized[field] = new Date(ms).toISOString();
          }
          // If it's already an ISO string, leave it as-is
          else if (typeof serialized[field] === 'string') {
            // Already an ISO string, no conversion needed
          }
        }
      });

      // Convert disputeEvidence timestamps
      if (serialized.disputeEvidence && Array.isArray(serialized.disputeEvidence)) {
        serialized.disputeEvidence = serialized.disputeEvidence.map((evidence: any) => {
          let uploadedAt = evidence.uploadedAt;
          // Handle Firestore Timestamp
          if (uploadedAt?.toDate && typeof uploadedAt.toDate === 'function') {
            uploadedAt = uploadedAt.toDate().toISOString();
          }
          // Handle Date
          else if (uploadedAt instanceof Date) {
            uploadedAt = uploadedAt.toISOString();
          }
          // Handle normalized {seconds, nanoseconds}
          else if (uploadedAt && typeof uploadedAt === 'object' && typeof uploadedAt.seconds === 'number') {
            const ms = uploadedAt.seconds * 1000 + (uploadedAt.nanoseconds || 0) / 1_000_000;
            uploadedAt = new Date(ms).toISOString();
          }
          return {
            ...evidence,
            uploadedAt: uploadedAt || new Date().toISOString(),
          };
        });
      }

      return serialized;
    });

    // Get next cursor (last order ID)
    const nextCursor = orders.length > 0 ? orders[orders.length - 1].id : null;

    return json({
      orders: serializedOrders,
      nextCursor,
      hasMore: orders.length === limit,
    });
  } catch (error: any) {
    console.error('Error fetching admin orders:', error);
    return json({ error: 'Failed to fetch orders', message: error.message }, { status: 500 });
  }
}
