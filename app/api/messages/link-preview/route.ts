/**
 * POST /api/messages/link-preview
 *
 * Server-side link preview (OpenGraph) so the client can show rich previews
 * without browser CORS issues.
 *
 * Security:
 * - Requires Firebase auth (prevents open proxy abuse)
 * - Rejects non-http(s) URLs
 * - Blocks localhost/private IP ranges by hostname pattern (basic SSRF hardening)
 * - Timeouts + response size limits
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getAdminAuth } from '@/lib/firebase/admin';

type Preview = {
  url: string;
  finalUrl?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
}

function isBlockedHostname(hostname: string): boolean {
  const h = String(hostname || '').toLowerCase().trim();
  if (!h) return true;
  // Basic SSRF hardening by hostname pattern.
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0' || h === '127.0.0.1' || h.startsWith('127.')) return true;
  if (h.startsWith('10.')) return true;
  if (h.startsWith('192.168.')) return true;
  // 172.16.0.0–172.31.255.255
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  // Link-local / metadata common targets
  if (h === '169.254.169.254') return true;
  return false;
}

function normalizeUrl(raw: string): URL | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const withProto = s.startsWith('http://') || s.startsWith('https://') ? s : s.startsWith('www.') ? `https://${s}` : s;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (isBlockedHostname(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

function extractMeta(html: string): Preview {
  // Small meta parser (no deps). Good enough for og:title/og:description/og:image.
  const pick = (re: RegExp): string | undefined => {
    const m = html.match(re);
    if (!m) return undefined;
    const v = (m[1] || '').trim();
    return v ? v : undefined;
  };
  const title =
    pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pick(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pick(/<title[^>]*>([^<]+)<\/title>/i);
  const description =
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const image =
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const siteName = pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  return { url: '', title, description, image, siteName };
}

const cache = new Map<string, { atMs: number; value: Preview }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function POST(request: Request) {
  // Auth required to avoid turning this into an open proxy.
  let auth: ReturnType<typeof getAdminAuth>;
  try {
    auth = getAdminAuth();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    await auth.verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const rawUrl = typeof body?.url === 'string' ? body.url : '';
  const u = normalizeUrl(rawUrl);
  if (!u) return json({ ok: false, error: 'Invalid or blocked URL' }, { status: 400 });

  const key = u.toString();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.atMs < CACHE_TTL_MS) {
    return json({ ok: true, cached: true, preview: cached.value });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const res = await fetch(key, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Some sites block empty UA
        'user-agent': 'WildlifeExchangeBot/1.0 (link preview)',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    const contentType = String(res.headers.get('content-type') || '');
    if (!contentType.toLowerCase().includes('text/html')) {
      const preview: Preview = { url: key, finalUrl: res.url || key };
      cache.set(key, { atMs: Date.now(), value: preview });
      return json({ ok: true, preview });
    }

    // Size limit: read up to 200KB
    const buf = await res.arrayBuffer();
    const max = 200 * 1024;
    const slice = buf.byteLength > max ? buf.slice(0, max) : buf;
    const html = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    const meta = extractMeta(html);

    const preview: Preview = {
      url: key,
      finalUrl: res.url || key,
      title: meta.title,
      description: meta.description,
      image: meta.image,
      siteName: meta.siteName,
    };

    cache.set(key, { atMs: Date.now(), value: preview });
    return json({ ok: true, preview });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to fetch preview', message: e?.message || String(e) }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

