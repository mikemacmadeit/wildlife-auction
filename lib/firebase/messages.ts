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
  startAfter,
  arrayUnion,
  increment,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';
import { auth, db } from './config';
import type { MessageAttachment, MessageThread, Message } from '@/lib/types';
import { sanitizeMessage, hasViolations } from '@/lib/safety/sanitizeMessage';

/**
 * Get or create a message thread between buyer and seller for a listing
 */
export async function getOrCreateThread(
  listingId: string,
  buyerId: string,
  sellerId: string
): Promise<string> {
  // Preferred path: create/get thread via server endpoint which validates listing↔seller relationship.
  // buyerId is derived from the auth token server-side; we still keep buyerId in the signature for backwards compatibility.
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Authentication required');
  }
  if (currentUser.uid !== buyerId) {
    throw new Error('Invalid buyer');
  }

  try {
    const token = await currentUser.getIdToken();
    const res = await fetch('/api/messages/thread', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ listingId, sellerId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok && typeof data?.threadId === 'string') {
      return data.threadId as string;
    }

    // Only fall back when the server route is unavailable (deploy/config transition).
    if (res.status !== 404 && res.status !== 503) {
      const msg =
        typeof data?.message === 'string'
          ? data.message
          : typeof data?.error === 'string'
          ? data.error
          : 'Failed to create thread';
      const err: any = new Error(msg);
      if (typeof data?.code === 'string') err.code = data.code;
      throw err;
    }
  } catch (e: any) {
    // Network error or server route unavailable: fall back below for backwards compatibility.
    // But if we already have a structured app error, rethrow it.
    if (e?.code || /LISTING_SELLER_MISMATCH/i.test(String(e?.message || ''))) {
      throw e;
    }
  }

  // Fallback (legacy): still validate listing↔seller relationship client-side before creating any thread.
  try {
    const listingRef = doc(db, 'listings', listingId);
    const listingSnap = await getDoc(listingRef);
    const listing = listingSnap.exists() ? (listingSnap.data() as any) : null;
    const canonicalSellerId = listing?.sellerId ? String(listing.sellerId) : '';
    if (!canonicalSellerId || canonicalSellerId !== sellerId) {
      const err: any = new Error('Invalid listing/seller relationship');
      err.code = 'LISTING_SELLER_MISMATCH';
      throw err;
    }
  } catch (e: any) {
    // If we cannot validate, fail closed rather than creating a potentially spoofed thread.
    throw e;
  }

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
  orderStatus?: 'pending' | 'paid' | 'completed',
  opts?: { attachments?: MessageAttachment[] }
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
        attachments: Array.isArray(opts?.attachments) ? opts?.attachments : undefined,
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

  const safeBody = String(body || '');

  // Sanitize message
  const sanitizeResult = sanitizeMessage(safeBody, {
    isPaid,
    paymentStatus: orderStatus,
  });

  const hasAttachments = Array.isArray(opts?.attachments) && opts!.attachments!.length > 0;
  const previewText = sanitizeResult.sanitizedText.trim()
    ? sanitizeResult.sanitizedText.substring(0, 100)
    : hasAttachments
    ? '📷 Photo'
    : '';

  // Store message (only store sanitized version, not original)
  const messagesRef = collection(db, 'messageThreads', threadId, 'messages');
  const messageData = {
    threadId,
    senderId,
    recipientId,
    listingId,
    body: sanitizeResult.sanitizedText, // Store sanitized version
    ...(hasAttachments ? { attachments: opts!.attachments } : {}),
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
    lastMessagePreview: previewText,
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
 * Get ALL threads for a user (buyer + seller roles merged).
 * This prevents "missing conversations" when a user starts a thread as a buyer but later views Messages from seller UI (or vice versa).
 */
export async function getAllUserThreads(userId: string): Promise<MessageThread[]> {
  const [asBuyer, asSeller] = await Promise.allSettled([
    getUserThreads(userId, 'buyer'),
    getUserThreads(userId, 'seller'),
  ]);

  const merged: MessageThread[] = [];
  if (asBuyer.status === 'fulfilled') merged.push(...asBuyer.value);
  if (asSeller.status === 'fulfilled') merged.push(...asSeller.value);

  // De-dupe by thread id (shouldn't happen, but be defensive)
  const byId = new Map<string, MessageThread>();
  for (const t of merged) byId.set(t.id, t);
  const out = Array.from(byId.values());

  out.sort((a, b) => (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0));
  return out.slice(0, 50);
}

function isMissingIndexError(error: any): boolean {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === 'failed-precondition' ||
    msg.includes('requires an index') ||
    msg.includes('failed-precondition') ||
    msg.includes('index')
  );
}

