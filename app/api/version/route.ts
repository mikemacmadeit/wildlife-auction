/**
 * GET /api/version
 *
 * Lightweight endpoint to confirm what build/deploy is live in an environment.
 * Useful when diagnosing Netlify deploy drift (e.g., API route 404s in prod).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { BUILD_INFO } from '@/lib/build-info';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET() {
  return json({
    ok: true,
    build: BUILD_INFO,
    // Netlify
    netlify: {
      context: process.env.CONTEXT || null,
      deployId: process.env.DEPLOY_ID || null,
      deployUrl: process.env.DEPLOY_URL || null,
      url: process.env.URL || null,
      commitRef: process.env.COMMIT_REF || null,
      branch: process.env.BRANCH || null,
    },
    // General
    nodeEnv: process.env.NODE_ENV || null,
    ts: new Date().toISOString(),
  });
}

