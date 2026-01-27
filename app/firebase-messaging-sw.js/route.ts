/**
 * Service worker script for Firebase Cloud Messaging (Web Push).
 *
 * This is served at /firebase-messaging-sw.js so it can control the origin scope.
 * We generate it dynamically so it can embed NEXT_PUBLIC_FIREBASE_* at build/runtime.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function js(body: string, init?: { status?: number }) {
  return new Response(body, {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
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
    // Still return a valid service worker script (no-op) so registration doesn't hard-fail.
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
    const title = payload?.notification?.title || 'Agchange';
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

