/**
 * Notification Management
 * Handles creating and managing user notifications
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { Notification, NotificationType } from '@/lib/types';

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
  const notificationsRef = collection(db, 'notifications');
  
  const notificationData = {
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    read: false,
    createdAt: serverTimestamp(),
    linkUrl: params.linkUrl,
    linkLabel: params.linkLabel,
    listingId: params.listingId,
    orderId: params.orderId,
    threadId: params.threadId,
    bidId: params.bidId,
    metadata: params.metadata || {},
  };

  const notificationRef = await addDoc(notificationsRef, notificationData);
  return notificationRef.id;
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const notificationRef = doc(db, 'notifications', notificationId);
  await updateDoc(notificationRef, {
    read: true,
    readAt: serverTimestamp(),
  });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const notificationsRef = collection(db, 'notifications');
  const unreadQuery = query(
    notificationsRef,
    where('userId', '==', userId),
    where('read', '==', false)
  );
  
  const snapshot = await getDocs(unreadQuery);
  const batch = snapshot.docs.map(docSnap => 
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
  const notificationsRef = collection(db, 'notifications');
  const notificationsQuery = query(
    notificationsRef,
    where('userId', '==', userId),
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
  const notificationsRef = collection(db, 'notifications');
  const unreadQuery = query(
    notificationsRef,
    where('userId', '==', userId),
    where('read', '==', false)
  );
  
  const snapshot = await getDocs(unreadQuery);
  return snapshot.size;
}

/**
 * Subscribe to notifications for a user (real-time)
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notifications: Notification[]) => void,
  limitCount: number = 50
): Unsubscribe {
  const notificationsRef = collection(db, 'notifications');
  const notificationsQuery = query(
    notificationsRef,
    where('userId', '==', userId),
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
  const notificationsRef = collection(db, 'notifications');
  const unreadQuery = query(
    notificationsRef,
    where('userId', '==', userId),
    where('read', '==', false)
  );

  return onSnapshot(
    unreadQuery,
    (snapshot) => {
      callback(snapshot.size);
    },
    (error) => {
      console.error('subscribeToUnreadCount error:', error);
      // Prevent stale badges if listener fails (e.g., rules not yet deployed).
      callback(0);
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
  const notificationsRef = collection(db, 'notifications');
  const unreadQuery = query(
    notificationsRef,
    where('userId', '==', userId),
    where('type', '==', type),
    where('read', '==', false)
  );

  return onSnapshot(
    unreadQuery,
    (snapshot) => {
      callback(snapshot.size);
    },
    (error) => {
      console.error('subscribeToUnreadCountByType error:', error);
      callback(0);
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
  const notificationsRef = collection(db, 'notifications');
  const unreadQuery = query(
    notificationsRef,
    where('userId', '==', userId),
    where('type', '==', type),
    where('read', '==', false)
  );

  const snapshot = await getDocs(unreadQuery);
  const batch = snapshot.docs.map((docSnap) =>
    updateDoc(docSnap.ref, {
      read: true,
      readAt: serverTimestamp(),
    })
  );

  await Promise.all(batch);
}
