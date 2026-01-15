import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { createPrivateKey } from 'crypto';

let adminApp: App | null = null;

function normalizePrivateKey(v: string | undefined): string | undefined {
  if (!v) return undefined;
  let s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  // Netlify/GitHub/etc can store multiline secrets with escaped newlines, sometimes double-escaped.
  // Example bad inputs:
  // - "-----BEGIN PRIVATE KEY-----\\n....\\n-----END PRIVATE KEY-----\\n"
  // - "-----BEGIN PRIVATE KEY-----\\\\n....\\\\n-----END PRIVATE KEY-----"
  while (s.includes('\\\\n') || s.includes('\\\\r\\\\n')) {
    s = s.replace(/\\\\r\\\\n/g, '\\r\\n').replace(/\\\\n/g, '\\n');
  }
  // Now convert escaped sequences into actual newlines.
  s = s.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  s = s.trim();

  // Validate it looks like a PEM key. If not, fail loudly so routes return a useful 503 instead of
  // falling back to ADC/metadata (which can crash in Netlify).
  const looksLikePem =
    s.includes('-----BEGIN PRIVATE KEY-----') ||
    s.includes('-----BEGIN RSA PRIVATE KEY-----') ||
    s.includes('-----BEGIN EC PRIVATE KEY-----');
  if (!looksLikePem) {
    const err: any = new Error(
      'FIREBASE_PRIVATE_KEY does not look like a PEM private key. Paste the full key including BEGIN/END lines. ' +
        'If you are using escaped newlines, use \\n between lines.'
    );
    err.code = 'FIREBASE_PRIVATE_KEY_INVALID_FORMAT';
    throw err;
  }

  // Validate the key is actually parseable by the runtime crypto provider.
  // This catches truncated/mangled keys early (common with env inlining/escaping issues),
  // preventing confusing downstream gRPC "metadata plugin" errors.
  try {
    createPrivateKey(s);
  } catch (e: any) {
    const err: any = new Error(
      'FIREBASE_PRIVATE_KEY was found but could not be parsed by Node crypto. This usually means the value is truncated or malformed.'
    );
    err.code = 'FIREBASE_PRIVATE_KEY_UNREADABLE';
    err.details = {
      length: s.length,
      lines: s.split('\n').length,
      beginsWith: s.slice(0, 30),
      endsWith: s.slice(-30),
      cryptoMessage: e?.message,
    };
    throw err;
  }
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

function readServiceAccountJsonFromBundledFile(): { projectId?: string; clientEmail?: string; privateKey?: string } | null {
  // Netlify build step can generate this file (see scripts/netlify-write-firebase-service-account.mjs).
  // It is then bundled into all functions via netlify.toml `functions."*".included_files`.
  try {
    const p = path.resolve(process.cwd(), 'netlify', 'secrets', 'firebase-service-account.json');
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const json = JSON.parse(raw);
    const projectId = json.project_id || json.projectId;
    const clientEmail = json.client_email || json.clientEmail;
    const privateKey = normalizePrivateKey(json.private_key || json.privateKey);
    if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
  } catch {
    // ignore and fall through
  }
  return null;
}

function readServiceAccountJsonBase64FromEnv(): { projectId?: string; clientEmail?: string; privateKey?: string } | null {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!b64) return null;
  try {
    const raw = Buffer.from(b64, 'base64').toString('utf8');
    const json = JSON.parse(raw);
    const projectId = json.project_id || json.projectId;
    const clientEmail = json.client_email || json.clientEmail;
    const privateKey = normalizePrivateKey(json.private_key || json.privateKey);
    if (projectId && clientEmail && privateKey) {
      return { projectId, clientEmail, privateKey };
    }
    const err: any = new Error('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 decoded but is missing required fields');
    err.code = 'FIREBASE_SERVICE_ACCOUNT_JSON_BASE64_INVALID';
    err.missing = [
      !projectId ? 'project_id' : null,
      !clientEmail ? 'client_email' : null,
      !privateKey ? 'private_key' : null,
    ].filter(Boolean);
    throw err;
  } catch (e: any) {
    if (e?.code) throw e;
    const err: any = new Error('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 could not be decoded/parsed as JSON');
    err.code = 'FIREBASE_SERVICE_ACCOUNT_JSON_BASE64_UNREADABLE';
    err.details = { message: e?.message };
    throw err;
  }
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

  // Preferred (Netlify): bundled JSON file generated at build time (avoids AWS Lambda 4KB env var limit).
  const fileSaBundled = readServiceAccountJsonFromBundledFile();

  // Preferred (generic): single base64 JSON blob.
  // IMPORTANT: on Netlify Functions, do NOT provide this as a runtime env var because it can exceed the AWS 4KB limit.
  // Use build-only + bundled file instead.
  const b64Sa = !fileSaBundled ? readServiceAccountJsonBase64FromEnv() : null;

  const envProjectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const envClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // IMPORTANT: do NOT parse/validate FIREBASE_PRIVATE_KEY unless we actually need to use it.
  // In Netlify builds, a malformed FIREBASE_PRIVATE_KEY env var (even if unused) can crash `next build`
  // because some route modules are imported during "Collecting page data".
  const envPrivateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  // If env vars are incomplete (common in local dev), fall back to a JSON credential file if present.
  const fileSa = (!envProjectId || !envClientEmail || !envPrivateKeyRaw) ? readServiceAccountJsonIfPresent() : null;

  const projectId = fileSaBundled?.projectId || b64Sa?.projectId || envProjectId || fileSa?.projectId;
  const clientEmail = fileSaBundled?.clientEmail || b64Sa?.clientEmail || envClientEmail || fileSa?.clientEmail;

  // Only normalize/validate the split-key form if we actually fall back to it.
  const privateKey =
    fileSaBundled?.privateKey ||
    b64Sa?.privateKey ||
    (envPrivateKeyRaw ? normalizePrivateKey(envPrivateKeyRaw) : undefined) ||
    fileSa?.privateKey;

  // Only hard-require credentials when running on Netlify runtime.
  // Local `next build` sets NODE_ENV=production, but should not require Admin creds to compile.
  const isProd = !!process.env.NETLIFY;
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

