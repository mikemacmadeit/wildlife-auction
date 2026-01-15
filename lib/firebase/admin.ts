import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let adminApp: App | null = null;

function normalizePrivateKey(v: string | undefined): string | undefined {
  if (!v) return undefined;
  let s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  // Netlify often stores multiline secrets as a single line with literal "\n".
  // Some setups can also include "\r\n" sequences.
  s = s.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  return s;
}

function readServiceAccountJsonIfPresent(): { projectId?: string; clientEmail?: string; privateKey?: string } | null {
  // Prefer GOOGLE_APPLICATION_CREDENTIALS if set.
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidatePaths = [
    fromEnv ? path.resolve(fromEnv) : null,
    // Local dev convenience (repo root). This should NOT be relied on in production.
    path.resolve(process.cwd(), 'serviceAccountKey.json'),
  ].filter(Boolean) as string[];

  for (const p of candidatePaths) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, 'utf8');
      const json = JSON.parse(raw);
      const projectId = json.project_id || json.projectId;
      const clientEmail = json.client_email || json.clientEmail;
      const privateKey = normalizePrivateKey(json.private_key || json.privateKey);
      if (projectId && clientEmail && privateKey) {
        return { projectId, clientEmail, privateKey };
      }
    } catch {
      // ignore and continue
    }
  }
  return null;
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

  const envProjectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const envClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const envPrivateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  // If env vars are incomplete (common in local dev), fall back to a JSON credential file if present.
  const fileSa = (!envProjectId || !envClientEmail || !envPrivateKey) ? readServiceAccountJsonIfPresent() : null;
  const projectId = envProjectId || fileSa?.projectId;
  const clientEmail = envClientEmail || fileSa?.clientEmail;
  const privateKey = envPrivateKey || fileSa?.privateKey;

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

  // If not configured, fall back to ADC (may work on some platforms). Prefer explicit credentials in prod.
  adminApp = serviceAccount ? initializeApp({ credential: cert(serviceAccount as any) }) : initializeApp();
  return adminApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

