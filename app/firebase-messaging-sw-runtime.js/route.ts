/**
 * Runtime-served Firebase Messaging service worker implementation.
 *
 * Served at `/firebase-messaging-sw-runtime.js` and loaded via importScripts()
 * from the static root service worker at `/firebase-messaging-sw.js`.
 *
 * This lets us embed NEXT_PUBLIC_FIREBASE_* at runtime without requiring templating
 * inside `/public`.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function js(body: string, init?: { status?: number }) {
  return new Response(body, {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      // Service worker scripts should not be cached aggressively during rollout.
      'cache-control': 'no-store',
    },
  });
}

export async function GET() {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };

  if (!cfg.apiKey || !cfg.projectId || !cfg.messagingSenderId || !cfg.appId) {
    // Still return valid JS so importScripts succeeds; push will be a no-op.
    return js(`self.addEventListener('push', () => {});`);
  }

  const body = `
/* eslint-disable */
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(cfg)});
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  try {
    const title = payload?.notification?.title || 'Wildlife Exchange';
    const body = payload?.notification?.body || '';
    const deepLinkUrl = payload?.data?.deepLinkUrl || '';
    self.registration.showNotification(title, {
      body,
      data: { deepLinkUrl },
    });
  } catch (e) {}
});

self.addEventListener('notificationclick', (event) => {
  try {
    event.notification.close();
    const url = event.notification?.data?.deepLinkUrl;
    if (url) {
      event.waitUntil(clients.openWindow(url));
    }
  } catch (e) {}
});
`;

  return js(body);
}

