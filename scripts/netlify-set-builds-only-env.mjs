#!/usr/bin/env node
/**
 * Set large Firebase env vars to "Builds only" scope in Netlify so they are not
 * sent to Lambda (avoids the 4KB env limit). Requires NETLIFY_AUTH_TOKEN and site id.
 *
 * Usage:
 *   NETLIFY_AUTH_TOKEN=xxx node scripts/netlify-set-builds-only-env.mjs
 *   NETLIFY_AUTH_TOKEN=xxx NETLIFY_SITE_ID=xxx node scripts/netlify-set-builds-only-env.mjs
 * Or from repo root with netlify linked: netlify status then use site id.
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

function loadEnvLocal() {
  const p = path.resolve(__dirname, '..', '.env.local');
  if (!fs.existsSync(p)) return {};
  const raw = fs.readFileSync(p, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1).replace(/\\n/g, '\n');
    out[key] = val;
  }
  return out;
}

async function main() {
  const token = env('NETLIFY_AUTH_TOKEN');
  let siteId = env('NETLIFY_SITE_ID');

  if (!token) {
    console.error('Missing NETLIFY_AUTH_TOKEN.');
    console.error('Create one at: https://app.netlify.com/user/applications#personal-access-tokens');
    console.error('Then run: NETLIFY_AUTH_TOKEN=xxx node scripts/netlify-set-builds-only-env.mjs');
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

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
    console.error('Missing NETLIFY_SITE_ID. Run from repo with "netlify link" or set NETLIFY_SITE_ID.');
    process.exit(1);
  }

  let site;
  try {
    const r = await fetch(`${API}/sites/${siteId}`, { headers });
    if (!r.ok) throw new Error(await r.text());
    site = await r.json();
  } catch (e) {
    console.error('Failed to get site:', e.message);
    process.exit(1);
  }

  const accountId = site.account_id || site.account_slug;
  if (!accountId) {
    console.error('Could not determine account id from site.');
    process.exit(1);
  }

  let envVars;
  try {
    const r = await fetch(`${API}/accounts/${accountId}/env?site_id=${siteId}`, { headers });
    if (!r.ok) throw new Error(await r.text());
    envVars = await r.json();
  } catch (e) {
    console.error('Failed to list env vars:', e.message);
    process.exit(1);
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
  console.error(e);
  process.exit(1);
});
