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

    // If previously denied, browsers will not prompt again. Provide actionable guidance.
    const existingPerm = Notification.permission;
    if (existingPerm === 'denied') {
      // eslint-disable-next-line no-console
      console.warn('[push] browser notification permission is denied (previously blocked)');
      return {
        ok: false,
        error:
          'Notification permission is blocked in your browser. Enable notifications for wildlife.exchange in your browser/site settings, then try again.',
      };
    }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      // eslint-disable-next-line no-console
      console.warn('[push] notification permission not granted', { permission: perm });
      return {
        ok: false,
        error:
          perm === 'default'
            ? 'Notification permission was dismissed. Please click Allow when prompted.'
            : 'Notification permission denied',
      };
    }

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) return { ok: false, error: 'Missing NEXT_PUBLIC_FIREBASE_VAPID_KEY' };

    let reg: ServiceWorkerRegistration;
    try {
      reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[push] service worker registration failed', {
        path: '/firebase-messaging-sw.js',
        message: e?.message || String(e),
      });
      return { ok: false, error: 'Failed to register push service worker (/firebase-messaging-sw.js)' };
    }

    const messaging = getMessaging(app);
    let fcmToken: string;
    try {
      fcmToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[push] getToken failed', {
        message: e?.message || String(e),
      });
      return { ok: false, error: e?.message || 'Failed to get push token' };
    }
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
    if (!res.ok || !data?.ok) {
      // eslint-disable-next-line no-console
      console.error('[push] token registration failed', {
        status: res.status,
        error: data?.error || 'Failed to register token',
        code: data?.code,
        message: data?.message,
      });
      return { ok: false, error: data?.error || `Failed to register token (HTTP ${res.status})` };
    }
    return { ok: true, tokenId: data.tokenId };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[push] enablePushForCurrentDevice failed', { message: e?.message || String(e) });
    return { ok: false, error: e?.message || 'Failed to enable push' };
  }
}

