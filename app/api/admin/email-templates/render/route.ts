/**
 * POST /api/admin/email-templates/render
 *
 * Admin-only: renders transactional email HTML from the local template registry.
 * IMPORTANT:
 * - Preview only: does NOT send email.
 * - Must NOT import sender/billing providers.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { listEmailEvents, renderEmail, validatePayload, type EmailEventType } from '@/lib/email';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

async function isAdminUid(uid: string): Promise<boolean> {
  const db = getAdminDb();
  const doc = await db.collection('users').doc(uid).get();
  const role = doc.exists ? (doc.data() as any)?.role : null;
  const superAdmin = doc.exists ? (doc.data() as any)?.superAdmin : null;
  return role === 'admin' || role === 'super_admin' || superAdmin === true;
}

const bodySchema = z.object({
  event: z.string().min(1),
  payload: z.unknown(),
});

export async function POST(request: Request) {
  // Rate limiting (admin)
  const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
  const rateLimitResult = await rateLimitCheck(request as any);
  if (!rateLimitResult.allowed) {
    return json(rateLimitResult.body, {
      status: rateLimitResult.status,
      headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
    });
  }

  // Firebase Admin init (hardened, Netlify-safe)
  let auth: ReturnType<typeof getAdminAuth>;
  try {
    auth = getAdminAuth();
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: 'Server is not configured to render email templates yet',
        code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
        message: e?.message || 'Failed to initialize Firebase Admin SDK',
        missing: e?.missing || undefined,
      },
      { status: 503 }
    );
  }

  // Auth
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.split('Bearer ')[1];
  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return json({ ok: false, error: 'Unauthorized - Invalid token' }, { status: 401 });
  }

  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  // Admin check: prefer claims; fall back to user doc role.
  const claimRole = (decoded as any)?.role;
  const claimSuper = (decoded as any)?.superAdmin === true;
  const claimIsAdmin = claimRole === 'admin' || claimRole === 'super_admin' || claimSuper;
  const docIsAdmin = claimIsAdmin ? true : await isAdminUid(uid);
  if (!docIsAdmin) {
    return json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  // Body parse
  let raw: any;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsedBody = bodySchema.safeParse(raw);
  if (!parsedBody.success) {
    return json({ ok: false, error: 'Invalid request body', details: parsedBody.error.issues }, { status: 400 });
  }

  const event = String(parsedBody.data.event) as EmailEventType;
  const payload = parsedBody.data.payload;

  const validEvents = new Set(listEmailEvents().map((e) => e.type));
  if (!validEvents.has(event)) {
    return json(
      {
        ok: false,
        error: 'Unknown email event type',
        code: 'UNKNOWN_EVENT',
        validEvents: Array.from(validEvents),
      },
      { status: 400 }
    );
  }

  // Validate payload for this event (zod issues returned)
  const validated = validatePayload(event, payload);
  if (!validated.ok) {
    return json(
      {
        ok: false,
        error: 'Payload does not match schema',
        code: 'INVALID_PAYLOAD',
        issues: validated.errors,
      },
      { status: 400 }
    );
  }

  // Render HTML
  try {
    const { subject, preheader, html } = renderEmail(event, validated.data);
    return json({ ok: true, subject, preheader, html });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: 'Failed to render template',
        code: 'RENDER_FAILED',
        message: e?.message || String(e),
      },
      { status: 500 }
    );
  }
}

