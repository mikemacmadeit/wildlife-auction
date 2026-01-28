#!/usr/bin/env node
/**
 * Trigger a Netlify deploy with build cache cleared.
 * Requires NETLIFY_BUILD_HOOK_URL (from Netlify: Site config > Build & deploy > Build hooks).
 * Reads .env.local if present and not already set.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.NETLIFY_BUILD_HOOK_URL) {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  try {
    if (fs.existsSync(envPath)) {
      const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => /^\s*NETLIFY_BUILD_HOOK_URL\s*=/.test(l));
      if (line) {
        const m = line.match(/NETLIFY_BUILD_HOOK_URL\s*=\s*["']?([^"'\s#]+)/);
        if (m) process.env.NETLIFY_BUILD_HOOK_URL = m[1].trim();
      }
    }
  } catch (_) {}
}
const url = process.env.NETLIFY_BUILD_HOOK_URL;
if (!url || typeof url !== 'string' || !url.trim()) {
  console.error('Missing NETLIFY_BUILD_HOOK_URL.');
  console.error('');
  console.error('To trigger "Clear cache and deploy" from the repo:');
  console.error('1. In Netlify: Site configuration > Build & deploy > Build hooks');
  console.error('2. Add a build hook (branch: main), copy the URL');
  console.error('3. Run: NETLIFY_BUILD_HOOK_URL="<paste-url>" node scripts/trigger-netlify-deploy-clear-cache.mjs');
  console.error('');
  console.error('Or in the Netlify UI: Deploys > Trigger deploy > Clear cache and deploy site');
  process.exit(1);
}

const hookUrl = url.trim().replace(/\?.*$/, '') + '?clear_cache=true';
(async () => {
  try {
    const res = await fetch(hookUrl, { method: 'POST' });
    if (res.ok) {
      console.log('Deploy with cleared cache triggered successfully. Check the Netlify Deploys tab.');
      process.exit(0);
    }
    const text = await res.text();
    console.error('Netlify build hook returned', res.status, res.statusText, text || '');
    process.exit(1);
  } catch (e) {
    console.error('Request failed:', e.message);
    process.exit(1);
  }
})();
