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
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { buildInAppNotification } from '@/lib/notifications/inApp';
import { tryDispatchEmailJobNow } from '@/lib/email/dispatchEmailJobNow';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.messages);
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

    // Verified email required for messaging (cuts spam + makes contact workflows reliable).
    const tokenEmailVerified = (decodedToken as any)?.email_verified === true;
    if (!tokenEmailVerified) {
      try {
        const userRecord = await auth.getUser(senderId);
        if (userRecord?.emailVerified !== true) {
          return json(
            {
              error: 'Email verification required',
              code: 'EMAIL_NOT_VERIFIED',
              message: 'Please verify your email address before sending messages.',
            },
            { status: 403 }
          );
        }
      } catch {
        return json(
          {
            error: 'Email verification required',
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Please verify your email address before sending messages.',
          },
          { status: 403 }
        );
      }
    }

    // Admin moderation: muted users cannot send messages (server-authoritative).
    try {
      const senderDoc = await db.collection('users').doc(senderId).get();
      const senderData = senderDoc.exists ? (senderDoc.data() as any) : null;
      if (senderData?.adminFlags?.messagingMuted === true) {
        return json(
          {
            error: 'Messaging restricted',
            code: 'MESSAGING_MUTED',
            message: 'Your messaging privileges have been restricted. Please contact support.',
          },
          { status: 403 }
        );
      }
    } catch {
      // If we can't read the sender doc, fail open (do not block messaging).
    }

    // Parse request body
    const body = await request.json();
    const { threadId, listingId, messageBody, attachments } = body;

    const hasBody = typeof messageBody === 'string' && messageBody.trim().length > 0;
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    if (!threadId || !listingId || (!hasBody && !hasAttachments)) {
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

    // Defensive: ensure listingId matches thread.listingId (prevents spoofing / cross-thread injection)
    if (String(threadData.listingId || '') !== String(listingId || '')) {
      return json(
        {
          error: 'Invalid thread',
          code: 'LISTING_THREAD_MISMATCH',
          message: 'This thread does not match the requested listing.',
        },
        { status: 400 }
      );
    }

    // Canonical recipient is always the other party in the thread (never trust client input)
    const recipientId = senderId === threadData.buyerId ? threadData.sellerId : threadData.buyerId;

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
    const sanitizeResult = sanitizeMessage(String(messageBody || ''), {
      isPaid,
      paymentStatus: orderStatus,
    });

    const getStoragePathFromUrl = (url: string): string | null => {
      try {
        const match = url.match(/\/o\/(.+?)\?/);
        if (!match) return null;
        return decodeURIComponent(match[1]);
      } catch {
        return null;
      }
    };

    // Validate attachments (best-effort; Storage rules enforce access; this prevents obvious spoofed URLs)
    let safeAttachments: any[] | undefined = undefined;
    if (hasAttachments) {
      if (attachments.length > 6) {
        return json({ error: 'Too many attachments' }, { status: 400 });
      }

      safeAttachments = [];
      for (const a of attachments) {
        const url = typeof a?.url === 'string' ? a.url : '';
        const kind = typeof a?.kind === 'string' ? a.kind : '';
        const id = typeof a?.id === 'string' ? a.id : '';
        if (!url || kind !== 'image') continue;
        const path = getStoragePathFromUrl(url);
        if (!path) continue;
        if (!path.startsWith(`messageThreads/${threadId}/attachments/`)) continue;

        safeAttachments.push({
          id: id || path.split('/').slice(-2)[0] || 'att',
          kind: 'image',
          url,
          contentType: typeof a?.contentType === 'string' ? a.contentType : undefined,
          sizeBytes: typeof a?.sizeBytes === 'number' ? a.sizeBytes : undefined,
          width: typeof a?.width === 'number' ? a.width : undefined,
          height: typeof a?.height === 'number' ? a.height : undefined,
          name: typeof a?.name === 'string' ? a.name : undefined,
        });
      }

      if (safeAttachments.length === 0) {
        return json({ error: 'Invalid attachments' }, { status: 400 });
      }
    }

    const previewText = sanitizeResult.sanitizedText.trim()
      ? sanitizeResult.sanitizedText.substring(0, 100)
      : safeAttachments?.length
      ? '📷 Photo'
      : '';

    // Store message
    const messagesRef = threadRef.collection('messages');
    const messageData = {
      threadId,
      senderId,
      recipientId,
      listingId,
      body: sanitizeResult.sanitizedText,
      ...(safeAttachments?.length ? { attachments: safeAttachments } : {}),
      createdAt: Timestamp.now(),
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
      updatedAt: Timestamp.now(),
      lastMessageAt: Timestamp.now(),
      lastMessagePreview: previewText,
      [`${senderId === threadData.buyerId ? 'buyer' : 'seller'}UnreadCount`]: 0,
      [unreadField]: FieldValue.increment(1),
      violationCount: newViolationCount,
      flagged: newViolationCount >= 3 || threadData.flagged || false,
    });

    // Payload for message notification (used for both emit and in-app doc)
    const listingRef = db.collection('listings').doc(listingId);
    const listingDoc = await listingRef.get();
    const listingData = listingDoc.exists ? listingDoc.data() : null;
    const listingTitle = listingData?.title || 'a listing';

    const messagePayload = {
      type: 'Message.Received' as const,
      threadId,
      listingId,
      listingTitle,
      listingUrl: `${getSiteUrl()}/listing/${listingId}`,
      threadUrl:
        recipientId === threadData.sellerId
          ? `${getSiteUrl()}/seller/messages?threadId=${threadId}`
          : `${getSiteUrl()}/dashboard/messages?threadId=${threadId}`,
      senderRole: (senderId === threadData.buyerId ? 'buyer' : 'seller') as 'buyer' | 'seller',
      preview: previewText,
    };

    // Emit canonical notification event for recipient (email/push fan-out)
    let emitEventId: string | null = null;
    try {
      const emitRes = await emitAndProcessEventForUser({
        type: 'Message.Received',
        actorId: senderId,
        entityType: 'message_thread',
        entityId: threadId,
        targetUserId: recipientId,
        payload: messagePayload,
        optionalHash: `msg:${messageRef.id}`,
      });
      if (emitRes?.ok && typeof emitRes.eventId === 'string') {
        emitEventId = emitRes.eventId;
      }
    } catch (emitErr) {
      console.error('Error emitting message_received event:', emitErr);
    }

    // Always create/update the in-app notification so the bell and badge work reliably,
    // even if event emission failed. Use stable doc id per thread (msg_thread:threadId).
    try {
      const notif = buildInAppNotification({
        eventId: emitEventId ?? `msg:${messageRef.id}`,
        eventType: 'Message.Received',
        category: 'messages',
        userId: recipientId,
        actorId: senderId,
        entityType: 'message_thread',
        entityId: threadId,
        payload: messagePayload,
      });
      await db
        .collection('users')
        .doc(recipientId)
        .collection('notifications')
        .doc(notif.id)
        .set(notif as any, { merge: true });
    } catch (notifWriteErr) {
      console.error('Error writing message in-app notification:', notifWriteErr);
    }

    // Best-effort: send the queued email job immediately so message emails don't depend on schedulers.
    if (emitEventId) {
      try {
        await Promise.race([
          tryDispatchEmailJobNow({ db: db as any, jobId: emitEventId, waitForJob: true }),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // ignore
      }
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
