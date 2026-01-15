/**
 * POST /api/messages/send
 * Send a message with server-side sanitization
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { sanitizeMessage } from '@/lib/safety/sanitizeMessage';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
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

export async function POST(request: Request) {
  try {
    // Lazily initialize Admin SDK inside the handler so we can return a structured 503 instead of crashing at import-time.
    let auth: ReturnType<typeof getAdminAuth>;
    let db: ReturnType<typeof getAdminDb>;
    try {
      auth = getAdminAuth();
      db = getAdminDb();
    } catch (e: any) {
      return json(
        {
          error: 'Server is not configured to send messages yet',
          code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
          message: e?.message || 'Failed to initialize Firebase Admin SDK',
          missing: e?.missing || undefined,
        },
        { status: 503 }
      );
    }

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter?.toString() || '60' },
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

    const senderId = decodedToken.uid;

    // Parse request body
    const body = await request.json();
    const { threadId, recipientId, listingId, messageBody } = body;

    if (!threadId || !recipientId || !listingId || !messageBody) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify thread exists and user is participant
    const threadRef = db.collection('messageThreads').doc(threadId);
    const threadDoc = await threadRef.get();
    
    if (!threadDoc.exists) {
      return json({ error: 'Thread not found' }, { status: 404 });
    }

    const threadData = threadDoc.data()!;
    if (threadData.buyerId !== senderId && threadData.sellerId !== senderId) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check order status to determine if contact should be allowed
    let orderStatus: 'pending' | 'paid' | 'completed' | undefined;
    const ordersRef = db.collection('orders');
    const orderQuery = await ordersRef
      .where('listingId', '==', listingId)
      .where('buyerId', '==', threadData.buyerId)
      .limit(1)
      .get();

    if (!orderQuery.empty) {
      const orderData = orderQuery.docs[0].data();
      orderStatus = orderData.status as 'pending' | 'paid' | 'completed';
    }

    // Sanitize message on server
    const isPaid = orderStatus === 'paid' || orderStatus === 'completed';
    const sanitizeResult = sanitizeMessage(messageBody, {
      isPaid,
      paymentStatus: orderStatus,
    });

    // Store message
    const messagesRef = threadRef.collection('messages');
    const messageData = {
      threadId,
      senderId,
      recipientId,
      listingId,
      body: sanitizeResult.sanitizedText,
      createdAt: new Date(),
      wasRedacted: sanitizeResult.wasRedacted,
      violationCount: sanitizeResult.violationCount,
      detectedViolations: sanitizeResult.detected,
      flagged: sanitizeResult.violationCount >= 2,
    };

    const messageRef = await messagesRef.add(messageData);

    // Update thread
    const newViolationCount = (threadData.violationCount || 0) + sanitizeResult.violationCount;
    const unreadField = senderId === threadData.buyerId ? 'sellerUnreadCount' : 'buyerUnreadCount';
    
    await threadRef.update({
      updatedAt: new Date(),
      lastMessageAt: new Date(),
      lastMessagePreview: sanitizeResult.sanitizedText.substring(0, 100),
      [`${senderId === threadData.buyerId ? 'buyer' : 'seller'}UnreadCount`]: 0,
      [unreadField]: (threadData[unreadField] || 0) + 1,
      violationCount: newViolationCount,
      flagged: newViolationCount >= 3 || threadData.flagged || false,
    });

    // Create notification for recipient
    try {
      const listingRef = db.collection('listings').doc(listingId);
      const listingDoc = await listingRef.get();
      const listingData = listingDoc.exists ? listingDoc.data() : null;
      const listingTitle = listingData?.title || 'a listing';

      const notificationsRef = db.collection('notifications');
      await notificationsRef.add({
        userId: recipientId,
        type: 'message_received',
        title: 'New Message',
        body: `${senderId === threadData.buyerId ? 'Buyer' : 'Seller'} sent you a message about "${listingTitle}"`,
        read: false,
        createdAt: new Date(),
        linkUrl: `/dashboard/messages?listingId=${listingId}&sellerId=${threadData.sellerId}`,
        linkLabel: 'View Message',
        listingId,
        threadId,
        metadata: {
          senderId,
          preview: sanitizeResult.sanitizedText.substring(0, 100),
        },
      });
    } catch (notifError) {
      // Don't fail message send if notification fails
      console.error('Error creating notification:', notifError);
    }

    return json({
      success: true,
      messageId: messageRef.id,
      wasRedacted: sanitizeResult.wasRedacted,
      violationDescription: sanitizeResult.wasRedacted
        ? `Contact details are hidden until payment is completed.`
        : undefined,
    });
  } catch (error: any) {
    console.error('Error sending message:', error);
    return json({ error: 'Failed to send message', message: error.message }, { status: 500 });
  }
}
