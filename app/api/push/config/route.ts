/**
 * GET /api/push/config
 *
 * Returns the Firebase client config needed by the FCM service worker.
 * These values are not secrets (they are required client-side already),
 * but we keep them centralized + env-driven.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || null,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || null,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || null,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || null,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || null,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || null,
  };

  if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
    return json(
      {
        ok: false,
        error: 'Missing Firebase env config for messaging',
        config: {
          apiKey: Boolean(config.apiKey),
          projectId: Boolean(config.projectId),
          messagingSenderId: Boolean(config.messagingSenderId),
          appId: Boolean(config.appId),
        },
      },
      { status: 503 }
    );
  }

  return json({ ok: true, config });
}

