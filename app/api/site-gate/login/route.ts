export const runtime = 'nodejs';

import { cookies } from 'next/headers';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

const COOKIE_NAME = 'we:site_gate:v1';

function isEnabled() {
  const v = String(process.env.SITE_GATE_ENABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function expectedToken(): string | null {
  // Check for explicit token first
  const explicitToken = String(process.env.SITE_GATE_TOKEN || '').trim();
  if (explicitToken) {
    return explicitToken;
  }
  // Fall back to password-based token (normalized)
  const passwordEnv = String(process.env.SITE_GATE_PASSWORD || '').trim();
  if (!passwordEnv) {
    return null;
  }
  // CRITICAL: Normalize exactly the same way as layout.tsx
  // lowercase + remove ALL whitespace (spaces, tabs, newlines, etc)
  const normalized = passwordEnv.toLowerCase().replace(/\s+/g, '');
  return normalized ? `pw:${normalized}` : null;
}

export async function POST(req: Request) {
  if (!isEnabled()) {
    return json({ error: 'Site gate is disabled' }, { status: 400 });
  }

  const passwordEnv = String(process.env.SITE_GATE_PASSWORD || '').trim();
  if (!passwordEnv) {
    return json({ error: 'SITE_GATE_PASSWORD is not set' }, { status: 503 });
  }

  const token = expectedToken();
  if (!token) {
    return json({ error: 'SITE_GATE_TOKEN/SITE_GATE_PASSWORD misconfigured' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const password = String(body?.password || '').trim();
  const next = String(body?.next || '/').trim() || '/';

  if (!password) {
    return json({ error: 'Password is required' }, { status: 401 });
  }

  // Normalize both passwords: lowercase and remove all whitespace
  const normalizedProvided = password.toLowerCase().replace(/\s+/g, '');
  const normalizedExpected = passwordEnv.toLowerCase().replace(/\s+/g, '');
  
  // Always log for debugging (visible in Netlify function logs)
  console.log('[Site Gate] Password check:', {
    providedRaw: password,
    expectedRaw: passwordEnv,
    normalizedProvided,
    normalizedExpected,
    match: normalizedProvided === normalizedExpected,
    token: token ? `${token.substring(0, 10)}***` : '(none)',
    tokenFull: token, // Log full token for debugging (will be visible in server logs only)
  });
  
  if (normalizedProvided !== normalizedExpected) {
    return json({ 
      error: 'Invalid password. Please check your password and try again.',
      // Always show debug info to help diagnose
      debug: {
        providedLength: password.length,
        expectedLength: passwordEnv.length,
        normalizedProvided,
        normalizedExpected,
        match: false,
      }
    }, { status: 401 });
  }
  
  // Verify token generation is correct
  // If using password-based token, verify it matches what we'd generate
  if (!process.env.SITE_GATE_TOKEN) {
    const expectedTokenFromNormalized = `pw:${normalizedExpected}`;
    if (token !== expectedTokenFromNormalized) {
      console.error('[Site Gate] CRITICAL: Token generation mismatch!', {
        tokenFromFunction: token,
        tokenFromNormalized: expectedTokenFromNormalized,
        passwordEnv,
        normalizedExpected,
      });
      // Use the correct token
      const correctToken = expectedTokenFromNormalized;
      // Continue with correct token
    }
  }

  // Set cookie using Next.js cookies() API for proper server-side handling
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  return json(
    { ok: true, redirect: next },
    {
      status: 200,
    }
  );
}

