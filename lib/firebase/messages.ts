/**
 * Message Thread and Message Management
 * Handles buyer-seller communication with sanitization
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from './config';
import { MessageThread, Message } from '@/lib/types';
import { sanitizeMessage, hasViolations } from '@/lib/safety/sanitizeMessage';

/**
 * Get or create a message thread between buyer and seller for a listing
 */
export async function getOrCreateThread(
  listingId: string,
  buyerId: string,
  sellerId: string
): Promise<string> {
  // Check if thread already exists
  const threadsRef = collection(db, 'messageThreads');
  const existingThreadQuery = query(
    threadsRef,
    where('listingId', '==', listingId),
    where('buyerId', '==', buyerId),
    where('sellerId', '==', sellerId),
    limit(1)
  );

  const existingThreads = await getDocs(existingThreadQuery);
  
  if (!existingThreads.empty) {
    return existingThreads.docs[0].id;
  }

  // Create new thread
  const threadData = {
    listingId,
    buyerId,
    sellerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    buyerUnreadCount: 0,
    sellerUnreadCount: 0,
    flagged: false,
    violationCount: 0,
    archived: false,
  };

  const threadRef = await addDoc(threadsRef, threadData);
  return threadRef.id;
}

/**
 * Send a message in a thread
 * Sanitizes the message based on payment status
 */
export async function sendMessage(
  threadId: string,
  senderId: string,
  recipientId: string,
  listingId: string,
  body: string,
  orderStatus?: 'pending' | 'paid' | 'completed'
): Promise<string> {
  // Preferred path: use the hardened server route that sanitizes server-side and creates recipient notifications
  // using Admin SDK (so it can write cross-user safely).
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Authentication required');
  }
  if (currentUser.uid !== senderId) {
    throw new Error('Invalid sender');
  }

  try {
    const token = await currentUser.getIdToken();
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        threadId,
        recipientId,
        listingId,
        messageBody: body,
        // orderStatus is intentionally not trusted by the server; it derives payment state itself.
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success && typeof data?.messageId === 'string') {
      return data.messageId as string;
    }

    // Fall back ONLY if the server route is unavailable (deploy/config transition).
    // If the server rejected the request (401/403/400/500), do NOT silently fall back,
    // because the legacy path cannot create reliable cross-user notifications.
    if (res.status !== 404 && res.status !== 503) {
      const msg =
        typeof data?.message === 'string'
          ? data.message
          : typeof data?.error === 'string'
          ? data.error
          : 'Failed to send message';
      const err: any = new Error(msg);
      if (typeof data?.code === 'string') err.code = data.code;
      throw err;
    }
  } catch (e: any) {
    // Network error or server route unavailable: fall back below for backwards compatibility.
    // But if we already have a structured app error, rethrow it.
    if (e?.code || /EMAIL_NOT_VERIFIED|LISTING_THREAD_MISMATCH/i.test(String(e?.message || ''))) {
      throw e;
    }
  }

  // Check if order exists and get payment status
  let isPaid = false;
  if (orderStatus) {
    isPaid = orderStatus === 'paid' || orderStatus === 'completed';
  } else {
    // Try to find order for this listing
    const ordersRef = collection(db, 'orders');
    const orderQuery = query(
      ordersRef,
      where('listingId', '==', listingId),
      where('buyerId', '==', senderId === recipientId ? undefined : senderId), // Buyer is sender or recipient
      limit(1)
    );
    const orders = await getDocs(orderQuery);
    if (!orders.empty) {
      const orderData = orders.docs[0].data();
      isPaid = orderData.status === 'paid' || orderData.status === 'completed';
    }
  }

  // Sanitize message
  const sanitizeResult = sanitizeMessage(body, {
    isPaid,
    paymentStatus: orderStatus,
  });

  // Store message (only store sanitized version, not original)
  const messagesRef = collection(db, 'messageThreads', threadId, 'messages');
  const messageData = {
    threadId,
    senderId,
    recipientId,
    listingId,
    body: sanitizeResult.sanitizedText, // Store sanitized version
    createdAt: serverTimestamp(),
    wasRedacted: sanitizeResult.wasRedacted,
    violationCount: sanitizeResult.violationCount,
    detectedViolations: sanitizeResult.detected,
    flagged: hasViolations(sanitizeResult) && sanitizeResult.violationCount >= 2, // Flag if 2+ violations
  };

  const messageRef = await addDoc(messagesRef, messageData);

  // Update thread
  const threadRef = doc(db, 'messageThreads', threadId);
  const threadDoc = await getDoc(threadRef);
  const threadData = threadDoc.data();

  // Increment violation count if violations detected
  const newViolationCount = (threadData?.violationCount || 0) + sanitizeResult.violationCount;
  
  await updateDoc(threadRef, {
    updatedAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: sanitizeResult.sanitizedText.substring(0, 100),
    [`${senderId === threadData?.buyerId ? 'buyer' : 'seller'}UnreadCount`]: 0, // Sender's unread = 0
    [`${senderId === threadData?.buyerId ? 'seller' : 'buyer'}UnreadCount`]: 
      (threadData?.[`${senderId === threadData?.buyerId ? 'seller' : 'buyer'}UnreadCount`] || 0) + 1,
    violationCount: newViolationCount,
    flagged: newViolationCount >= 3 || threadData?.flagged || false, // Flag if 3+ total violations
  });

  // NOTE: We intentionally do NOT create a recipient notification in this legacy client-side fallback path.
  // Cross-user notification writes should happen server-side (Admin SDK) to prevent spoofing.

  return messageRef.id;
}

