#!/usr/bin/env node
/**
 * Set large Firebase env vars to "Builds only" scope in Netlify so they are not
 * sent to Lambda (avoids the 4KB env limit). Runs at start of Netlify build when
 * NETLIFY_AUTH_TOKEN is set. No-op otherwise (local builds, or add token in Netlify UI).
 *
 * One-time setup: In Netlify → Site configuration → Environment variables, add
 *   NETLIFY_AUTH_TOKEN = (create at https://app.netlify.com/user/applications#personal-access-tokens)
 *   Scope: Builds only (so it's not sent to Lambda). Then deploy; this script runs and fixes the rest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://api.netlify.com/api/v1';

const BUILD_ONLY_KEYS = [
  'FIREBASE_SERVICE_ACCOUNT_JSON_BASE64',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
];

function env(name) {
  const v = process.env[name];
  return v != null && v !== '' ? v.trim() : '';
}

async function main() {
  const token = env('NETLIFY_AUTH_TOKEN');
  // Netlify build provides SITE_ID; CLI/local may use NETLIFY_SITE_ID or .netlify/state.json
  let siteId = env('SITE_ID') || env('NETLIFY_SITE_ID');

  if (!token) {
    // No-op: don't fail build. User can add token in Netlify UI once to enable auto-fix.
    process.exit(0);
  }

  if (!siteId) {
    const configPath = path.resolve(__dirname, '..', '.netlify', 'state.json');
    if (fs.existsSync(configPath)) {
      try {
        const state = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        siteId = state.siteId || '';
      } catch (_) {}
    }
  }
  if (!siteId) {
    console.warn('[netlify-set-builds-only-env] SITE_ID not set; skipping (no-op).');
    process.exit(0);
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  let site;
  try {
    const r = await fetch(`${API}/sites/${siteId}`, { headers });
    if (!r.ok) throw new Error(await r.text());
    site = await r.json();
  } catch (e) {
    console.warn('[netlify-set-builds-only-env] Failed to get site:', e.message, '- skipping.');
    process.exit(0);
  }

  const accountId = site.account_id || site.account_slug;
  if (!accountId) {
    console.warn('[netlify-set-builds-only-env] No account id; skipping.');
    process.exit(0);
  }

  let envVars;
  try {
    const r = await fetch(`${API}/accounts/${accountId}/env?site_id=${siteId}`, { headers });
    if (!r.ok) throw new Error(await r.text());
    envVars = await r.json();
  } catch (e) {
    console.warn('[netlify-set-builds-only-env] Failed to list env vars:', e.message, '- skipping.');
    process.exit(0);
  }

  const byKey = new Map(envVars.map((e) => [e.key, e]));
  let updated = 0;
  let skipped = 0;

  for (const key of BUILD_ONLY_KEYS) {
    const ev = byKey.get(key);
    if (!ev) {
      continue;
    }
    const hasFunctions = Array.isArray(ev.scopes) && ev.scopes.includes('functions');
    if (!hasFunctions) {
      console.log(`  ${key}: already Builds only (or other scope), skipping.`);
      skipped++;
      continue;
    }
    const newScopes = ['builds'];
    const values = Array.isArray(ev.values) ? ev.values : [];
    const hasValues = values.every((v) => v && typeof v.value === 'string' && v.value.length > 0);
    if (!hasValues && values.length > 0) {
      console.warn(`  ${key}: secret values not readable via API. Set scope to "Builds only" in Netlify UI.`);
      skipped++;
      continue;
    }
    try {
      const body = { key, scopes: newScopes, values, is_secret: !!ev.is_secret };
      const r = await fetch(`${API}/accounts/${accountId}/env/${encodeURIComponent(key)}?site_id=${siteId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      console.log(`  ${key}: set to Builds only.`);
      updated++;
    } catch (e) {
      console.error(`  ${key}: update failed:`, e.message);
    }
  }

  console.log('');
  if (updated > 0) {
    console.log(`Done. ${updated} variable(s) set to Builds only. Trigger a new deploy (e.g. Deploys > Trigger deploy).`);
  }
  if (skipped > 0 && updated === 0) {
    console.log('No updates made. If vars are secret, set scope in Netlify UI: Site configuration > Environment variables.');
  }
}

main().catch((e) => {
  console.warn('[netlify-set-builds-only-env]', e.message || e);
  process.exit(0);
});
