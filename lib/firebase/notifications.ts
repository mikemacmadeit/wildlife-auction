/**
 * Notification Management
 * Handles creating and managing user notifications
 */

import {
  collection,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { Notification, NotificationType } from '@/lib/types';

let warnedPermissions = false;
function handleListenerError(source: string, error: any, callback: (count: number) => void) {
  const code = String(error?.code || '');
  // This usually means Firestore rules haven't been deployed to match the repo,
  // or the app is pointing at a project with different rules.
  if (code === 'permission-denied') {
    if (!warnedPermissions) {
      warnedPermissions = true;
      console.warn(
        `[${source}] Firestore permission denied while subscribing to notifications. ` +
          `This typically means your deployed Firestore rules are missing the /users/{uid}/notifications rule. ` +
          `Deploy firestore.rules (or point local dev at the emulator).`
      );
    }
    callback(0);
    return;
  }

  console.error(`${source} error:`, error);
  callback(0);
}

/**
 * Create a notification for a user
 */
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl?: string;
  linkLabel?: string;
  listingId?: string;
  orderId?: string;
  threadId?: string;
  bidId?: string;
  metadata?: Record<string, any>;
}): Promise<string> {
  // P0: Notifications are server-controlled to prevent spoofing (users creating notifications for other users).
  // The Firestore rules intentionally disallow client-side creation.
  // If you need to create a notification, do it from a server route using the Admin SDK.
  throw new Error('createNotification is server-only. Use a server API route to create notifications.');
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
  const notificationRef = doc(db, 'users', userId, 'notifications', notificationId);
  await updateDoc(notificationRef, {
    read: true,
    readAt: serverTimestamp(),
  });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const notificationsRef = collection(db, 'users', userId, 'notifications');

  // Backward compatible: some older notification docs may not have `read` set.
  // We consider `read !== true` as unread and mark them read.
  const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(250));
  const snapshot = await getDocs(q);
  const batch = snapshot.docs
    .filter((docSnap) => (docSnap.data() as any)?.read !== true)
    .map((docSnap) =>
      updateDoc(docSnap.ref, {
        read: true,
        readAt: serverTimestamp(),
      })
    );

  await Promise.all(batch);
}

/**
 * Get notifications for a user
 */
export async function getUserNotifications(
  userId: string,
  limitCount: number = 50
): Promise<Notification[]> {
  const notificationsRef = collection(db, 'users', userId, 'notifications');
  const notificationsQuery = query(
    notificationsRef,
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snapshot = await getDocs(notificationsQuery);
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      readAt: data.readAt?.toDate(),
    } as Notification;
  });
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const notificationsRef = collection(db, 'users', userId, 'notifications');
  const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(250));
  const snapshot = await getDocs(q);
  return snapshot.docs.filter((d) => (d.data() as any)?.read !== true).length;
}

/**
 * Subscribe to notifications for a user (real-time)
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void,
  limitCount: number = 50
): Unsubscribe {
  const notificationsRef = collection(db, 'users', userId, 'notifications');
  const notificationsQuery = query(
    notificationsRef,
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  return onSnapshot(notificationsQuery, (snapshot) => {
    const notifications = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        readAt: data.readAt?.toDate(),
      } as Notification;
    });
    callback(notifications);
  });
}

/**
 * Subscribe to unread notification count (real-time)
 */
export function subscribeToUnreadCount(
  userId: string,
  callback: (count: number) => void
): Unsubscribe {
  const notificationsRef = collection(db, 'users', userId, 'notifications');

  // IMPORTANT: We intentionally do NOT query `where('read','==',false)` here.
  // Some historical notification docs may be missing `read`, which would make the unread badge incorrect.
  // Instead, we subscribe to the recent feed and count `read !== true` client-side.
  const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(250));

  return onSnapshot(
    q,
    (snapshot) => {
      const unread = snapshot.docs.filter((d) => (d.data() as any)?.read !== true).length;
      callback(unread);
    },
    (error) => {
      handleListenerError('subscribeToUnreadCount', error, callback);
    }
  );
}

/**
 * Subscribe to unread notification count for a specific notification type (real-time).
 * Useful for per-tab badges (e.g., unread messages only).
 */
export function subscribeToUnreadCountByType(
  userId: string,
  type: NotificationType,
  callback: (count: number) => void
): Unsubscribe {
  const notificationsRef = collection(db, 'users', userId, 'notifications');

  // Same as subscribeToUnreadCount: we count `read !== true` for migration-safety.
  const q = query(notificationsRef, where('type', '==', type), limit(250));

  return onSnapshot(
    q,
    (snapshot) => {
      const unread = snapshot.docs.filter((d) => (d.data() as any)?.read !== true).length;
      callback(unread);
    },
    (error) => {
      handleListenerError('subscribeToUnreadCountByType', error, callback);
    }
  );
}

/**
 * Mark all unread notifications of a specific type as read for a user.
 * This is used to "clear" badges in a persistent way (Firestore write).
 */
export async function markNotificationsAsReadByType(
  userId: string,
  type: NotificationType
): Promise<void> {
  const notificationsRef = collection(db, 'users', userId, 'notifications');

  // Backward compatible: older docs may not have `read` set.
  const q = query(notificationsRef, where('type', '==', type), limit(250));
  const snapshot = await getDocs(q);
  const batch = snapshot.docs
    .filter((docSnap) => (docSnap.data() as any)?.read !== true)
    .map((docSnap) =>
      updateDoc(docSnap.ref, {
        read: true,
        readAt: serverTimestamp(),
      })
    );

  await Promise.all(batch);
}
