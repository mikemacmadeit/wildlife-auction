/**
 * GET /api/orders/[orderId]/dispute-packet
 * 
 * Admin-only: Export dispute packet data (structured data for dispute resolution)
 */

import { getFirestore } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
    }

    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const adminId = decodedToken.uid;

    // Verify admin role
    const adminUserRef = db.collection('users').doc(adminId);
    const adminUserDoc = await adminUserRef.get();
    
    if (!adminUserDoc.exists) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    const adminUserData = adminUserDoc.data();
    const isAdmin = adminUserData?.role === 'admin' || adminUserData?.role === 'super_admin';
    
    if (!isAdmin) {
      return json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const orderId = params.orderId;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Get buyer and seller profiles
    const [buyerDoc, sellerDoc] = await Promise.all([
      db.collection('users').doc(orderData.buyerId).get(),
      db.collection('users').doc(orderData.sellerId).get(),
    ]);

    const buyerData = buyerDoc.exists ? buyerDoc.data() : null;
    const sellerData = sellerDoc.exists ? sellerDoc.data() : null;

    // Get listing
    const listingDoc = await db.collection('listings').doc(orderData.listingId).get();
    const listingData = listingDoc.exists ? listingDoc.data() : null;

    // Get timeline events
    const timelineEvents = orderData.timeline || [];

    // Get messages from the order's message thread (listing + buyer + seller)
    const listingId = orderData.listingId as string;
    const buyerId = orderData.buyerId as string;
    const sellerId = orderData.sellerId as string;
    let messages: { id: string; [k: string]: any }[] = [];
    if (listingId && buyerId && sellerId) {
      const threadSnap = await db
        .collection('messageThreads')
        .where('listingId', '==', listingId)
        .where('buyerId', '==', buyerId)
        .where('sellerId', '==', sellerId)
        .limit(1)
        .get();
      if (!threadSnap.empty) {
        const threadId = threadSnap.docs[0].id;
        const messagesSnap = await db
          .collection('messageThreads')
          .doc(threadId)
          .collection('messages')
          .orderBy('createdAt', 'asc')
          .get();
        messages = messagesSnap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            ...d,
            createdAt: (d.createdAt as any)?.toDate ? (d.createdAt as any).toDate().toISOString() : d.createdAt,
          };
        });
      }
    }

    // Get compliance documents
    const documentsRef = db.collection('orders').doc(orderId).collection('documents');
    const documentsSnapshot = await documentsRef.get().catch(() => ({ docs: [] }));
    const documents = documentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      uploadedAt: doc.data().uploadedAt?.toDate ? doc.data().uploadedAt.toDate().toISOString() : doc.data().uploadedAt,
    }));

    // Build dispute packet
    const disputePacket = {
      order: {
        id: orderId,
        transactionStatus: getEffectiveTransactionStatus(orderData as any),
        transportOption: orderData.transportOption,
        amount: orderData.amount,
        platformFee: orderData.platformFee,
        sellerAmount: orderData.sellerAmount,
        createdAt: orderData.createdAt?.toDate ? orderData.createdAt.toDate().toISOString() : orderData.createdAt,
        paidAt: orderData.paidAt?.toDate ? orderData.paidAt.toDate().toISOString() : orderData.paidAt,
        fulfillmentSlaStartedAt: orderData.fulfillmentSlaStartedAt?.toDate ? orderData.fulfillmentSlaStartedAt.toDate().toISOString() : orderData.fulfillmentSlaStartedAt,
        fulfillmentSlaDeadlineAt: orderData.fulfillmentSlaDeadlineAt?.toDate ? orderData.fulfillmentSlaDeadlineAt.toDate().toISOString() : orderData.fulfillmentSlaDeadlineAt,
        pickup: orderData.pickup,
        delivery: orderData.delivery,
        issues: orderData.issues,
        adminFlags: orderData.adminFlags || [],
        adminActionNotes: orderData.adminActionNotes || [],
        adminReviewedAt: orderData.adminReviewedAt?.toDate ? orderData.adminReviewedAt.toDate().toISOString() : orderData.adminReviewedAt,
      },
      listing: listingData ? {
        id: listingData.id || orderData.listingId,
        title: listingData.title,
        category: listingData.category,
        type: listingData.type,
      } : null,
      buyer: buyerData ? {
        id: buyerData.uid || orderData.buyerId,
        email: buyerData.email,
        displayName: buyerData.displayName || buyerData.profile?.fullName,
      } : null,
      seller: sellerData ? {
        id: sellerData.uid || orderData.sellerId,
        email: sellerData.email,
        displayName: sellerData.displayName || sellerData.profile?.fullName,
        sellingDisabled: sellerData.sellingDisabled || false,
      } : null,
      timeline: timelineEvents.map((event: any) => ({
        ...event,
        timestamp: event.timestamp?.toDate ? event.timestamp.toDate().toISOString() : event.timestamp,
      })),
      messages: messages,
      documents: documents,
      proofStatus: {
        deliveryProof: orderData.deliveryProofUrls || orderData.delivery?.proofUploads || [],
        pickupProof: orderData.pickup?.proofPhotos || [],
        disputeEvidence: orderData.issues?.photos || orderData.protectedDisputeEvidence || [],
      },
      deadlines: {
        fulfillmentSlaDeadline: orderData.fulfillmentSlaDeadlineAt?.toDate ? orderData.fulfillmentSlaDeadlineAt.toDate().toISOString() : null,
        disputeDeadline: orderData.disputeDeadlineAt?.toDate ? orderData.disputeDeadlineAt.toDate().toISOString() : null,
        protectionEnds: orderData.protectionEndsAt?.toDate ? orderData.protectionEndsAt.toDate().toISOString() : null,
      },
    };

    return json({
      success: true,
      orderId,
      disputePacket,
    });
  } catch (error: any) {
    console.error('Error exporting dispute packet:', error);
    return json({ error: 'Failed to export dispute packet', message: error.message }, { status: 500 });
  }
}
