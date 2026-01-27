/**
 * POST /api/marketing/newsletter/subscribe
 *
 * Secure newsletter subscription endpoint (Brevo).
 * - Validates email
 * - Light rate limit (per-IP in-memory)
 * - Creates/updates Brevo contact and adds to list
 *
 * Brevo Create Contact:
 * POST https://api.brevo.com/v3/contacts
 * Headers:
 *   accept: application/json
 *   api-key: process.env.BREVO_API_KEY
 *   content-type: application/json
 */

import { z } from 'zod';

const bodySchema = z.object({
  email: z.string().email(),
  source: z.string().max(64).optional(),
});

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

// Very light in-memory rate limit (best-effort on serverless)
const rl = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000; // 1 min
const MAX_REQ = 10; // per window per IP

function getIp(req: Request): string {
  // Netlify / proxies commonly set x-forwarded-for.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const cur = rl.get(key);
  if (!cur || cur.resetAt <= now) {
    rl.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  cur.count += 1;
  rl.set(key, cur);
  return cur.count > MAX_REQ;
}

async function brevoCreateContact(payload: any): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': process.env.BREVO_API_KEY || '',
    },
    body: JSON.stringify(payload),
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return { ok: res.ok, status: res.status, body };
}

export async function POST(request: Request) {
  try {
    if (!process.env.BREVO_API_KEY) {
      return json({ ok: false, error: 'Brevo is not configured' }, { status: 503 });
    }
    const listIdRaw = process.env.BREVO_NEWSLETTER_LIST_ID;
    const listId = listIdRaw ? Number(listIdRaw) : NaN;
    if (!Number.isFinite(listId)) {
      return json({ ok: false, error: 'Brevo list is not configured' }, { status: 503 });
    }

    const ip = getIp(request);
    if (isRateLimited(ip)) {
      return json({ ok: false, error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ ok: false, error: 'Invalid email' }, { status: 400 });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const source = (parsed.data.source || 'popup').trim().slice(0, 64);

    const basePayload: any = {
      email,
      listIds: [listId],
      updateEnabled: true,
      attributes: {
        SOURCE: source,
        SITE: 'agchange.com',
      },
    };

    // Try with attributes first; if Brevo rejects unknown attributes, retry without them.
    let result = await brevoCreateContact(basePayload);

    if (!result.ok && result.status === 400) {
      const msg = JSON.stringify(result.body || {});
      const looksLikeDuplicate =
        /duplicate|already exist|contact already/i.test(msg);
      if (looksLikeDuplicate) {
        return json({ ok: true });
      }

      const looksLikeAttributeError =
        /attribute|attributes|invalid_parameter/i.test(msg);
      if (looksLikeAttributeError) {
        const { attributes, ...withoutAttrs } = basePayload;
        result = await brevoCreateContact(withoutAttrs);
        if (result.ok) {
          return json({ ok: true });
        }
      }
    }

    if (!result.ok) {
      // Avoid leaking Brevo details to user; log only in dev.
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[brevo] subscribe failed', result.status, result.body);
      }
      return json({ ok: false, error: 'Subscription failed. Please try again.' }, { status: 500 });
    }

    return json({ ok: true });
  } catch (error: any) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[brevo] subscribe exception', error);
    }
    return json({ ok: false, error: 'Subscription failed. Please try again.' }, { status: 500 });
  }
}