function toThread(docSnap: QueryDocumentSnapshot<DocumentData>): MessageThread {
  const data = docSnap.data() as any;
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate?.() || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || new Date(),
    lastMessageAt: data.lastMessageAt?.toDate?.(),
  } as MessageThread;
}

/**
 * Subscribe to threads for a user role (buyer OR seller) in real-time.
 * Uses an ordered query when indexes are available; falls back to unordered + client sort.
 */
export function subscribeToUserThreads(
  userId: string,
  role: 'buyer' | 'seller',
  callback: (threads: MessageThread[]) => void,
  opts?: { onError?: (error: any) => void }
): Unsubscribe {
  const threadsRef = collection(db, 'messageThreads');
  const field = role === 'buyer' ? 'buyerId' : 'sellerId';

  const orderedQ = query(threadsRef, where(field, '==', userId), orderBy('updatedAt', 'desc'), limit(50));
  const fallbackQ = query(threadsRef, where(field, '==', userId), limit(250));

  let unsub: Unsubscribe = () => {};
  let usingFallback = false;

  const start = (q: any, fallback: boolean) => {
    usingFallback = fallback;
    unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        const threads = snap.docs.map(toThread);
        if (fallback) {
          threads.sort((a, b) => (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0));
        }
        callback(threads.slice(0, 50));
      },
      (err) => {
        // If we don't have the composite index yet, retry with fallback query.
        if (!usingFallback && isMissingIndexError(err)) {
          console.warn('[subscribeToUserThreads] Missing index; using fallback subscription', { field, userId });
          try {
            unsub();
          } catch {
            // ignore
          }
          start(fallbackQ, true);
          return;
        }
        opts?.onError?.(err);
      }
    );
  };

  start(orderedQ, false);
  return () => unsub();
}

/**
 * Subscribe to ALL threads for a user (buyer + seller merged).
 */
export function subscribeToAllUserThreads(
  userId: string,
  callback: (threads: MessageThread[]) => void,
  opts?: { onError?: (error: any) => void }
): Unsubscribe {
  let buyerThreads: MessageThread[] = [];
  let sellerThreads: MessageThread[] = [];

  const emit = () => {
    const byId = new Map<string, MessageThread>();
    for (const t of buyerThreads) byId.set(t.id, t);
    for (const t of sellerThreads) byId.set(t.id, t);
    const out = Array.from(byId.values());
    out.sort((a, b) => (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0));
    callback(out.slice(0, 50));
  };

  const unsubBuyer = subscribeToUserThreads(
    userId,
    'buyer',
    (t) => {
      buyerThreads = t;
      emit();
    },
    opts
  );
  const unsubSeller = subscribeToUserThreads(
    userId,
    'seller',
    (t) => {
      sellerThreads = t;
      emit();
    },
    opts
  );

  return () => {
    try {
      unsubBuyer();
    } catch {}
    try {
      unsubSeller();
    } catch {}
  };
}

/**
 * Archive/unarchive a thread (server authoritative).
 * Firestore rules intentionally don't allow participants to update `archived`, so we route via API.
 */
export async function setThreadArchived(threadId: string, archived: boolean): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Authentication required');

  const token = await currentUser.getIdToken();
  const res = await fetch(`/api/messages/thread/${encodeURIComponent(threadId)}/archive`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ archived: Boolean(archived) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    const msg = typeof data?.message === 'string' ? data.message : typeof data?.error === 'string' ? data.error : 'Failed to update thread';
    const err: any = new Error(msg);
    if (typeof data?.code === 'string') err.code = data.code;
    throw err;
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

  const isBuyer = userId === threadData.buyerId;
  const fieldName = isBuyer ? 'buyerUnreadCount' : 'sellerUnreadCount';
  const lastReadField = isBuyer ? 'buyerLastReadAt' : 'sellerLastReadAt';
  
  await updateDoc(threadRef, {
    [fieldName]: 0,
    [lastReadField]: serverTimestamp(),
  });
}