/**
 * Get messages for a thread
 */
export async function getThreadMessages(threadId: string): Promise<Message[]> {
  const messagesRef = collection(db, 'messageThreads', threadId, 'messages');
  const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'));
  
  const snapshot = await getDocs(messagesQuery);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      readAt: data.readAt?.toDate(),
    } as Message;
  });
}

/**
 * Get threads for a user (buyer or seller)
 */
export async function getUserThreads(userId: string, role: 'buyer' | 'seller'): Promise<MessageThread[]> {
  const threadsRef = collection(db, 'messageThreads');
  const field = role === 'buyer' ? 'buyerId' : 'sellerId';

  // Primary query (fast + correct ordering). Requires a composite index:
  // - messageThreads: {buyerId|sellerId} ASC + updatedAt DESC (+ __name__ DESC in some cases)
  try {
    const threadsQuery = query(threadsRef, where(field, '==', userId), orderBy('updatedAt', 'desc'), limit(50));
    const snapshot = await getDocs(threadsQuery);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        lastMessageAt: data.lastMessageAt?.toDate(),
      } as MessageThread;
    });
  } catch (error: any) {
    const code = String(error?.code || '');
    const msg = String(error?.message || '');
    const isMissingIndex =
      code === 'failed-precondition' ||
      msg.toLowerCase().includes('requires an index') ||
      msg.toLowerCase().includes('failed-precondition');

    if (!isMissingIndex) throw error;

    // Fallback: query without orderBy (works without composite index) then sort client-side.
    // This avoids a hard outage while the index is still building / not deployed.
    console.warn('[getUserThreads] Missing index for ordered query; using fallback', { field, userId, code });
    const fallbackQuery = query(threadsRef, where(field, '==', userId), limit(250));
    const snapshot = await getDocs(fallbackQuery);
    const threads = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        lastMessageAt: data.lastMessageAt?.toDate(),
      } as MessageThread;
    });

    threads.sort((a, b) => (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0));
    return threads.slice(0, 50);
  }
}

/**
 * Mark thread messages as read
 */
export async function markThreadAsRead(threadId: string, userId: string): Promise<void> {
  const threadRef = doc(db, 'messageThreads', threadId);
  const threadDoc = await getDoc(threadRef);
  const threadData = threadDoc.data();

  if (!threadData) return;

  const fieldName = userId === threadData.buyerId ? 'buyerUnreadCount' : 'sellerUnreadCount';
  
  await updateDoc(threadRef, {
    [fieldName]: 0,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Flag a thread for admin review
 */
export async function flagThread(threadId: string, userId: string): Promise<void> {
  const threadRef = doc(db, 'messageThreads', threadId);
  await updateDoc(threadRef, {
    flagged: true,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Subscribe to thread messages (real-time)
 */
export function subscribeToThreadMessages(
  threadId: string,
  callback: (messages: Message[]) => void,
  opts?: { onError?: (error: any) => void }
): Unsubscribe {
  const messagesRef = collection(db, 'messageThreads', threadId, 'messages');
  const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const messages = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          readAt: data.readAt?.toDate(),
        } as Message;
      });
      callback(messages);
    },
    (error) => {
      opts?.onError?.(error);
    }
  );
}
