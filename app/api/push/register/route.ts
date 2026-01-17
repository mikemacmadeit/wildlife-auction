/**
 * POST /api/push/register
 *
 * Registers an FCM token for the authenticated user.
 *
 * Body: { token: string; platform?: string }
 */

import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { stableHash } from '@/lib/notifications/eventKey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

const bodySchema = z.object({
  token: z.string().min(20),
  platform: z.string().max(32).optional(),
});

export async function POST(request: Request) {
  // Firebase Admin init (hardened)
  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: 'Server is not configured to register push tokens yet',
        code: e?.code || 'FIREBASE_ADMIN_INIT_FAILED',
        message: e?.message || 'Failed to initialize Firebase Admin SDK',
      },
      { status: 503 }
    );
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

  let raw: any;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ ok: false, error: 'Invalid token' }, { status: 400 });

  const fcmToken = parsed.data.token.trim();
  const platform = parsed.data.platform?.trim().slice(0, 32) || null;
  const tokenId = stableHash(fcmToken).slice(0, 32);

  const ref = db.collection('users').doc(uid).collection('pushTokens').doc(tokenId);
  await ref.set(
    {
      token: fcmToken,
      platform,
      createdAt: Timestamp.now(),
      lastSeenAt: Timestamp.now(),
    },
    { merge: true }
  );

  return json({ ok: true, tokenId });
}