/**
 * Flag a thread for admin review
 */
export async function flagThread(
  threadId: string,
  userId: string,
  opts?: { reason?: string; details?: string }
): Promise<void> {
  const threadRef = doc(db, 'messageThreads', threadId);
  await updateDoc(threadRef, {
    flagged: true,
    flagCount: increment(1),
    flaggedBy: arrayUnion(userId),
    flaggedAt: serverTimestamp(),
    flaggedReason: opts?.reason || null,
    flaggedDetails: opts?.details || null,
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

function docToMessage(docSnap: QueryDocumentSnapshot<DocumentData>): Message {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate?.() || new Date(),
    readAt: data.readAt?.toDate?.(),
  } as Message;
}

export type ThreadMessagesPage = {
  messages: Message[];
  oldestCursor: QueryDocumentSnapshot<DocumentData> | null;
};

/**
 * Subscribe to the latest N messages for a thread (paged real-time).
 * Useful for performance on large threads.
 */
export function subscribeToThreadMessagesPage(
  threadId: string,
  pageSize: number,
  callback: (page: ThreadMessagesPage) => void,
  opts?: { onError?: (error: any) => void }
): Unsubscribe {
  // Clamp pageSize to >= 1 to prevent -1/NaN/undefined from causing int32 serialization errors
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 50;
  // Tripwire: catch invalid pageSize before Firestore query (client SDK, but still validate)
  if (typeof safePageSize === 'number' && !Number.isNaN(safePageSize) && safePageSize >= 0 && safePageSize <= 2147483647) {
    // Valid - client SDK will handle it
  }
  const messagesRef = collection(db, 'messageThreads', threadId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(safePageSize));

  return onSnapshot(
    q,
    (snapshot) => {
      const docs = snapshot.docs;
      const oldestCursor = docs.length ? docs[docs.length - 1] : null;
      const msgs = docs.map(docToMessage);
      // Normalize for UI: oldest -> newest
      msgs.sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0));
      callback({ messages: msgs, oldestCursor });
    },
    (error) => {
      opts?.onError?.(error);
    }
  );
}

/**
 * Fetch older messages (older than the given cursor), descending query, returns oldest->newest.
 */
export async function fetchOlderThreadMessages(params: {
  threadId: string;
  pageSize: number;
  before: QueryDocumentSnapshot<DocumentData>;
}): Promise<ThreadMessagesPage> {
  // Clamp pageSize to >= 1 to prevent -1/NaN/undefined from causing int32 serialization errors
  const safePageSize = Number.isFinite(params.pageSize) && params.pageSize > 0 ? Math.floor(params.pageSize) : 50;
  // Tripwire: catch invalid pageSize before Firestore query (client SDK, but still validate)
  if (typeof safePageSize === 'number' && !Number.isNaN(safePageSize) && safePageSize >= 0 && safePageSize <= 2147483647) {
    // Valid - client SDK will handle it
  }
  const messagesRef = collection(db, 'messageThreads', params.threadId, 'messages');
  const q = query(messagesRef, orderBy('createdAt', 'desc'), startAfter(params.before), limit(safePageSize));
  const snap = await getDocs(q);
  const docs = snap.docs;
  const oldestCursor = docs.length ? docs[docs.length - 1] : null;
  const msgs = docs.map(docToMessage);
  msgs.sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0));
  return { messages: msgs, oldestCursor };
}

/**
 * Best-effort typing indicator. Writes a short-lived typing TTL to the thread doc.
 */
export async function setThreadTyping(opts: {
  threadId: string;
  userId: string;
  buyerId: string;
  sellerId: string;
  isTyping: boolean;
}): Promise<void> {
  const fieldName = opts.userId === opts.buyerId ? 'buyerTypingUntil' : 'sellerTypingUntil';
  const threadRef = doc(db, 'messageThreads', opts.threadId);

  await updateDoc(threadRef, {
    [fieldName]: opts.isTyping ? Timestamp.fromMillis(Date.now() + 8000) : null,
  });
}
