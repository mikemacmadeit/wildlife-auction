/**
 * Client-side helper to enable push notifications (FCM Web).
 *
 * This:
 * - Requests Notification permission
 * - Registers /firebase-messaging-sw.js
 * - Obtains an FCM token using NEXT_PUBLIC_FIREBASE_VAPID_KEY
 * - Registers token server-side via /api/push/register
 */

'use client';

import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app } from '@/lib/firebase/config';

export async function enablePushForCurrentDevice(params: {
  idToken: string;
  platform?: string;
}): Promise<{ ok: boolean; tokenId?: string; error?: string }> {
  try {
    const supported = await isSupported();
    if (!supported) return { ok: false, error: 'Push not supported in this browser' };

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, error: 'Notification permission denied' };

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) return { ok: false, error: 'Missing NEXT_PUBLIC_FIREBASE_VAPID_KEY' };

    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(app);
    const fcmToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (!fcmToken) return { ok: false, error: 'Failed to get push token' };

    const res = await fetch('/api/push/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.idToken}`,
      },
      body: JSON.stringify({ token: fcmToken, platform: params.platform || 'web' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) return { ok: false, error: data?.error || 'Failed to register token' };
    return { ok: true, tokenId: data.tokenId };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to enable push' };
  }
}

