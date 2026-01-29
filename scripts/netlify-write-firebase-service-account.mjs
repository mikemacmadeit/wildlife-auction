import fs from 'node:fs';
import path from 'node:path';

/**
 * Netlify build helper
 *
 * Goal: keep the Firebase service account out of Lambda environment variables (AWS 4KB limit),
 * while still allowing us to provide it as a single secret in Netlify.
 *
 * Approach:
 * - Read FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 (Build-time only env var)
 * - Decode to JSON
 * - Write to netlify/secrets/firebase-service-account.json (NOT committed)
 * - Ensure Netlify includes this file in all functions via netlify.toml `functions."*".included_files`
 */

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
if (!b64) {
  // No-op in local dev or if user prefers split env vars.
  process.exit(0);
}

let decoded;
try {
  decoded = Buffer.from(b64, 'base64').toString('utf8');
} catch (e) {
  console.warn('[netlify-write-firebase-service-account] Failed to base64 decode FIREBASE_SERVICE_ACCOUNT_JSON_BASE64; skipping. Build continues.');
  process.exit(0);
}

let json;
try {
  json = JSON.parse(decoded);
} catch (e) {
  console.warn('[netlify-write-firebase-service-account] Decoded value is not valid JSON; skipping. Build continues.');
  process.exit(0);
}

const outDir = path.join(process.cwd(), 'netlify', 'secrets');
const outFile = path.join(outDir, 'firebase-service-account.json');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(json), { encoding: 'utf8' });

console.log('[netlify-write-firebase-service-account] Wrote netlify/secrets/firebase-service-account.json');

