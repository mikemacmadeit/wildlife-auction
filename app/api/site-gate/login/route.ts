export const runtime = 'nodejs';

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
  
  // Ensure token matches normalized password (double-check)
  const finalToken = !process.env.SITE_GATE_TOKEN ? `pw:${normalizedExpected}` : token;
  
  // Set cookie using manual header (original working method)
  // Cookie value is URL-encoded, layout will decode it
  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(finalToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
    `Max-Age=${7 * 24 * 60 * 60}`,
  ]
    .filter(Boolean)
    .join('; ');

  console.log('[Site Gate] Setting cookie:', {
    cookieName: COOKIE_NAME,
    token: finalToken ? `${finalToken.substring(0, 15)}***` : '(none)',
    tokenLength: finalToken?.length || 0,
    encoded: encodeURIComponent(finalToken).substring(0, 20),
  });

  return json(
    { ok: true, redirect: next },
    {
      status: 200,
      headers: {
        'Set-Cookie': cookie,
      },
    }
  );
}

