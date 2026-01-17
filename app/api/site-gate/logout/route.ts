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

export async function POST() {
  const cookie = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
    'Max-Age=0',
  ]
    .filter(Boolean)
    .join('; ');

  return json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': cookie,
      },
    }
  );
}

