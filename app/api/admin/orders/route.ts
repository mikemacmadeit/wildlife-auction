/**
 * GET /api/admin/orders
 * 
 * Admin-only endpoint to fetch orders with server-side filtering
 * Query params:
 * - filter: 'escrow' | 'protected' | 'disputes' | 'ready_to_release' | 'all'  (legacy key name: "escrow" = payout-hold orders)
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
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const cursor = searchParams.get('cursor');

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
    if (filter === 'escrow') {
      ordersQuery = ordersCol
        // Payout-hold queue: includes paid/paid_held as well as post-delivery/buyer-confirm states
        // that are still awaiting admin payout release.
        .where('status', 'in', [
          'paid',
          'paid_held',
          'awaiting_bank_transfer',
          'awaiting_wire',
          'in_transit',
          'delivered',
          'buyer_confirmed',
          'accepted',
          'ready_to_release',
        ])
        .orderBy('createdAt', 'desc')
        .limit(limit);
    } else if (filter === 'disputes') {
      ordersQuery = ordersCol
        .where('disputeStatus', 'in', ['open', 'needs_evidence', 'under_review'])
        .orderBy('createdAt', 'desc')
        .limit(limit);
    } else if (filter === 'ready_to_release') {
      // Candidate statuses for manual release queue. Final eligibility still checked below.
      ordersQuery = ordersCol.where('status', 'in', ['ready_to_release', 'buyer_confirmed', 'accepted']).orderBy('createdAt', 'desc').limit(limit);
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

    let orders = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));

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

    if (filter === 'escrow') {
      // Orders held for payout release: paid funds awaiting release OR high-ticket awaiting payment confirmation
      // Includes orders in transit/delivered that haven't been released yet
      orders = orders.filter((order: any) => {
        const status = order.status as OrderStatus;
        const hasTransfer = !!order.stripeTransferId;
        if (hasTransfer) return false;
        return (
          status === 'paid' ||
          status === 'paid_held' ||
          status === 'awaiting_bank_transfer' ||
          status === 'awaiting_wire' ||
          status === 'in_transit' ||
          status === 'delivered' ||
          status === 'buyer_confirmed' ||
          status === 'accepted' ||
          status === 'ready_to_release'
        );
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
      // Open disputes: disputeStatus in ['open', 'needs_evidence', 'under_review']
      orders = orders.filter((order: any) => {
        const disputeStatus = order.disputeStatus as DisputeStatus;
        return disputeStatus === 'open' || 
               disputeStatus === 'needs_evidence' || 
               disputeStatus === 'under_review';
      });
    } else if (filter === 'ready_to_release') {
      // Ready to release: eligible for payout
      orders = orders.filter((order: any) => {
        const status = order.status as OrderStatus;
        const disputeStatus = order.disputeStatus as DisputeStatus;
        const adminHold = order.adminHold === true;
        const hasTransfer = !!order.stripeTransferId;

        // Already released
        if (hasTransfer || status === 'completed') return false;

        // Blocked by dispute or admin hold
        if (adminHold) return false;
        if (disputeStatus === 'open' || disputeStatus === 'needs_evidence' || disputeStatus === 'under_review') {
          return false;
        }

        // Manual release queue: buyer confirmed + delivery marked
        const hasBuyerConfirm = !!order.buyerConfirmedAt || !!order.buyerAcceptedAt || !!order.acceptedAt;
        const hasDelivery = !!order.deliveredAt || !!order.deliveryConfirmedAt;

        if ((status === 'ready_to_release' || status === 'buyer_confirmed' || status === 'accepted') && hasBuyerConfirm && hasDelivery) {
          return true;
        }

        return false;
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
          if (serialized[field].toDate) {
            serialized[field] = serialized[field].toDate().toISOString();
          } else if (serialized[field] instanceof Date) {
            serialized[field] = serialized[field].toISOString();
          }
        }
      });

      // Convert disputeEvidence timestamps
      if (serialized.disputeEvidence && Array.isArray(serialized.disputeEvidence)) {
        serialized.disputeEvidence = serialized.disputeEvidence.map((evidence: any) => ({
          ...evidence,
          uploadedAt: evidence.uploadedAt?.toDate ? evidence.uploadedAt.toDate().toISOString() : evidence.uploadedAt,
        }));
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
