/**
 * POST /api/admin/notifications/emit
 * Admin-only: emits a test notification event (no direct sending).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { getAdminAuth } from '@/lib/firebase/admin';
import { isAdminUid } from '../_admin';
import { notificationEventPayloadSchema, notificationEventTypeSchema } from '@/lib/notifications/schemas';
import { emitEventForUser } from '@/lib/notifications/emitEvent';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

const bodySchema = z.object({
  type: notificationEventTypeSchema,
  targetUserId: z.string().min(1),
  entityType: z.enum(['listing', 'order', 'user', 'message_thread', 'system']),
  entityId: z.string().min(1),
  payload: z.unknown(),
  // Allows multiple "test" emits for the same entity/user by changing eventKey.
  nonce: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  let auth: ReturnType<typeof getAdminAuth>;
  try {
    auth = getAdminAuth();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const token = authHeader.slice('Bearer '.length);

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const claimRole = (decoded as any)?.role;
  const claimSuper = (decoded as any)?.superAdmin === true;
  const claimIsAdmin = claimRole === 'admin' || claimRole === 'super_admin' || claimSuper;
  const docIsAdmin = claimIsAdmin ? true : await isAdminUid(uid);
  if (!docIsAdmin) return json({ ok: false, error: 'Admin access required' }, { status: 403 });

  let raw: any;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ ok: false, error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });

  const payloadParsed = notificationEventPayloadSchema.safeParse(parsed.data.payload);
  if (!payloadParsed.success) {
    return json({ ok: false, error: 'Invalid payload', issues: payloadParsed.error.issues }, { status: 400 });
  }
  if (payloadParsed.data.type !== parsed.data.type) {
    return json({ ok: false, error: 'Payload type must match event type' }, { status: 400 });
  }

  const res = await emitEventForUser({
    type: parsed.data.type,
    actorId: uid,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    targetUserId: parsed.data.targetUserId,
    payload: payloadParsed.data as any,
    optionalHash: parsed.data.nonce ? `test:${parsed.data.nonce}` : 'test',
    test: true,
  });

  if (!res.ok) return json({ ok: false, error: res.error || 'Failed to emit event' }, { status: 500 });
  return json({ ok: true, created: res.created, eventId: res.eventId, eventKey: res.eventKey });
}

