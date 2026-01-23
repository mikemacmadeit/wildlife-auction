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
  const t = String(process.env.SITE_GATE_TOKEN || '').trim();
  if (t) return t;
  const p = String(process.env.SITE_GATE_PASSWORD || '').trim();
  return p ? `pw:${p}` : null;
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

  // EXACT original password check - case sensitive
  if (!password || password !== passwordEnv) {
    console.log('[Site Gate] Password mismatch:', {
      provided: password,
      expected: passwordEnv,
      providedLength: password.length,
      expectedLength: passwordEnv.length,
      match: password === passwordEnv,
    });
    return json({ error: 'Invalid password' }, { status: 401 });
  }

  // httpOnly cookie so it's not readable by JS.
  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    // Use Secure in production so cookie only travels over HTTPS.
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
    // 7 days
    `Max-Age=${7 * 24 * 60 * 60}`,
  ]
    .filter(Boolean)
    .join('; ');

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
