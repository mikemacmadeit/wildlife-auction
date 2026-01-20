/**
 * POST /api/support/contact
 *
 * Public contact form -> creates a support ticket for admins.
 * - Does NOT require auth (but will associate userId if Bearer token is present/valid).
 * - Rate limited (durable in prod via Upstash).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { getRequestMeta, json } from '@/app/api/admin/_util';

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(10).max(5000),
  listingId: z.string().trim().max(128).optional(),
  orderId: z.string().trim().max(128).optional(),
  // Honeypot: should be empty (bots often fill it)
  website: z.string().trim().max(200).optional(),
});

export async function POST(request: Request) {
  // Rate limiting (spam control)
  const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.support);
  const rateLimitResult = await rateLimitCheck(request as any);
  if (!rateLimitResult.allowed) {
    return json(rateLimitResult.body, {
      status: rateLimitResult.status,
      headers: { 'Retry-After': rateLimitResult.body.retryAfter?.toString() || '60' },
    });
  }

  // Admin SDK (for writes)
  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: 'Server not configured',
        code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
        message: e?.message,
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: 'Validation error',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 }
    );
  }

  // Honeypot triggered
  if (parsed.data.website && parsed.data.website.length > 0) {
    return json({ ok: true, ticketId: null }, { status: 200 });
  }

  // Optional auth association
  let userId: string | null = null;
  let decoded: any = null;
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);
    try {
      decoded = await auth.verifyIdToken(token);
      userId = decoded?.uid || null;
    } catch {
      // ignore invalid tokens for public contact
      userId = null;
      decoded = null;
    }
  }

  const now = Timestamp.now();
  const { ip, userAgent } = getRequestMeta(request);

  const docRef = db.collection('supportTickets').doc();
  await docRef.set(
    {
      ticketId: docRef.id,
      status: 'open',
      source: 'contact_form',
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
      ...(parsed.data.listingId ? { listingId: parsed.data.listingId } : {}),
      ...(parsed.data.orderId ? { orderId: parsed.data.orderId } : {}),
      ...(userId ? { userId } : {}),
      // Non-PII metadata (best-effort). Avoid storing full IP in plain text.
      meta: {
        hasAuth: !!userId,
        emailVerified: decoded?.email_verified === true ? true : undefined,
        ipPresent: !!ip,
        userAgent: userAgent ? String(userAgent).slice(0, 200) : undefined,
      },
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return json({ ok: true, ticketId: docRef.id }, { status: 201 });
}

