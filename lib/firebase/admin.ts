import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;

function normalizePrivateKey(v: string | undefined): string | undefined {
  if (!v) return undefined;
  let s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.replace(/\\n/g, '\n');
}

/**
 * Initialize Firebase Admin deterministically.
 * In serverless production we require explicit service account env vars to avoid slow/unstable ADC.
 */
export function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  const isProd = process.env.NODE_ENV === 'production' || !!process.env.NETLIFY;
  const missing = [
    !projectId ? 'FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)' : null,
    !clientEmail ? 'FIREBASE_CLIENT_EMAIL' : null,
    !privateKey ? 'FIREBASE_PRIVATE_KEY' : null,
  ].filter(Boolean) as string[];

  if (isProd && missing.length > 0) {
    const err: any = new Error(`Firebase Admin not configured (missing: ${missing.join(', ')})`);
    err.code = 'FIREBASE_ADMIN_NOT_CONFIGURED';
    err.missing = missing;
    throw err;
  }

  const serviceAccount =
    projectId && clientEmail && privateKey
      ? { projectId, clientEmail, privateKey }
      : undefined;

  adminApp = serviceAccount ? initializeApp({ credential: cert(serviceAccount as any) }) : initializeApp();
  return adminApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

