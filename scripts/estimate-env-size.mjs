#!/usr/bin/env node
/**
 * Estimate total size of environment variables as they would be sent to AWS Lambda.
 * Netlify sends all site env vars (with "Functions" scope) to each function; Lambda limit is 4KB.
 * Run locally after loading .env files to see which vars are largest and should be "Builds only".
 *
 * Usage: node scripts/estimate-env-size.mjs
 * (Load .env first if desired: set NODE_OPTIONS=--env-file=.env.local or run from env that has vars.)
 */

import fs from 'node:fs';
import path from 'node:path';

const LIMIT_BYTES = 4096;
const root = process.cwd();

function loadEnvFile(filePath) {
  const full = path.join(root, filePath);
  if (!fs.existsSync(full)) return {};
  const raw = fs.readFileSync(full, 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1).replace(/\\n/g, '\n');
    out[key] = val;
  }
  return out;
}

// Merge in order: .env, .env.local, .env.production, .env.production.local (later overrides)
const env = {
  ...loadEnvFile('.env'),
  ...loadEnvFile('.env.local'),
  ...loadEnvFile('.env.production'),
  ...loadEnvFile('.env.production.local'),
};

// Also include process.env so that CI/Netlify-style runs (vars already set) are reflected
for (const [k, v] of Object.entries(process.env)) {
  if (v !== undefined && v !== '') env[k] = v;
}

// Lambda stores each as key=value; approximate size (key + '=' + value + null byte overhead)
function entrySize(key, value) {
  const v = String(value ?? '');
  return Buffer.byteLength(key, 'utf8') + 1 + Buffer.byteLength(v, 'utf8') + 1;
}

const entries = Object.entries(env)
  .filter(([, v]) => v != null && v !== '')
  .map(([k, v]) => ({ key: k, value: String(v), size: entrySize(k, v) }));

const total = entries.reduce((acc, e) => acc + e.size, 0);
entries.sort((a, b) => b.size - a.size);

console.log('Environment variables size estimate (as sent to Lambda):');
console.log(`  Total: ${total} bytes  (Lambda limit: ${LIMIT_BYTES} bytes)`);
console.log(total > LIMIT_BYTES ? '  STATUS: OVER LIMIT — set large vars to "Builds only" in Netlify.' : '  STATUS: Under limit.');
console.log('');
console.log('Largest variables (set these to "Builds only" in Netlify if over limit):');
entries.slice(0, 15).forEach((e) => {
  const preview = e.value.length > 40 ? e.value.slice(0, 40) + '…' : e.value;
  console.log(`  ${e.size.toString().padStart(5)}  ${e.key}`);
});

if (total > LIMIT_BYTES) {
  process.exitCode = 1;
}
