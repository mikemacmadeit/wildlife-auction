/* eslint-disable no-undef */
/* eslint-disable no-restricted-globals */
/**
 * Firebase Cloud Messaging service worker.
 *
 * This file MUST be served at:
 *   /firebase-messaging-sw.js
 *
 * We intentionally avoid hardcoding Firebase config. Instead, we fetch it from:
 *   /api/push/config
 *
 * Notes:
 * - Firebase "public" config values are not secrets, but this keeps consistency with env-based config.
 * - If the config endpoint is unavailable, we still keep a working service worker for notification clicks,
 *   but background message handling may be degraded until config is reachable.
 */
(() => {
  // Match the installed Firebase version where possible.
  // If you upgrade `firebase`, update these CDN URLs accordingly.
  const FIREBASE_VERSION = '12.7.0';
  const APP_COMPAT = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js`;
  const MESSAGING_COMPAT = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging-compat.js`;

  try {
    importScripts(APP_COMPAT);
    importScripts(MESSAGING_COMPAT);
  } catch (e) {
    // If Firebase scripts fail to load, we can still handle notification clicks.
  }

  let initPromise = null;

  async function fetchConfig() {
    const res = await fetch('/api/push/config', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || !data.ok || !data.config) {
      throw new Error(data?.error || `Failed to fetch push config (HTTP ${res.status})`);
    }
    return data.config;
  }

  async function initMessaging() {
    if (typeof firebase === 'undefined' || !firebase?.initializeApp) return null;
    if (firebase.apps && firebase.apps.length > 0) {
      try {
        return firebase.messaging();
      } catch {
        return null;
      }
    }
    const cfg = await fetchConfig();
    firebase.initializeApp(cfg);
    try {
      return firebase.messaging();
    } catch {
      return null;
    }
  }

  function ensureInit() {
    if (!initPromise) {
      initPromise = initMessaging().catch(() => null);
    }
    return initPromise;
  }

  // Background message handling (best-effort)
  ensureInit().then((messaging) => {
    if (!messaging || !messaging.onBackgroundMessage) return;

    messaging.onBackgroundMessage((payload) => {
      const n = payload?.notification || {};
      const data = payload?.data || {};

      const title = String(n.title || 'Agchange');
      const body = String(n.body || '');
      const deepLinkUrl = data.deepLinkUrl ? String(data.deepLinkUrl) : '';

      const options = {
        body,
        data: {
          deepLinkUrl,
          notificationType: data.notificationType ? String(data.notificationType) : '',
          entityId: data.entityId ? String(data.entityId) : '',
        },
      };

      // Show the notification. If this fails, the user may still receive it via browser defaults.
      try {
        self.registration.showNotification(title, options);
      } catch {
        // ignore
      }
    });
  });

  // Click handling for deep links
  self.addEventListener('notificationclick', (event) => {
    try {
      event.notification.close();
    } catch {}

    const deepLinkUrl = event?.notification?.data?.deepLinkUrl;
    const urlToOpen = typeof deepLinkUrl === 'string' && deepLinkUrl ? deepLinkUrl : '/';

    event.waitUntil(
      (async () => {
        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of allClients) {
          if ('focus' in client) {
            try {
              await client.focus();
              // Try to navigate the focused tab if possible.
              if ('navigate' in client) {
                await client.navigate(urlToOpen);
              }
              return;
            } catch {
              // continue
            }
          }
        }
        if (self.clients.openWindow) {
          await self.clients.openWindow(urlToOpen);
        }
      })()
    );
  });
})();

/* eslint-disable */
/**
 * Firebase Cloud Messaging service worker (root scope).
 *
 * This file must be served from the origin root at `/firebase-messaging-sw.js`.
 *
 * We keep this static and tiny, and delegate the actual Firebase initialization to a runtime-served
 * script so environment variables can be embedded by the server route safely.
 */
try {
  // Runtime script served by Next route: `/firebase-messaging-sw-runtime.js`
  importScripts('/firebase-messaging-sw-runtime.js');
} catch (e) {
  // No-op fallback: keep SW valid so registration doesn't hard-fail.
  self.addEventListener('push', () => {});
  self.addEventListener('notificationclick', () => {});
}

